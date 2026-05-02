// ACW v1 — workspace persistence (localStorage, schemaVersion acw-1.0).
//
// One AcwWorkspace document per browser, persisted under
// `acw.workspace.v1`. Same allow-list / freeze / read-validate
// discipline used by `portfolioStore.ts` and `signalsStore.ts`.
//
// Constitutional guarantees:
//   - PH6-HC2: this module persists workspace structure only. It
//     does not read or write any ADC / portfolio / signals / Phase 6
//     state, and the ACW isolation invariant
//     (`acwIsolationInvariants.test-shape.ts`) statically verifies
//     no such import is added.
//   - The schema version is locked to `"acw-1.0"`. Any future
//     structural change requires an explicit `acw-2.0` (master
//     prompt §13: silent rule drift forbidden).
//   - Every authoring path goes through the validator
//     (`acwValidator.ts`). Validator-refused operations leave the
//     persisted workspace unchanged.
//
// The store exposes a small subscriber API so React lens views can
// re-render on workspace mutations without coupling to the storage
// mechanism.
import {
  isAcwDomainTag,
  isAcwElementType,
  isAcwBoundParamShape,
  isAcwLodRangeShape,
  type AcwBoundParam,
  type AcwDomainTag,
  type AcwElementType,
  type AcwExplicitEdgeKind,
} from "./acwGrammar";
import {
  isAcwNodeStatus,
  isAcwNodeMaturity,
  isAcwNodePriority,
  type AcwNodeStatus,
  type AcwNodeMaturity,
  type AcwNodePriority,
} from "./acwNodeProperties";
import {
  canCreateEdge,
  canCreateNode,
  validateOperation,
  type ValidationResult,
  type ValidatorWorkspaceView,
} from "./acwValidator";

import {
  resolveActiveKey,
  currentScope,
} from "@/governance/storageKeyUtils";
import {
  readScoped,
  writeScoped,
  onScopeOrHydrationChange,
  __resetScopedStorageForTest,
} from "@/governance/scopedStorageClient";

export const ACW_SCHEMA_VERSION = "acw-1.0" as const;

// CTAD Phase 3 — Multi-Diagram Logical Design.
//
// Closed enum for the diagram surface a node was authored on. The
// CTAD design canvas filters by this so switching diagram modes
// hides nodes from the other modes without losing them. The string
// values are intentionally lower-case so a future serialised
// document remains stable across casing edits to the palette.
//
// Declared inside `acwStore` (not in CTAD) because the read-
// validator needs the predicate on every workspace load and the
// ACW isolation invariant forbids ACW source from importing CTAD
// modules. The CTAD palette imports the type from here.
export const ACW_DIAGRAM_TYPES = [
  "bpmn",
  "erd",
  "ddl",
  "sequence",
  "class",
] as const;
export type AcwDiagramType = (typeof ACW_DIAGRAM_TYPES)[number];

export function isAcwDiagramType(value: unknown): value is AcwDiagramType {
  return (
    typeof value === "string" &&
    (ACW_DIAGRAM_TYPES as readonly string[]).includes(value)
  );
}

export interface AcwLogicalPosition {
  readonly x: number;
  readonly y: number;
}

export function isAcwLogicalPositionShape(
  value: unknown,
): value is AcwLogicalPosition {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 2) return false;
  if (typeof o.x !== "number" || typeof o.y !== "number") return false;
  return Number.isFinite(o.x) && Number.isFinite(o.y);
}

export function isAcwBoundRequirementIdsShape(
  value: unknown,
): value is readonly string[] {
  if (!Array.isArray(value)) return false;
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0) return false;
  }
  return true;
}

export function isAcwLogicalStyleShape(
  value: unknown,
): value is Readonly<Record<string, string>> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof k !== "string" || k.length === 0) return false;
    if (typeof v !== "string") return false;
  }
  return true;
}
// Phase 2 (SaaS Onboarding) — Org+WorkItem scope. Each Work Item
// owns its own ACW workspace document; switching Work Items must
// surface a different graph.
export const BASE_STORAGE_KEY = "acw.workspace.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}

// ---------------------------------------------------------------------------
// Document shape
// ---------------------------------------------------------------------------
export interface AcwNode {
  readonly id: string;
  readonly type: AcwElementType;
  readonly parentId: string | null;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  // Phase 5 — optional technology-aware semantic binding. Older
  // documents persisted before Phase 5 simply omit these fields;
  // the read-validator widens the node allow-list to accept their
  // absence and to accept their presence in the new shape. Both
  // fields default to undefined.
  readonly boundParam?: AcwBoundParam;
  readonly boundTechnologyCategory?: string;
  // EAStudio Phase 1 — optional domain markers. `domainTag` records
  // which of the four EAStudio domains a node belongs to (UI
  // categorisation only — the validator has no opinion). When
  // `isDomainContainer` is true the node is one of the four
  // immutable domain container nodes seeded at workspace
  // initialisation; UI surfaces hide the delete affordance for it
  // and the seed routine refuses to recreate it. Both fields are
  // optional and absent on every pre-EAStudio document.
  readonly isDomainContainer?: boolean;
  readonly domainTag?: AcwDomainTag;
  // EAStudio Phase 2 — descriptive properties surfaced by the
  // Properties panel. Each field is optional and additive on the
  // v1 node shape; absence reads identically to a pre-Phase-2
  // document. None of these values affect validator legality, but
  // the read-validator still rejects malformed values (empty
  // strings, unknown enum values, wrong types) so a future caller
  // cannot smuggle bad data past the storage boundary.
  readonly description?: string;
  readonly owner?: string;
  readonly status?: AcwNodeStatus;
  readonly maturity?: AcwNodeMaturity;
  readonly priority?: AcwNodePriority;
  // EAStudio Phase 2 (LoS framework) — optional Level-of-
  // Specification range. A 2-tuple of integers in [1, 3] with
  // `lodRange[0] <= lodRange[1]`. Absence reads as `[1, 3]`
  // (visible at every level), so every pre-Phase-2 graph reads
  // cleanly. The lens visibility filter
  // (`enumerateLensVisibility`) consults this when the EAStudio
  // shell passes a `currentLodLevel`.
  //
  // Conventions established by the L3 generator:
  //   - L1 / L2 nodes the user authors directly never carry the
  //     field (they default to [1, 3] and are visible at every
  //     level).
  //   - L3-only nodes generated by `acw/l3/l3Generator.ts` carry
  //     `lodRange: [3, 3]` so they are hidden at L1 / L2 and
  //     surface only when the shell switches to the Technology
  //     LoS.
  readonly lodRange?: readonly [number, number];
  // EAStudio Path B Phase 3 — optional Organisational Unit binding.
  // The id of an `OrganisationalUnit` recorded in the separate
  // `acw.organisational-units.v1` registry (see
  // `acw/orgUnits/ouStore.ts`). Absence is the documented default
  // and reads as "no organisational unit"; presence is a non-empty
  // string. The validator has no opinion about which units exist
  // — the OU registry is a pure visual overlay — so a node may
  // hold an id that has since been removed from the registry. The
  // OU store cascades a clear via `updateNodeProperties` on its
  // own remove path so dangling references are the rare exception
  // rather than the rule.
  readonly organisationalUnitId?: string;
  // CTAD Phase 3 — Multi-Diagram Logical Design.
  //
  // Optional metadata stamped on a node when it is authored on the
  // CTAD design canvas. The schema version stays `acw-1.0` — every
  // field below is additive and absent on every pre-Phase-3
  // document, so the EAStudio canvas reads existing graphs
  // unchanged. Conversely, when present these fields are inert from
  // EAStudio's point of view: the EAStudio render code does not key
  // off them, the validator has no opinion about them, and they are
  // preserved verbatim through `updateNodeProperties` /
  // `updateNodePosition` so a CTAD-authored node survives a round
  // trip through the EAStudio surface unchanged.
  //
  //   - `diagramType` — closed enum identifying which CTAD diagram
  //     surface authored this node. Filtering by this value lets
  //     the design canvas hide nodes from the other diagrams
  //     without losing them.
  //   - `diagramSubtype` — free-form label identifying the palette
  //     tile (e.g. `"pool"`, `"task"`, `"entity"`, `"primary-key"`).
  //     The validator only checks the field is a non-empty string;
  //     the palette registry owns the closed set and asserts every
  //     value passes the CTAD vocabulary tier at module load.
  //   - `boundRequirementIds` — ids in the requirements store this
  //     node has been linked to. Read-only one-way reference; the
  //     validator does not check the ids exist (the requirements
  //     store may be re-seeded or scope-switched).
  //   - `moduleId` — id in the module catalog this node maps to.
  //     Same one-way-read discipline as `boundRequirementIds`.
  //   - `logicalPosition` — separate `(x, y)` slot reserved for a
  //     future Phase where the logical diagram diverges from the
  //     EAStudio physical layout. Phase 3 still authors `x` / `y`
  //     directly; the field is persisted when a caller supplies it.
  //   - `logicalParentId` — separate `parentId` slot for the same
  //     reason. Phase 3 still uses the structural `parentId`; the
  //     field is persisted when supplied.
  //   - `logicalStyle` — free-form string-to-string record for
  //     diagram-specific render hints (e.g. `{ "stroke": "dashed" }`).
  //     The validator checks the shape; the canvas chooses how to
  //     interpret keys.
  readonly diagramType?: AcwDiagramType;
  readonly diagramSubtype?: string;
  readonly boundRequirementIds?: readonly string[];
  readonly moduleId?: string;
  readonly logicalPosition?: AcwLogicalPosition;
  readonly logicalParentId?: string;
  readonly logicalStyle?: Readonly<Record<string, string>>;
}

export interface AcwEdge {
  readonly id: string;
  readonly kind: AcwExplicitEdgeKind;
  readonly fromId: string;
  readonly toId: string;
  // CTAD Phase 3 — same diagram metadata as `AcwNode`. Edges
  // authored by the CTAD design canvas carry the same
  // `(diagramType, diagramSubtype)` pair as the nodes they connect
  // so the canvas filter can partition edges per diagram, and may
  // optionally cite the requirements they realise. Absent on every
  // pre-Phase-3 edge.
  readonly diagramType?: AcwDiagramType;
  readonly diagramSubtype?: string;
  readonly boundRequirementIds?: readonly string[];
}

export interface AcwStructureGraph {
  readonly nodes: readonly AcwNode[];
  readonly edges: readonly AcwEdge[];
}

export interface AcwWorkspace {
  readonly schemaVersion: typeof ACW_SCHEMA_VERSION;
  readonly structureGraph: AcwStructureGraph;
}

const ALLOWED_TOP_LEVEL = ["schemaVersion", "structureGraph"] as const;
const ALLOWED_GRAPH = ["nodes", "edges"] as const;
const ALLOWED_NODE = [
  "id",
  "type",
  "parentId",
  "label",
  "x",
  "y",
  // Phase 5 — optional semantic binding fields. Both are absent on
  // pre-Phase-5 documents; their absence reads as undefined.
  "boundParam",
  "boundTechnologyCategory",
  // EAStudio Phase 1 — optional domain markers. Both are absent on
  // every pre-EAStudio document; the read-validator accepts both
  // their absence and their well-formed presence.
  "isDomainContainer",
  "domainTag",
  // EAStudio Phase 2 — optional descriptive properties. All five
  // are absent on pre-Phase-2 documents; the read-validator
  // accepts both absence and well-formed presence.
  "description",
  "owner",
  "status",
  "maturity",
  "priority",
  // EAStudio Phase 2 (LoS framework) — optional Level-of-
  // Specification range. Absent on every pre-Phase-2 document; the
  // read-validator accepts both absence and well-formed presence.
  "lodRange",
  // EAStudio Path B Phase 3 — optional Organisational Unit binding.
  // Absent on every pre-Phase-3 document; the read-validator
  // accepts both absence and well-formed presence (a non-empty
  // string id).
  "organisationalUnitId",
  // CTAD Phase 3 (Multi-Diagram Logical Design) — optional
  // metadata stamped onto nodes the CTAD design canvas authors.
  // Every field is absent on every pre-Phase-3 document; the
  // read-validator accepts absence and well-formed presence and
  // rejects malformed values. The schema version stays
  // `acw-1.0` — this widening is purely additive on the v1
  // shape, so a build that pre-dates Phase 3 still loads every
  // Phase-3-authored document (it simply cannot re-validate the
  // new fields).
  "diagramType",
  "diagramSubtype",
  "boundRequirementIds",
  "moduleId",
  "logicalPosition",
  "logicalParentId",
  "logicalStyle",
] as const;
const ALLOWED_EDGE = [
  "id",
  "kind",
  "fromId",
  "toId",
  // CTAD Phase 3 — optional diagram metadata. Edges authored by
  // the CTAD design canvas carry the same `(diagramType,
  // diagramSubtype)` pair as the nodes they connect so the canvas
  // filter can partition edges per diagram. Absent on every
  // pre-Phase-3 edge.
  "diagramType",
  "diagramSubtype",
  "boundRequirementIds",
] as const;

const EXPLICIT_EDGE_KINDS = new Set<AcwExplicitEdgeKind>([
  "CONTAINS",
  "CONNECTS",
  "INTERFACES_WITH",
  "DATA_FLOW",
]);

// ---------------------------------------------------------------------------
// Validation (read + write)
// ---------------------------------------------------------------------------
function assertAllowedKeys(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  context: string,
): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(
        `ACW workspace ${context} contains forbidden field "${k}". Permitted fields: ${allowed.join(", ")}.`,
      );
    }
  }
}

function assertAllowedFields(workspace: unknown): void {
  if (workspace === null || typeof workspace !== "object") {
    throw new Error("ACW workspace must be an object.");
  }
  const w = workspace as Record<string, unknown>;
  assertAllowedKeys(w, ALLOWED_TOP_LEVEL, "document");
  if (w.schemaVersion !== ACW_SCHEMA_VERSION) {
    throw new Error(
      `ACW workspace schemaVersion must be "${ACW_SCHEMA_VERSION}". Got: ${JSON.stringify(w.schemaVersion)}.`,
    );
  }
  if (w.structureGraph === null || typeof w.structureGraph !== "object") {
    throw new Error("ACW workspace structureGraph must be an object.");
  }
  const g = w.structureGraph as Record<string, unknown>;
  assertAllowedKeys(g, ALLOWED_GRAPH, "structureGraph");
  if (!Array.isArray(g.nodes)) throw new Error("ACW structureGraph.nodes must be an array.");
  if (!Array.isArray(g.edges)) throw new Error("ACW structureGraph.edges must be an array.");
  const nodeIds = new Set<string>();
  for (const n of g.nodes) {
    if (n === null || typeof n !== "object") {
      throw new Error("ACW node must be an object.");
    }
    const node = n as Record<string, unknown>;
    assertAllowedKeys(node, ALLOWED_NODE, "node");
    if (typeof node.id !== "string" || node.id.length === 0) {
      throw new Error("ACW node.id must be a non-empty string.");
    }
    if (!isAcwElementType(node.type)) {
      throw new Error(`ACW node.type "${String(node.type)}" is not part of the workspace grammar.`);
    }
    if (node.parentId !== null && typeof node.parentId !== "string") {
      throw new Error("ACW node.parentId must be a string or null.");
    }
    if (typeof node.label !== "string") {
      throw new Error("ACW node.label must be a string.");
    }
    if (typeof node.x !== "number" || typeof node.y !== "number") {
      throw new Error("ACW node.x and node.y must be numbers.");
    }
    // Phase 5 — optional semantic binding shape. Absent (undefined)
    // is the pre-Phase-5 default and always permitted; present must
    // match the AcwBoundParam shape exactly via the grammar predicate.
    if (node.boundParam !== undefined) {
      if (!isAcwBoundParamShape(node.boundParam)) {
        throw new Error(
          "ACW node.boundParam, when present, must be an object with sectionId (string), paramId (string) and optionValue (string or null) fields only.",
        );
      }
    }
    if (node.boundTechnologyCategory !== undefined) {
      if (
        typeof node.boundTechnologyCategory !== "string" ||
        node.boundTechnologyCategory.length === 0
      ) {
        throw new Error(
          "ACW node.boundTechnologyCategory, when present, must be a non-empty string.",
        );
      }
    }
    // EAStudio Phase 1 — optional domain markers. Absent reads as
    // undefined (pre-EAStudio default); present must match the
    // declared shape exactly.
    if (node.isDomainContainer !== undefined) {
      if (typeof node.isDomainContainer !== "boolean") {
        throw new Error(
          "ACW node.isDomainContainer, when present, must be a boolean.",
        );
      }
    }
    if (node.domainTag !== undefined) {
      if (!isAcwDomainTag(node.domainTag)) {
        throw new Error(
          "ACW node.domainTag, when present, must be one of: business, data, application, technology, operations, external.",
        );
      }
    }
    // EAStudio Phase 2 — descriptive property shape checks.
    // Strings (description, owner) reject the empty string so the
    // Properties panel must clear an unset field by omitting the
    // key, not by writing "". Enums (status, maturity, priority)
    // are gated against their closed value sets via the predicates
    // exported from `acwNodeProperties`.
    if (node.description !== undefined) {
      if (typeof node.description !== "string" || node.description.length === 0) {
        throw new Error(
          "ACW node.description, when present, must be a non-empty string.",
        );
      }
    }
    if (node.owner !== undefined) {
      if (typeof node.owner !== "string" || node.owner.length === 0) {
        throw new Error(
          "ACW node.owner, when present, must be a non-empty string.",
        );
      }
    }
    if (node.status !== undefined && !isAcwNodeStatus(node.status)) {
      throw new Error(
        "ACW node.status, when present, must be one of: planned, active, deprecated.",
      );
    }
    if (node.maturity !== undefined && !isAcwNodeMaturity(node.maturity)) {
      throw new Error(
        "ACW node.maturity, when present, must be one of: initial, managed, defined, quantitatively-managed, optimizing.",
      );
    }
    if (node.priority !== undefined && !isAcwNodePriority(node.priority)) {
      throw new Error(
        "ACW node.priority, when present, must be one of: low, medium, high, critical.",
      );
    }
    // EAStudio Phase 2 (LoS framework) — optional Level-of-
    // Specification range. When present must be a 2-tuple of
    // integers in the closed interval [1, 3] with min <= max.
    // Absence is the documented default ([1, 3]).
    if (node.lodRange !== undefined) {
      if (!isAcwLodRangeShape(node.lodRange)) {
        throw new Error(
          "ACW node.lodRange, when present, must be a 2-tuple [min, max] of integers in [1, 3] with min <= max.",
        );
      }
    }
    // EAStudio Path B Phase 3 — optional Organisational Unit
    // binding. When present must be a non-empty string id.
    // Sealed domain containers (`isDomainContainer === true`) are
    // refused outright: they cannot carry descriptive properties,
    // and the OU `removeOu` cascade clears bindings via
    // `updateNodeProperties` which itself refuses sealed nodes —
    // so allowing OU on a sealed node would create an unreachable
    // dangling-binding hazard. Refusing here at the validator
    // boundary is the structural enforcement.
    if (node.organisationalUnitId !== undefined) {
      if (
        typeof node.organisationalUnitId !== "string" ||
        node.organisationalUnitId.length === 0
      ) {
        throw new Error(
          "ACW node.organisationalUnitId, when present, must be a non-empty string.",
        );
      }
      if (node.isDomainContainer === true) {
        throw new Error(
          "ACW node.organisationalUnitId is forbidden on sealed domain containers (isDomainContainer === true).",
        );
      }
    }
    // CTAD Phase 3 — Multi-Diagram Logical Design. Each field below
    // is independently optional; absence reads as undefined.
    if (
      node.diagramType !== undefined &&
      !isAcwDiagramType(node.diagramType)
    ) {
      throw new Error(
        "ACW node.diagramType, when present, must be one of: bpmn, erd, ddl, sequence, class.",
      );
    }
    if (node.diagramSubtype !== undefined) {
      if (
        typeof node.diagramSubtype !== "string" ||
        node.diagramSubtype.length === 0
      ) {
        throw new Error(
          "ACW node.diagramSubtype, when present, must be a non-empty string.",
        );
      }
    }
    if (
      node.boundRequirementIds !== undefined &&
      !isAcwBoundRequirementIdsShape(node.boundRequirementIds)
    ) {
      throw new Error(
        "ACW node.boundRequirementIds, when present, must be an array of non-empty strings.",
      );
    }
    if (node.moduleId !== undefined) {
      if (typeof node.moduleId !== "string" || node.moduleId.length === 0) {
        throw new Error(
          "ACW node.moduleId, when present, must be a non-empty string.",
        );
      }
    }
    if (
      node.logicalPosition !== undefined &&
      !isAcwLogicalPositionShape(node.logicalPosition)
    ) {
      throw new Error(
        "ACW node.logicalPosition, when present, must be an object with finite numeric x and y fields only.",
      );
    }
    if (node.logicalParentId !== undefined) {
      if (
        typeof node.logicalParentId !== "string" ||
        node.logicalParentId.length === 0
      ) {
        throw new Error(
          "ACW node.logicalParentId, when present, must be a non-empty string.",
        );
      }
    }
    if (
      node.logicalStyle !== undefined &&
      !isAcwLogicalStyleShape(node.logicalStyle)
    ) {
      throw new Error(
        "ACW node.logicalStyle, when present, must be a string-to-string record with non-empty keys.",
      );
    }
    nodeIds.add(node.id);
  }
  for (const e of g.edges) {
    if (e === null || typeof e !== "object") {
      throw new Error("ACW edge must be an object.");
    }
    const edge = e as Record<string, unknown>;
    assertAllowedKeys(edge, ALLOWED_EDGE, "edge");
    if (typeof edge.id !== "string" || edge.id.length === 0) {
      throw new Error("ACW edge.id must be a non-empty string.");
    }
    if (
      typeof edge.kind !== "string" ||
      !EXPLICIT_EDGE_KINDS.has(edge.kind as AcwExplicitEdgeKind)
    ) {
      throw new Error(`ACW edge.kind "${String(edge.kind)}" is not a permitted explicit edge kind.`);
    }
    if (typeof edge.fromId !== "string" || typeof edge.toId !== "string") {
      throw new Error("ACW edge.fromId and edge.toId must be strings.");
    }
    if (!nodeIds.has(edge.fromId) || !nodeIds.has(edge.toId)) {
      throw new Error("ACW edge endpoints must reference existing nodes.");
    }
    // CTAD Phase 3 — optional edge metadata.
    if (
      edge.diagramType !== undefined &&
      !isAcwDiagramType(edge.diagramType)
    ) {
      throw new Error(
        "ACW edge.diagramType, when present, must be one of: bpmn, erd, ddl, sequence, class.",
      );
    }
    if (edge.diagramSubtype !== undefined) {
      if (
        typeof edge.diagramSubtype !== "string" ||
        edge.diagramSubtype.length === 0
      ) {
        throw new Error(
          "ACW edge.diagramSubtype, when present, must be a non-empty string.",
        );
      }
    }
    if (
      edge.boundRequirementIds !== undefined &&
      !isAcwBoundRequirementIdsShape(edge.boundRequirementIds)
    ) {
      throw new Error(
        "ACW edge.boundRequirementIds, when present, must be an array of non-empty strings.",
      );
    }
  }

  // Grammar-consistency pass. The shape checks above guarantee field
  // allow-lists; this pass guarantees that the persisted document is
  // *also* well-formed under the v1 grammar (no orphan parent
  // references, no illegal containment, no illegal edges, no
  // self-loops). Any failure here causes the read path to drop the
  // tampered document back to an empty workspace, mirroring the
  // reduced-read-model discipline of `portfolioStore` and
  // `signalsStore`.
  const typedNodes = g.nodes as readonly AcwNode[];
  const typedEdges = g.edges as readonly AcwEdge[];
  const view: ValidatorWorkspaceView = {
    getNodeType(nodeId: string) {
      for (const n of typedNodes) {
        if (n.id === nodeId) return n.type;
      }
      return undefined;
    },
  };
  for (const node of typedNodes) {
    const r = canCreateNode(node.type, node.parentId, view);
    if (!r.ok) {
      throw new Error(
        `ACW persisted node "${node.id}" is not grammar-consistent: ${r.reason}`,
      );
    }
  }
  for (const edge of typedEdges) {
    const r = canCreateEdge(edge.kind, edge.fromId, edge.toId, view);
    if (!r.ok) {
      throw new Error(
        `ACW persisted edge "${edge.id}" is not grammar-consistent: ${r.reason}`,
      );
    }
  }
}

function isValidWorkspace(raw: unknown): raw is AcwWorkspace {
  try {
    assertAllowedFields(raw);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Empty document
// ---------------------------------------------------------------------------
function emptyWorkspace(): AcwWorkspace {
  return Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze([] as readonly AcwNode[]),
      edges: Object.freeze([] as readonly AcwEdge[]),
    }),
  });
}

// ---------------------------------------------------------------------------
// In-memory cache + subscribers
// ---------------------------------------------------------------------------
let cache: AcwWorkspace | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) {
    try {
      fn();
    } catch {
      // intentional no-op: subscribers are render hooks; we never
      // escalate from a notify path.
    }
  }
}

function readFromStorage(): AcwWorkspace {
  const raw = readScoped(getStorageKey());
  if (raw === null) return emptyWorkspace();
  try {
    const parsed = JSON.parse(raw);
    if (!isValidWorkspace(parsed)) return emptyWorkspace();
    return parsed;
  } catch {
    return emptyWorkspace();
  }
}

function writeToStorage(workspace: AcwWorkspace): void {
  assertAllowedFields(workspace);
  const key = getStorageKey();
  if (key === null) return;
  writeScoped(key, JSON.stringify(workspace));
}

// Phase 2 (SaaS Onboarding) — invalidate the in-memory workspace
// cache when the active scope changes so Work-Item switches and
// Org switches surface a different graph.
if (typeof window !== "undefined") {
  onScopeOrHydrationChange(() => {
    cache = null;
    notify();
  });
}

export function getWorkspace(): AcwWorkspace {
  if (cache === null) cache = readFromStorage();
  return cache;
}

export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Mutation API (every write goes through the validator)
// ---------------------------------------------------------------------------
function viewFor(workspace: AcwWorkspace): ValidatorWorkspaceView {
  const byId = new Map(workspace.structureGraph.nodes.map((n) => [n.id, n] as const));
  return {
    getNodeType(nodeId: string) {
      return byId.get(nodeId)?.type;
    },
    getNodeParentId(nodeId: string) {
      const n = byId.get(nodeId);
      if (n === undefined) return undefined;
      return n.parentId;
    },
    // EAStudio Phase 2 (Task #91) — surface `isDomainContainer` to
    // the validator so its sealed-endpoint refusal in `canCreateEdge`
    // sees the live store. The store no longer carries a parallel
    // pre-validator guard; the refusal text is single-source-of-
    // truth at validator scope.
    isSealed(nodeId: string) {
      return byId.get(nodeId)?.isDomainContainer === true;
    },
  };
}

function freshId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreateNodeRequest {
  readonly type: AcwElementType;
  readonly parentId: string | null;
  readonly label?: string;
  readonly x?: number;
  readonly y?: number;
  // Phase 5 — optional semantic binding fields. When present they
  // are persisted on the new node; when absent the node is created
  // unbound and renders exactly as a pre-Phase-5 node.
  readonly boundParam?: AcwBoundParam;
  readonly boundTechnologyCategory?: string;
  // EAStudio Phase 1 — optional domain markers. Used by the seed
  // routine to materialise the four immutable domain containers
  // and by the palette drop handler to mark the children of each
  // domain. Both fields are absent on every pre-EAStudio code path.
  readonly isDomainContainer?: boolean;
  readonly domainTag?: AcwDomainTag;
  // EAStudio Phase 1 — caller-supplied id. The seed routine needs
  // stable, well-known ids (`domain-business`, `domain-data`,
  // `domain-application`, `domain-technology`) so the EAStudio
  // canvas can address each container deterministically and so a
  // re-seed on a workspace that already contains them is a no-op
  // (the id collision short-circuits before any structural change).
  // Every other caller leaves this undefined and gets a freshId().
  readonly id?: string;
  // EAStudio Phase 2 (LoS framework) — optional Level-of-
  // Specification range. Forwarded into the new node verbatim
  // when present; absence persists no field, leaving the node
  // byte-identical to its pre-Phase-2 shape on disk. The L3
  // generator (`acw/l3/l3Generator.ts`) is the only caller in
  // tree today; future palette tiles may also opt in.
  readonly lodRange?: readonly [number, number];
  // EAStudio Path B Phase 3 — optional Organisational Unit
  // binding. Forwarded onto the new node when present; absence
  // persists no field. No caller wires this on creation today
  // (the binding is set after the fact via the Properties panel
  // or the right-click menu), but threading the field through
  // the request type keeps the createNode contract additive and
  // future-proof.
  readonly organisationalUnitId?: string;
  // CTAD Phase 3 — Multi-Diagram Logical Design. Each field is
  // forwarded onto the new node verbatim when present; absence
  // persists no field, leaving the node byte-identical to its
  // pre-Phase-3 shape on disk. The CTAD design canvas is the only
  // caller that wires these today.
  readonly diagramType?: AcwDiagramType;
  readonly diagramSubtype?: string;
  readonly boundRequirementIds?: readonly string[];
  readonly moduleId?: string;
  readonly logicalPosition?: AcwLogicalPosition;
  readonly logicalParentId?: string;
  readonly logicalStyle?: Readonly<Record<string, string>>;
}

export interface CreateEdgeRequest {
  readonly kind: AcwExplicitEdgeKind;
  readonly fromId: string;
  readonly toId: string;
  // CTAD Phase 3 — optional diagram metadata. Forwarded verbatim
  // when present; absence persists no field.
  readonly diagramType?: AcwDiagramType;
  readonly diagramSubtype?: string;
  readonly boundRequirementIds?: readonly string[];
}

export type StoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

// `createNode` carries an extra `id` field on success so callers
// (notably the v2 group affordance) can deterministically address
// the node they just created without scanning the workspace for
// "the most recently added Zone with no children" — a heuristic
// that drifts as soon as a pre-existing empty container is present.
export type CreateNodeResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export function createNode(req: CreateNodeRequest): CreateNodeResult {
  const ws = getWorkspace();
  const result: ValidationResult = validateOperation(
    { kind: "createNode", type: req.type, parentId: req.parentId },
    viewFor(ws),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  if (req.boundParam !== undefined && !isAcwBoundParamShape(req.boundParam)) {
    return {
      ok: false,
      reason: "boundParam, when supplied, must match the AcwBoundParam shape.",
    };
  }
  if (
    req.boundTechnologyCategory !== undefined &&
    (typeof req.boundTechnologyCategory !== "string" ||
      req.boundTechnologyCategory.length === 0)
  ) {
    return {
      ok: false,
      reason: "boundTechnologyCategory, when supplied, must be a non-empty string.",
    };
  }
  // EAStudio Phase 2 (LoS framework) — defensive shape check for
  // caller-supplied lodRange. The read-validator runs on persist
  // anyway, but rejecting here surfaces a precise refusal reason
  // to the caller instead of an opaque storage error.
  if (req.lodRange !== undefined && !isAcwLodRangeShape(req.lodRange)) {
    return {
      ok: false,
      reason:
        "lodRange, when supplied, must be a 2-tuple [min, max] of integers in [1, 3] with min <= max.",
    };
  }
  // EAStudio Phase 1 — defensive shape checks for caller-supplied
  // optional fields. The validator has no opinion about these so the
  // store must reject malformed values directly.
  if (
    req.isDomainContainer !== undefined &&
    typeof req.isDomainContainer !== "boolean"
  ) {
    return {
      ok: false,
      reason: "isDomainContainer, when supplied, must be a boolean.",
    };
  }
  if (req.domainTag !== undefined && !isAcwDomainTag(req.domainTag)) {
    return {
      ok: false,
      reason:
        "domainTag, when supplied, must be one of: business, data, application, technology, operations, external.",
    };
  }
  if (
    req.organisationalUnitId !== undefined &&
    (typeof req.organisationalUnitId !== "string" ||
      req.organisationalUnitId.length === 0)
  ) {
    return {
      ok: false,
      reason:
        "organisationalUnitId, when supplied, must be a non-empty string.",
    };
  }
  // CTAD Phase 3 — defensive shape checks for caller-supplied
  // multi-diagram fields. Mirrors the read-validator pass so a
  // malformed value surfaces a precise refusal reason at the
  // mutation entry point instead of an opaque storage error.
  if (req.diagramType !== undefined && !isAcwDiagramType(req.diagramType)) {
    return {
      ok: false,
      reason:
        "diagramType, when supplied, must be one of: bpmn, erd, ddl, sequence, class.",
    };
  }
  if (
    req.diagramSubtype !== undefined &&
    (typeof req.diagramSubtype !== "string" ||
      req.diagramSubtype.length === 0)
  ) {
    return {
      ok: false,
      reason: "diagramSubtype, when supplied, must be a non-empty string.",
    };
  }
  if (
    req.boundRequirementIds !== undefined &&
    !isAcwBoundRequirementIdsShape(req.boundRequirementIds)
  ) {
    return {
      ok: false,
      reason:
        "boundRequirementIds, when supplied, must be an array of non-empty strings.",
    };
  }
  if (
    req.moduleId !== undefined &&
    (typeof req.moduleId !== "string" || req.moduleId.length === 0)
  ) {
    return {
      ok: false,
      reason: "moduleId, when supplied, must be a non-empty string.",
    };
  }
  if (
    req.logicalPosition !== undefined &&
    !isAcwLogicalPositionShape(req.logicalPosition)
  ) {
    return {
      ok: false,
      reason:
        "logicalPosition, when supplied, must be { x: finite-number, y: finite-number }.",
    };
  }
  if (
    req.logicalParentId !== undefined &&
    (typeof req.logicalParentId !== "string" ||
      req.logicalParentId.length === 0)
  ) {
    return {
      ok: false,
      reason: "logicalParentId, when supplied, must be a non-empty string.",
    };
  }
  if (
    req.logicalStyle !== undefined &&
    !isAcwLogicalStyleShape(req.logicalStyle)
  ) {
    return {
      ok: false,
      reason:
        "logicalStyle, when supplied, must be a string-to-string record with non-empty keys.",
    };
  }
  if (req.id !== undefined) {
    if (typeof req.id !== "string" || req.id.length === 0) {
      return {
        ok: false,
        reason: "id, when supplied, must be a non-empty string.",
      };
    }
    // Idempotent seed: if a node with the requested stable id already
    // exists we return ok with that id and make no structural change.
    // This lets `ensureDomainContainers` run on every workspace open
    // without recreating containers or producing duplicate state.
    for (const existing of ws.structureGraph.nodes) {
      if (existing.id === req.id) {
        return { ok: true, id: req.id };
      }
    }
  }
  const id = req.id ?? freshId("node");
  // Object.freeze with conditional spread keeps every optional field
  // absent (undefined) rather than serialised as `null`, so a node
  // created without bindings or domain markers remains byte-identical
  // to its pre-extension shape on disk.
  const node: AcwNode = Object.freeze({
    id,
    type: req.type,
    parentId: req.parentId,
    label: req.label ?? req.type,
    x: typeof req.x === "number" ? req.x : 0,
    y: typeof req.y === "number" ? req.y : 0,
    ...(req.boundParam !== undefined ? { boundParam: req.boundParam } : {}),
    ...(req.boundTechnologyCategory !== undefined
      ? { boundTechnologyCategory: req.boundTechnologyCategory }
      : {}),
    ...(req.isDomainContainer !== undefined
      ? { isDomainContainer: req.isDomainContainer }
      : {}),
    ...(req.domainTag !== undefined ? { domainTag: req.domainTag } : {}),
    // EAStudio Phase 2 (LoS framework) — preserve lodRange when
    // supplied. Object.freeze on the inner tuple so a downstream
    // mutation cannot rewrite a node's visibility from outside the
    // validator-gated mutators.
    ...(req.lodRange !== undefined
      ? { lodRange: Object.freeze([req.lodRange[0], req.lodRange[1]] as const) }
      : {}),
    ...(req.organisationalUnitId !== undefined
      ? { organisationalUnitId: req.organisationalUnitId }
      : {}),
    // CTAD Phase 3 — preserve multi-diagram fields when supplied.
    // Object.freeze on the inner array / record so a downstream
    // mutation cannot rewrite the persisted shape from outside
    // the validator-gated mutators.
    ...(req.diagramType !== undefined ? { diagramType: req.diagramType } : {}),
    ...(req.diagramSubtype !== undefined
      ? { diagramSubtype: req.diagramSubtype }
      : {}),
    ...(req.boundRequirementIds !== undefined
      ? {
          boundRequirementIds: Object.freeze([...req.boundRequirementIds]),
        }
      : {}),
    ...(req.moduleId !== undefined ? { moduleId: req.moduleId } : {}),
    ...(req.logicalPosition !== undefined
      ? {
          logicalPosition: Object.freeze({
            x: req.logicalPosition.x,
            y: req.logicalPosition.y,
          }),
        }
      : {}),
    ...(req.logicalParentId !== undefined
      ? { logicalParentId: req.logicalParentId }
      : {}),
    ...(req.logicalStyle !== undefined
      ? { logicalStyle: Object.freeze({ ...req.logicalStyle }) }
      : {}),
  });
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze([...ws.structureGraph.nodes, node]),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true, id };
}

export function createEdge(req: CreateEdgeRequest): StoreResult {
  const ws = getWorkspace();
  // EAStudio Phase 2 (Task #91): sealed-endpoint refusal lives in
  // `canCreateEdge` itself — `viewFor` exposes `isSealed` so the
  // validator surfaces a single-source-of-truth refusal string for
  // sealed source, sealed destination, and sealed-to-sealed pairs.
  // The store no longer carries a parallel pre-validator guard.
  const result: ValidationResult = validateOperation(
    { kind: "createEdge", edgeKind: req.kind, fromId: req.fromId, toId: req.toId },
    viewFor(ws),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  // CTAD Phase 3 — defensive shape checks for caller-supplied edge
  // metadata. Mirrors the read-validator pass so a malformed value
  // surfaces a precise refusal reason at the mutation entry point.
  if (req.diagramType !== undefined && !isAcwDiagramType(req.diagramType)) {
    return {
      ok: false,
      reason:
        "diagramType, when supplied, must be one of: bpmn, erd, ddl, sequence, class.",
    };
  }
  if (
    req.diagramSubtype !== undefined &&
    (typeof req.diagramSubtype !== "string" ||
      req.diagramSubtype.length === 0)
  ) {
    return {
      ok: false,
      reason: "diagramSubtype, when supplied, must be a non-empty string.",
    };
  }
  if (
    req.boundRequirementIds !== undefined &&
    !isAcwBoundRequirementIdsShape(req.boundRequirementIds)
  ) {
    return {
      ok: false,
      reason:
        "boundRequirementIds, when supplied, must be an array of non-empty strings.",
    };
  }
  const edge: AcwEdge = Object.freeze({
    id: freshId("edge"),
    kind: req.kind,
    fromId: req.fromId,
    toId: req.toId,
    ...(req.diagramType !== undefined ? { diagramType: req.diagramType } : {}),
    ...(req.diagramSubtype !== undefined
      ? { diagramSubtype: req.diagramSubtype }
      : {}),
    ...(req.boundRequirementIds !== undefined
      ? {
          boundRequirementIds: Object.freeze([...req.boundRequirementIds]),
        }
      : {}),
  });
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: ws.structureGraph.nodes,
      edges: Object.freeze([...ws.structureGraph.edges, edge]),
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// v2 — drag-to-move position update.
//
// Position changes carry no grammar consequence: x and y are
// already-permitted node fields and the validator has no opinion
// about the numeric values they take. The mutation still routes
// through `writeToStorage`, which re-runs `assertAllowedFields` and
// the grammar-consistency pass on the resulting workspace, so a
// caller that smuggles a non-numeric value still gets refused at
// the storage boundary.
//
// Snap-to-grid is intentionally NOT applied here. The store records
// the canonical position the caller supplies; whether the caller
// chose to snap is a render-layer concern. That keeps the store
// agnostic to canvas geometry.
export function updateNodePosition(
  nodeId: string,
  x: number,
  y: number,
): StoreResult {
  const ws = getWorkspace();
  const positionCheck: ValidationResult = validateOperation(
    { kind: "updateNodePosition", x, y },
    viewFor(ws),
  );
  if (!positionCheck.ok) return { ok: false, reason: positionCheck.reason };
  const idx = ws.structureGraph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return { ok: false, reason: "The node referenced does not exist." };
  }
  const prev = ws.structureGraph.nodes[idx];
  if (prev.x === x && prev.y === y) return { ok: true };
  const updated: AcwNode = Object.freeze({ ...prev, x, y });
  const nodes = ws.structureGraph.nodes.slice();
  nodes[idx] = updated;
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// v2 — drag-to-reparent (and group-into-container).
//
// Reparenting is the only structural mutation v2 introduces. It
// MUST go through the v1 validator's `canCreateNode` predicate so
// the resulting parent / child pairing is grammar-well-formed; an
// illegal drag is refused and the persisted workspace is unchanged.
//
// Two extra invariants are enforced on top of the validator:
//   - the node must exist;
//   - the new parent (when not null) must not be a descendant of
//     the node, otherwise the containment hierarchy would form a
//     cycle. This is a structural concern the v1 validator does
//     not address (because v1 was append-only and could not
//     produce a cycle).
export function updateNodeParent(
  nodeId: string,
  newParentId: string | null,
): StoreResult {
  const ws = getWorkspace();
  const idx = ws.structureGraph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return { ok: false, reason: "The node referenced does not exist." };
  }
  const node = ws.structureGraph.nodes[idx];
  if (node.parentId === newParentId) return { ok: true };
  // Cycle check: walk the new parent's ancestor chain; if we hit
  // `nodeId` it means the move would make `nodeId` an ancestor of
  // itself.
  if (newParentId !== null) {
    const byId = new Map(ws.structureGraph.nodes.map((n) => [n.id, n] as const));
    let cursor: string | null = newParentId;
    while (cursor !== null) {
      if (cursor === nodeId) {
        return {
          ok: false,
          reason: "A node is not permitted to be contained within itself.",
        };
      }
      const next: AcwNode | undefined = byId.get(cursor);
      cursor = next?.parentId ?? null;
    }
  }
  const validation: ValidationResult = canCreateNode(
    node.type,
    newParentId,
    viewFor(ws),
  );
  if (!validation.ok) return { ok: false, reason: validation.reason };
  const updated: AcwNode = Object.freeze({ ...node, parentId: newParentId });
  const nodes = ws.structureGraph.nodes.slice();
  nodes[idx] = updated;
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// Phase 5 — semantic binding mutation.
//
// Updates the optional `boundParam` and `boundTechnologyCategory`
// fields on an existing node. Pass `undefined` for either argument
// to leave that field unchanged; pass `null` for `boundParam` to
// clear it. Structural fields (id, type, parentId, label, x, y) are
// never modified by this path. Re-runs the full read-validation
// (including `isAcwBoundParamShape`) on the resulting workspace via
// `writeToStorage`, so a malformed binding is refused at the
// storage boundary even if a future caller skips the in-line check.
export interface UpdateNodeBindingRequest {
  readonly boundParam?: AcwBoundParam | null;
  readonly boundTechnologyCategory?: string | null;
}

export function updateNodeBinding(
  nodeId: string,
  req: UpdateNodeBindingRequest,
): StoreResult {
  const ws = getWorkspace();
  const idx = ws.structureGraph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return { ok: false, reason: "The node referenced does not exist." };
  }
  if (
    req.boundParam !== undefined &&
    req.boundParam !== null &&
    !isAcwBoundParamShape(req.boundParam)
  ) {
    return {
      ok: false,
      reason: "boundParam, when supplied, must match the AcwBoundParam shape.",
    };
  }
  if (
    req.boundTechnologyCategory !== undefined &&
    req.boundTechnologyCategory !== null &&
    (typeof req.boundTechnologyCategory !== "string" ||
      req.boundTechnologyCategory.length === 0)
  ) {
    return {
      ok: false,
      reason: "boundTechnologyCategory, when supplied, must be a non-empty string.",
    };
  }
  const prev = ws.structureGraph.nodes[idx];
  // Build the next node by stripping the optional fields explicitly
  // when the caller asked for `null`, otherwise carrying them through.
  const nextBoundParam =
    req.boundParam === undefined ? prev.boundParam : req.boundParam ?? undefined;
  const nextBoundCategory =
    req.boundTechnologyCategory === undefined
      ? prev.boundTechnologyCategory
      : req.boundTechnologyCategory ?? undefined;
  // EAStudio Phase 2 hardening — preserve every additive optional
  // field already on `prev` (`isDomainContainer`, `domainTag`,
  // `description`, `owner`, `status`, `maturity`, `priority`).
  // Earlier revisions of this routine reconstructed the node from
  // a hard-coded subset (id/type/parentId/label/x/y + binding
  // fields), which silently dropped Phase 1/2 metadata if a sealed
  // container or property-bearing node was ever rebound. The fix:
  // start from `prev` minus the two binding fields (so a `null`
  // clear still removes them from the resulting object), then
  // overlay any new bound values.
  const {
    boundParam: _droppedBoundParam,
    boundTechnologyCategory: _droppedBoundCategory,
    ...preservedRest
  } = prev;
  void _droppedBoundParam;
  void _droppedBoundCategory;
  const updated: AcwNode = Object.freeze({
    ...preservedRest,
    ...(nextBoundParam !== undefined ? { boundParam: nextBoundParam } : {}),
    ...(nextBoundCategory !== undefined
      ? { boundTechnologyCategory: nextBoundCategory }
      : {}),
  });
  const nodes = ws.structureGraph.nodes.slice();
  nodes[idx] = updated;
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// EAStudio Phase 2 — descriptive-property mutation.
//
// Updates the optional `description`, `owner`, `status`, `maturity`,
// and `priority` fields on an existing node. Pass `undefined` for an
// argument to leave that field unchanged; pass `null` to clear it
// (the resulting node will not carry the field at all). Structural
// fields (id, type, parentId, label, x, y) and Phase 1 / Phase 5
// optionals are never modified by this path.
//
// All five fields are validator-inert (they have no effect on
// grammar legality), but the mutation still re-runs the full read-
// validation on the resulting workspace via `writeToStorage`. That
// re-validation is what rejects empty strings and unknown enum
// values at the storage boundary, so a future caller who skips the
// in-line predicate checks below is still refused.
//
// Sealed domain containers (`isDomainContainer === true`) are
// refused at this entry point. The Properties panel hides for
// those nodes; this guard is the defence in depth.
export interface UpdateNodePropertiesRequest {
  readonly description?: string | null;
  readonly owner?: string | null;
  readonly status?: AcwNodeStatus | null;
  readonly maturity?: AcwNodeMaturity | null;
  readonly priority?: AcwNodePriority | null;
  // EAStudio Path B Phase 3 — Organisational Unit binding. Pass
  // `undefined` to leave unchanged; pass `null` to clear; pass a
  // non-empty string to set. The validator has no opinion (the OU
  // registry is a separate visual-overlay store), but the read-
  // validation still rejects empty strings at the storage boundary.
  readonly organisationalUnitId?: string | null;
  // CTAD Phase 3 — Multi-Diagram Logical Design. Pass `undefined`
  // to leave unchanged; pass `null` to clear; pass a well-formed
  // value to set. `diagramType` and `diagramSubtype` are
  // intentionally omitted — they are stamped at creation time and
  // must not be edited after the fact (re-classifying a node into
  // a different diagram is a delete-and-recreate flow). The
  // validator has no opinion about the bound id sets (the
  // requirements / module catalog stores own that), but the read-
  // validation still rejects empty strings and malformed shapes
  // at the storage boundary.
  readonly boundRequirementIds?: readonly string[] | null;
  readonly moduleId?: string | null;
  readonly logicalPosition?: AcwLogicalPosition | null;
  readonly logicalParentId?: string | null;
  readonly logicalStyle?: Readonly<Record<string, string>> | null;
}

export function updateNodeProperties(
  nodeId: string,
  req: UpdateNodePropertiesRequest,
): StoreResult {
  const ws = getWorkspace();
  const idx = ws.structureGraph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return { ok: false, reason: "The node referenced does not exist." };
  }
  const prev = ws.structureGraph.nodes[idx];
  if (prev.isDomainContainer === true) {
    return {
      ok: false,
      reason:
        "The four sealed domain containers do not accept descriptive property edits.",
    };
  }
  if (req.description !== undefined && req.description !== null) {
    if (typeof req.description !== "string" || req.description.length === 0) {
      return {
        ok: false,
        reason: "description, when supplied, must be a non-empty string.",
      };
    }
  }
  if (req.owner !== undefined && req.owner !== null) {
    if (typeof req.owner !== "string" || req.owner.length === 0) {
      return {
        ok: false,
        reason: "owner, when supplied, must be a non-empty string.",
      };
    }
  }
  if (
    req.status !== undefined &&
    req.status !== null &&
    !isAcwNodeStatus(req.status)
  ) {
    return {
      ok: false,
      reason:
        "status, when supplied, must be one of: planned, active, deprecated.",
    };
  }
  if (
    req.maturity !== undefined &&
    req.maturity !== null &&
    !isAcwNodeMaturity(req.maturity)
  ) {
    return {
      ok: false,
      reason:
        "maturity, when supplied, must be one of: initial, managed, defined, quantitatively-managed, optimizing.",
    };
  }
  if (
    req.priority !== undefined &&
    req.priority !== null &&
    !isAcwNodePriority(req.priority)
  ) {
    return {
      ok: false,
      reason:
        "priority, when supplied, must be one of: low, medium, high, critical.",
    };
  }
  if (req.organisationalUnitId !== undefined && req.organisationalUnitId !== null) {
    if (
      typeof req.organisationalUnitId !== "string" ||
      req.organisationalUnitId.length === 0
    ) {
      return {
        ok: false,
        reason:
          "organisationalUnitId, when supplied, must be a non-empty string.",
      };
    }
  }
  // CTAD Phase 3 — defensive shape checks for the new editable
  // fields. Mirrors the read-validator pass.
  if (
    req.boundRequirementIds !== undefined &&
    req.boundRequirementIds !== null &&
    !isAcwBoundRequirementIdsShape(req.boundRequirementIds)
  ) {
    return {
      ok: false,
      reason:
        "boundRequirementIds, when supplied, must be an array of non-empty strings.",
    };
  }
  if (req.moduleId !== undefined && req.moduleId !== null) {
    if (typeof req.moduleId !== "string" || req.moduleId.length === 0) {
      return {
        ok: false,
        reason: "moduleId, when supplied, must be a non-empty string.",
      };
    }
  }
  if (
    req.logicalPosition !== undefined &&
    req.logicalPosition !== null &&
    !isAcwLogicalPositionShape(req.logicalPosition)
  ) {
    return {
      ok: false,
      reason:
        "logicalPosition, when supplied, must be { x: finite-number, y: finite-number }.",
    };
  }
  if (req.logicalParentId !== undefined && req.logicalParentId !== null) {
    if (
      typeof req.logicalParentId !== "string" ||
      req.logicalParentId.length === 0
    ) {
      return {
        ok: false,
        reason: "logicalParentId, when supplied, must be a non-empty string.",
      };
    }
  }
  if (
    req.logicalStyle !== undefined &&
    req.logicalStyle !== null &&
    !isAcwLogicalStyleShape(req.logicalStyle)
  ) {
    return {
      ok: false,
      reason:
        "logicalStyle, when supplied, must be a string-to-string record with non-empty keys.",
    };
  }
  const nextDescription =
    req.description === undefined ? prev.description : req.description ?? undefined;
  const nextOwner =
    req.owner === undefined ? prev.owner : req.owner ?? undefined;
  const nextStatus =
    req.status === undefined ? prev.status : req.status ?? undefined;
  const nextMaturity =
    req.maturity === undefined ? prev.maturity : req.maturity ?? undefined;
  const nextPriority =
    req.priority === undefined ? prev.priority : req.priority ?? undefined;
  const nextOrganisationalUnitId =
    req.organisationalUnitId === undefined
      ? prev.organisationalUnitId
      : req.organisationalUnitId ?? undefined;
  // CTAD Phase 3 — fold the new fields. `undefined` means
  // "leave unchanged"; `null` means "clear". Both `boundRequirementIds`
  // and `logicalStyle` are deep-frozen so a downstream mutation
  // cannot rewrite the persisted shape from outside the validator-
  // gated mutators.
  const nextBoundRequirementIds: readonly string[] | undefined =
    req.boundRequirementIds === undefined
      ? prev.boundRequirementIds
      : req.boundRequirementIds === null
        ? undefined
        : Object.freeze([...req.boundRequirementIds]);
  const nextModuleId =
    req.moduleId === undefined ? prev.moduleId : req.moduleId ?? undefined;
  const nextLogicalPosition: AcwLogicalPosition | undefined =
    req.logicalPosition === undefined
      ? prev.logicalPosition
      : req.logicalPosition === null
        ? undefined
        : Object.freeze({
            x: req.logicalPosition.x,
            y: req.logicalPosition.y,
          });
  const nextLogicalParentId =
    req.logicalParentId === undefined
      ? prev.logicalParentId
      : req.logicalParentId ?? undefined;
  const nextLogicalStyle: Readonly<Record<string, string>> | undefined =
    req.logicalStyle === undefined
      ? prev.logicalStyle
      : req.logicalStyle === null
        ? undefined
        : Object.freeze({ ...req.logicalStyle });
  const updated: AcwNode = Object.freeze({
    id: prev.id,
    type: prev.type,
    parentId: prev.parentId,
    label: prev.label,
    x: prev.x,
    y: prev.y,
    ...(prev.boundParam !== undefined ? { boundParam: prev.boundParam } : {}),
    ...(prev.boundTechnologyCategory !== undefined
      ? { boundTechnologyCategory: prev.boundTechnologyCategory }
      : {}),
    ...(prev.isDomainContainer !== undefined
      ? { isDomainContainer: prev.isDomainContainer }
      : {}),
    ...(prev.domainTag !== undefined ? { domainTag: prev.domainTag } : {}),
    ...(nextDescription !== undefined ? { description: nextDescription } : {}),
    ...(nextOwner !== undefined ? { owner: nextOwner } : {}),
    ...(nextStatus !== undefined ? { status: nextStatus } : {}),
    ...(nextMaturity !== undefined ? { maturity: nextMaturity } : {}),
    ...(nextPriority !== undefined ? { priority: nextPriority } : {}),
    ...(prev.lodRange !== undefined ? { lodRange: prev.lodRange } : {}),
    ...(nextOrganisationalUnitId !== undefined
      ? { organisationalUnitId: nextOrganisationalUnitId }
      : {}),
    // CTAD Phase 3 — diagramType / diagramSubtype are immutable
    // post-creation; preserve verbatim from `prev`.
    ...(prev.diagramType !== undefined
      ? { diagramType: prev.diagramType }
      : {}),
    ...(prev.diagramSubtype !== undefined
      ? { diagramSubtype: prev.diagramSubtype }
      : {}),
    ...(nextBoundRequirementIds !== undefined
      ? { boundRequirementIds: nextBoundRequirementIds }
      : {}),
    ...(nextModuleId !== undefined ? { moduleId: nextModuleId } : {}),
    ...(nextLogicalPosition !== undefined
      ? { logicalPosition: nextLogicalPosition }
      : {}),
    ...(nextLogicalParentId !== undefined
      ? { logicalParentId: nextLogicalParentId }
      : {}),
    ...(nextLogicalStyle !== undefined
      ? { logicalStyle: nextLogicalStyle }
      : {}),
  });
  const nodes = ws.structureGraph.nodes.slice();
  nodes[idx] = updated;
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// EAStudio Phase 2 — node label rename. Same isolation discipline
// as `updateNodeProperties`: structural fields untouched, sealed
// domain containers refused, full read-validation re-run via
// `writeToStorage`. Empty labels are rejected because the v1 read
// validator already requires `label` to be a string and the
// Properties panel must not be able to silently make a card
// captionless.
export function renameNode(nodeId: string, label: string): StoreResult {
  const ws = getWorkspace();
  const idx = ws.structureGraph.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    return { ok: false, reason: "The node referenced does not exist." };
  }
  const prev = ws.structureGraph.nodes[idx];
  if (prev.isDomainContainer === true) {
    return {
      ok: false,
      reason: "The four sealed domain containers cannot be renamed.",
    };
  }
  if (typeof label !== "string" || label.length === 0) {
    return {
      ok: false,
      reason: "Label must be a non-empty string.",
    };
  }
  if (prev.label === label) return { ok: true };
  const updated: AcwNode = Object.freeze({ ...prev, label });
  const nodes = ws.structureGraph.nodes.slice();
  nodes[idx] = updated;
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: ws.structureGraph.edges,
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// EAStudio Phase 2 — edge deletion.
//
// Removes a single edge by id. Edges in the v1 grammar carry no
// dependent state (no edge-anchored UI selection persists in the
// view-state), so removal is a pure list-filter. The full
// read-validator still runs on the resulting workspace via
// `writeToStorage` so a corruption regression in the filter path
// would be refused at the storage boundary.
export function deleteEdge(edgeId: string): StoreResult {
  const ws = getWorkspace();
  const idx = ws.structureGraph.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) {
    return { ok: false, reason: "The connection referenced does not exist." };
  }
  const edges = ws.structureGraph.edges.filter((e) => e.id !== edgeId);
  const next: AcwWorkspace = Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: ws.structureGraph.nodes,
      edges: Object.freeze(edges),
    }),
  });
  writeToStorage(next);
  cache = next;
  notify();
  return { ok: true };
}

// Test / maintenance affordance: clear the workspace back to empty.
// Not bound to any UI in v1; provided so future tooling and the
// build-time invariants can reset state without touching localStorage
// directly.
export function clearWorkspace(): void {
  const next = emptyWorkspace();
  writeToStorage(next);
  cache = next;
  notify();
}

// Internal exposure for the build-time invariant module so it can
// exercise the validator against a fabricated workspace without
// touching the singleton.
export const __acwStoreInternals = Object.freeze({
  isValidWorkspace,
  assertAllowedFields,
  emptyWorkspace,
  viewFor,
  // Returns the canonical workspace as a stable JSON string for
  // byte-identity probes (used by the v2 invariants to assert that
  // visual operations like collapse / position-update do not
  // mutate the structureGraph).
  serializeForTest(): string {
    return JSON.stringify(getWorkspace());
  },
  // Force the in-memory cache to drop and re-read from localStorage
  // on the next access. The v2 invariants use this to restore the
  // user's persisted workspace after running snapshot-and-restore
  // mutation probes against the live singleton.
  reloadFromStorageForTest(): void {
    // Phase 3 — also drop the scoped-storage L1 cache so a test
    // that wrote directly into `window.localStorage` (bypassing
    // `writeScoped`) is not masked by a stale cached entry.
    __resetScopedStorageForTest();
    cache = null;
    notify();
  },
});

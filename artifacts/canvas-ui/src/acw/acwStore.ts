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
import { isAcwElementType, type AcwElementType, type AcwExplicitEdgeKind } from "./acwGrammar";
import {
  canCreateEdge,
  canCreateNode,
  validateOperation,
  type ValidationResult,
  type ValidatorWorkspaceView,
} from "./acwValidator";

export const ACW_SCHEMA_VERSION = "acw-1.0" as const;
const STORAGE_KEY = "acw.workspace.v1";

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
}

export interface AcwEdge {
  readonly id: string;
  readonly kind: AcwExplicitEdgeKind;
  readonly fromId: string;
  readonly toId: string;
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
const ALLOWED_NODE = ["id", "type", "parentId", "label", "x", "y"] as const;
const ALLOWED_EDGE = ["id", "kind", "fromId", "toId"] as const;

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
  if (typeof window === "undefined") return emptyWorkspace();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWorkspace();
    const parsed = JSON.parse(raw);
    if (!isValidWorkspace(parsed)) return emptyWorkspace();
    return parsed;
  } catch {
    return emptyWorkspace();
  }
}

function writeToStorage(workspace: AcwWorkspace): void {
  assertAllowedFields(workspace);
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
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
}

export interface CreateEdgeRequest {
  readonly kind: AcwExplicitEdgeKind;
  readonly fromId: string;
  readonly toId: string;
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
  const id = freshId("node");
  const node: AcwNode = Object.freeze({
    id,
    type: req.type,
    parentId: req.parentId,
    label: req.label ?? req.type,
    x: typeof req.x === "number" ? req.x : 0,
    y: typeof req.y === "number" ? req.y : 0,
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
  const result: ValidationResult = validateOperation(
    { kind: "createEdge", edgeKind: req.kind, fromId: req.fromId, toId: req.toId },
    viewFor(ws),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  const edge: AcwEdge = Object.freeze({
    id: freshId("edge"),
    kind: req.kind,
    fromId: req.fromId,
    toId: req.toId,
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
    cache = null;
    notify();
  },
});

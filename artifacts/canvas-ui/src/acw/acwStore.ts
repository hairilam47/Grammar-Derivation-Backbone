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

export function createNode(req: CreateNodeRequest): StoreResult {
  const ws = getWorkspace();
  const result: ValidationResult = validateOperation(
    { kind: "createNode", type: req.type, parentId: req.parentId },
    viewFor(ws),
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  const node: AcwNode = Object.freeze({
    id: freshId("node"),
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
  return { ok: true };
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
});

// ACW v2 — build-time invariants for the visual layer.
//
// Same negative-shape pattern as `acwGrammarInvariants.test-shape.ts`:
// module-load assertions that fail the bundle if a v2 visual
// affordance silently slips a structural side-effect past the v1
// validator, or if the per-lens view-state document widens beyond
// its allow-list.
//
// What this module guards (additive to v1):
//   1. View-state schema is locked to "acw-view-1.0".
//   2. View-state read-validation drops documents that smuggle
//      graph fields (nodes / edges / parentId) into the view-state
//      key — proving the separation between `acw-1.0` (graph) and
//      `acw-view-1.0` (visual) is enforced, not merely conventional.
//   3. `updateNodeParent` is validator-gated: a refused reparent
//      leaves the workspace structurally unchanged AND surfaces a
//      neutral refusal reason.
//   4. `updateNodeParent` rejects cycles (a node may not be made
//      its own descendant).
//   5. `updateNodePosition` writes nothing structural: it leaves
//      the parent / type / label / id / edges of the moved node
//      and every other node identical. This is the constitutional
//      guarantee that "moving a box on the canvas does not change
//      meaning".
//   6. `toggleCollapsed` writes nothing into the workspace
//      document — it only mutates the view-state slice.
//
// Diagnostics: assertions throw with explanatory messages prefixed
// "ACW v2 visual invariant violation".
import {
  ACW_VIEW_SCHEMA_VERSION,
  __acwViewStateInternals,
  clearViewState,
  toggleCollapsed,
  isCollapsed,
} from "./acwViewState";
import {
  __acwStoreInternals,
  ACW_SCHEMA_VERSION,
  createNode,
  updateNodeParent,
  updateNodePosition,
} from "./acwStore";

const STORE_KEY = "acw.workspace.v1";
const VIEW_KEY = "acw.workspace.view.v1";

function snapshotLocalStorage(): { ws: string | null; view: string | null } {
  if (typeof window === "undefined") return { ws: null, view: null };
  return {
    ws: window.localStorage.getItem(STORE_KEY),
    view: window.localStorage.getItem(VIEW_KEY),
  };
}
function restoreLocalStorage(snap: { ws: string | null; view: string | null }): void {
  if (typeof window === "undefined") return;
  if (snap.ws !== null) window.localStorage.setItem(STORE_KEY, snap.ws);
  else window.localStorage.removeItem(STORE_KEY);
  if (snap.view !== null) window.localStorage.setItem(VIEW_KEY, snap.view);
  else window.localStorage.removeItem(VIEW_KEY);
  __acwStoreInternals.reloadFromStorageForTest();
  __acwViewStateInternals.reloadFromStorageForTest();
}

const PREFIX = "ACW v2 visual invariant violation";

// (1) View-state schema locked.
if (ACW_VIEW_SCHEMA_VERSION !== "acw-view-1.0") {
  throw new Error(
    `${PREFIX}: ACW_VIEW_SCHEMA_VERSION drift. v2 must remain "acw-view-1.0"; future visual-state changes require an explicit "acw-view-2.0".`,
  );
}

// (2) Read-validation drops view-state documents that smuggle
// graph fields. The view-state allow-list contains
// {schemaVersion, collapseByLens}; anything else is forbidden.
{
  const tampered = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    // Forbidden graph field smuggled into view-state:
    nodes: [],
  };
  if (__acwViewStateInternals.isValid(tampered)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted a document containing the graph field "nodes". The view-state allow-list must contain only schemaVersion + collapseByLens.`,
    );
  }
}
{
  const tampered = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: { "/workspace/landscape": [123] },
  };
  if (__acwViewStateInternals.isValid(tampered)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted a non-string node id in collapseByLens.`,
    );
  }
}

// (3 + 4 + 5 + 6) Live-store probes. We mutate the live workspace
// briefly under controlled conditions and restore the original
// contents before returning. This module runs once at bundle load,
// in the browser, against the actual store. We MUST NOT discard
// the user's persisted workspace as a side-effect of probing — so
// snapshot localStorage first, run the probes against a clean
// fabricated state, and restore the user's data at the end via
// the modules' `reloadFromStorageForTest` hooks.
const savedSnapshot = snapshotLocalStorage();

// CRITICAL: every probe below mutates the live singleton store.
// We MUST restore the user's persisted bytes even if any assertion
// throws — otherwise a single failed invariant on bundle load
// would silently destroy the user's saved workspace. Wrap every
// mutating probe in a try / finally; the finally clause is the
// only guarantee that snapshotLocalStorage is honoured.
try {
  // Fresh state for the probe.
  clearViewState();
  // `clearWorkspace` is intentionally not exported into v2's
  // invariants surface; wipe the workspace bytes directly and
  // reload the in-memory cache from the (now empty) storage.
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORE_KEY);
    __acwStoreInternals.reloadFromStorageForTest();
  }

  // Build a small fixture: Zone > ComputeNode > System > Component.
  const zone = createNode({ type: "Zone", parentId: null, label: "z" });
  if (!zone.ok) throw new Error(`${PREFIX}: fixture refused: ${zone.reason}`);
  const zoneId = zone.id;

  const cn = createNode({ type: "ComputeNode", parentId: zoneId, label: "cn" });
  if (!cn.ok) throw new Error(`${PREFIX}: fixture refused: ${cn.reason}`);
  const cnId = cn.id;

  const sys = createNode({ type: "System", parentId: cnId, label: "sys" });
  if (!sys.ok) throw new Error(`${PREFIX}: fixture refused: ${sys.reason}`);
  const sysId = sys.id;

  const comp = createNode({ type: "Component", parentId: sysId, label: "comp" });
  if (!comp.ok) throw new Error(`${PREFIX}: fixture refused: ${comp.reason}`);
  const compId = comp.id;

  // (3) Validator-gated reparent: Component cannot live in a Zone.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodeParent(compId, zoneId);
    if (r.ok !== false) {
      throw new Error(`${PREFIX}: updateNodeParent did not refuse Component into Zone.`);
    }
    if (typeof r.reason !== "string" || r.reason.length === 0) {
      throw new Error(`${PREFIX}: refused reparent produced no neutral reason string.`);
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(`${PREFIX}: refused reparent mutated the persisted workspace.`);
    }
  }

  // (4) Cycle rejection: System under its own descendant.
  {
    const r = updateNodeParent(sysId, compId);
    if (r.ok !== false) {
      throw new Error(`${PREFIX}: updateNodeParent did not refuse a containment cycle.`);
    }
    if (!r.reason.toLowerCase().includes("itself")) {
      throw new Error(
        `${PREFIX}: cycle refusal reason drifted. Expected to mention "itself"; got "${r.reason}".`,
      );
    }
  }

  // (5) Position update is structurally inert.
  {
    const before = parseSnapshot(__acwStoreInternals.serializeForTest());
    const r = updateNodePosition(compId, 192, 240);
    if (r.ok !== true) {
      throw new Error(`${PREFIX}: updateNodePosition refused a finite move: ${r.reason}.`);
    }
    const after = parseSnapshot(__acwStoreInternals.serializeForTest());
    if (before.nodes.length !== after.nodes.length) {
      throw new Error(`${PREFIX}: updateNodePosition changed node count.`);
    }
    for (const a of after.nodes) {
      const b = before.nodes.find((x) => x.id === a.id);
      if (!b) throw new Error(`${PREFIX}: updateNodePosition added a node.`);
      if (a.type !== b.type || a.parentId !== b.parentId || a.label !== b.label) {
        throw new Error(
          `${PREFIX}: updateNodePosition changed structural fields for node "${a.id}".`,
        );
      }
    }
    if (JSON.stringify(before.edges) !== JSON.stringify(after.edges)) {
      throw new Error(`${PREFIX}: updateNodePosition mutated the edge set.`);
    }
  }

  // (5a) updateNodePosition refuses non-finite values via the
  // validator, proving the v2 visual op is gated by
  // validateOperation just like createNode and createEdge.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodePosition(compId, Number.POSITIVE_INFINITY, 0);
    if (r.ok !== false) {
      throw new Error(`${PREFIX}: updateNodePosition accepted a non-finite coordinate.`);
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(`${PREFIX}: refused position update mutated the workspace.`);
    }
  }

  // (6) Collapse mutates view-state only; the workspace document
  // must be byte-identical before and after.
  {
    const wsBefore = __acwStoreInternals.serializeForTest();
    const lensId = "/workspace/landscape";
    toggleCollapsed(lensId, sysId);
    if (!isCollapsed(lensId, sysId)) {
      throw new Error(`${PREFIX}: toggleCollapsed did not flip the per-lens flag.`);
    }
    const wsAfter = __acwStoreInternals.serializeForTest();
    if (wsBefore !== wsAfter) {
      throw new Error(`${PREFIX}: toggleCollapsed mutated the workspace document.`);
    }
    toggleCollapsed(lensId, sysId); // back to expanded
  }
} finally {
  // Restore the user's persisted documents byte-for-byte, then
  // drop both in-memory caches so the next read re-loads from
  // disk. This preserves any forwards-compatible fields a future
  // schema may add to the persisted document — and, critically,
  // runs even if a probe above threw.
  restoreLocalStorage(savedSnapshot);
}

if (ACW_SCHEMA_VERSION !== "acw-1.0") {
  throw new Error(
    `${PREFIX}: workspace ACW_SCHEMA_VERSION must remain "acw-1.0" while v2 only adds visual affordances.`,
  );
}

function parseSnapshot(s: string): {
  nodes: Array<{ id: string; type: string; parentId: string | null; label: string }>;
  edges: Array<{ id: string; kind: string; fromId: string; toId: string }>;
} {
  return JSON.parse(s).structureGraph;
}

export function assertAcwV2VisualInvariants(): void {
  if (ACW_VIEW_SCHEMA_VERSION !== "acw-view-1.0") {
    throw new Error(`${PREFIX}: view schema drift detected at runtime.`);
  }
}

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
  addLensLayer,
  clearFocusStack,
  clearViewState,
  deleteLensLayer,
  getFocusStack,
  getLensLayerVisibility,
  getLensLayers,
  isCollapsed,
  popFocusFrame,
  pushFocusFrame,
  renameLensLayer,
  toggleCollapsed,
  toggleLensLayerVisibility,
} from "./acwViewState";
import { enumerateLensVisibility } from "./acwLensStructure";
import {
  __acwStoreInternals,
  ACW_SCHEMA_VERSION,
  createNode,
  createEdge,
  deleteEdge,
  renameNode,
  updateNodeBinding,
  updateNodeParent,
  updateNodePosition,
  updateNodeProperties,
} from "./acwStore";
import { resolveLabel } from "./semantic/techNodeBinding";

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

  // (3) Validator-gated reparent: Component cannot live inside a
  // ComputeNode. (Pre-EAStudio this probe used Zone as the illegal
  // parent; EAStudio Phase 1 widens Component to permit Zone /
  // BusinessEntity parents, so the probe was retargeted to
  // ComputeNode — which the containment rule continues to refuse.)
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodeParent(compId, cnId);
    if (r.ok !== false) {
      throw new Error(
        `${PREFIX}: updateNodeParent did not refuse Component into ComputeNode.`,
      );
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

// (7) Phase 5 — read-validator accepts the optional `boundParam`
// and `boundTechnologyCategory` fields on a node, and rejects
// malformed shapes for both. Pre-Phase-5 documents (without either
// field) must remain valid; that case is exercised by every other
// probe above. Here we cover the four shape outcomes the Phase 5
// allowlist widening introduces:
//   - well-formed boundParam (string ids, string|null optionValue)
//   - well-formed boundTechnologyCategory (non-empty string)
//   - boundParam containing an unexpected key  → rejected
//   - boundTechnologyCategory of wrong type    → rejected
{
  const baseGood = (extra: Record<string, unknown>) => ({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: {
      nodes: [
        {
          id: "n1",
          type: "Zone",
          parentId: null,
          label: "z",
          x: 0,
          y: 0,
          ...extra,
        },
      ],
      edges: [],
    },
  });
  // Well-formed semantic fields: read-validator must ACCEPT.
  const ok1 = baseGood({
    boundParam: { sectionId: "ops", paramId: "containerOrchestration", optionValue: "Kubernetes" },
    boundTechnologyCategory: "Container orchestrator",
  });
  if (!__acwStoreInternals.isValidWorkspace(ok1)) {
    throw new Error(
      `${PREFIX}: read-validator refused a well-formed Phase 5 node carrying boundParam + boundTechnologyCategory.`,
    );
  }
  // optionValue may be null (CTAD "Not specified"): must ACCEPT.
  const ok2 = baseGood({
    boundParam: { sectionId: "application", paramId: "frontendArchitecture", optionValue: null },
  });
  if (!__acwStoreInternals.isValidWorkspace(ok2)) {
    throw new Error(
      `${PREFIX}: read-validator refused a well-formed Phase 5 node with optionValue: null.`,
    );
  }
  // Forbidden extra key inside boundParam: must REJECT.
  const bad1 = baseGood({
    boundParam: {
      sectionId: "ops",
      paramId: "containerOrchestration",
      optionValue: "Kubernetes",
      // Smuggled extra key — not on the AcwBoundParam allow-list.
      smuggledScore: 7,
    },
  });
  if (__acwStoreInternals.isValidWorkspace(bad1)) {
    throw new Error(
      `${PREFIX}: read-validator accepted a node.boundParam carrying an unknown key.`,
    );
  }
  // boundTechnologyCategory of wrong type: must REJECT.
  const bad2 = baseGood({ boundTechnologyCategory: 42 });
  if (__acwStoreInternals.isValidWorkspace(bad2)) {
    throw new Error(
      `${PREFIX}: read-validator accepted a non-string boundTechnologyCategory.`,
    );
  }
  // Empty-string boundTechnologyCategory: must REJECT.
  const bad3 = baseGood({ boundTechnologyCategory: "" });
  if (__acwStoreInternals.isValidWorkspace(bad3)) {
    throw new Error(
      `${PREFIX}: read-validator accepted an empty-string boundTechnologyCategory.`,
    );
  }
}

// (8) EAStudio Phase 1 — read-validator accepts the optional
// `isDomainContainer` and `domainTag` fields on a node, and rejects
// malformed shapes for both. Pre-EAStudio documents (without either
// field) remain valid; that case is exercised by every other probe.
//
// Probes:
//   - well-formed isDomainContainer (boolean) + domainTag (string
//     enum value) on a Zone           → ACCEPT
//   - well-formed BusinessEntity at the workspace root with both
//     markers set                     → ACCEPT
//   - isDomainContainer of wrong type → REJECT
//   - unknown domainTag string        → REJECT
{
  const baseGood = (nodes: ReadonlyArray<Record<string, unknown>>) => ({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: { nodes, edges: [] },
  });
  // Well-formed Zone with both EAStudio markers: must ACCEPT.
  const ok1 = baseGood([
    {
      id: "domain-data",
      type: "Zone",
      parentId: null,
      label: "Data",
      x: 0,
      y: 0,
      isDomainContainer: true,
      domainTag: "data",
    },
  ]);
  if (!__acwStoreInternals.isValidWorkspace(ok1)) {
    throw new Error(
      `${PREFIX}: read-validator refused a well-formed Zone carrying isDomainContainer + domainTag.`,
    );
  }
  // Well-formed BusinessEntity domain container: must ACCEPT.
  const ok2 = baseGood([
    {
      id: "domain-business",
      type: "BusinessEntity",
      parentId: null,
      label: "Business",
      x: 0,
      y: 0,
      isDomainContainer: true,
      domainTag: "business",
    },
  ]);
  if (!__acwStoreInternals.isValidWorkspace(ok2)) {
    throw new Error(
      `${PREFIX}: read-validator refused a well-formed BusinessEntity domain container.`,
    );
  }
  // isDomainContainer of wrong type: must REJECT.
  const bad1 = baseGood([
    {
      id: "n",
      type: "Zone",
      parentId: null,
      label: "z",
      x: 0,
      y: 0,
      isDomainContainer: "yes",
    },
  ]);
  if (__acwStoreInternals.isValidWorkspace(bad1)) {
    throw new Error(
      `${PREFIX}: read-validator accepted a non-boolean isDomainContainer.`,
    );
  }
  // Unknown domainTag: must REJECT.
  const bad2 = baseGood([
    {
      id: "n",
      type: "Zone",
      parentId: null,
      label: "z",
      x: 0,
      y: 0,
      domainTag: "infrastructure",
    },
  ]);
  if (__acwStoreInternals.isValidWorkspace(bad2)) {
    throw new Error(
      `${PREFIX}: read-validator accepted an unknown domainTag value.`,
    );
  }
}

// (9) EAStudio Phase 1 — view-state read-validator accepts the
// optional `currentDomainByLens` field and rejects unknown tag
// values. Mirrors the (2) graph-field smuggle probe but for the
// new EAStudio-specific field.
{
  const ok = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    viewModeByLens: {},
    currentDomainByLens: { "/workspace/studio": "data" },
  };
  if (!__acwViewStateInternals.isValid(ok)) {
    throw new Error(
      `${PREFIX}: view-state read-validator refused a well-formed currentDomainByLens map.`,
    );
  }
  const bad = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    viewModeByLens: {},
    currentDomainByLens: { "/workspace/studio": "infrastructure" },
  };
  if (__acwViewStateInternals.isValid(bad)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted an unknown currentDomainByLens value.`,
    );
  }
}

// (10) EAStudio Phase 2 — read-validator accepts the optional
// descriptive properties (description, owner, status, maturity,
// priority) on a node, and rejects malformed shapes for each.
// Pre-Phase-2 documents (without any of these fields) remain
// valid; absence is exercised by every prior probe.
{
  const baseGood = (extra: Record<string, unknown>) => ({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: {
      nodes: [
        { id: "p1", type: "Zone", parentId: null, label: "z", x: 0, y: 0, ...extra },
      ],
      edges: [],
    },
  });
  // Well-formed: ACCEPT.
  const ok1 = baseGood({
    description: "Authoritative system of record",
    owner: "Platform team",
    status: "active",
    maturity: "managed",
    priority: "high",
  });
  if (!__acwStoreInternals.isValidWorkspace(ok1)) {
    throw new Error(
      `${PREFIX}: read-validator refused a well-formed Phase 2 node carrying description / owner / status / maturity / priority.`,
    );
  }
  // Each enum at every legal value: ACCEPT.
  for (const status of ["planned", "active", "deprecated"] as const) {
    if (!__acwStoreInternals.isValidWorkspace(baseGood({ status }))) {
      throw new Error(
        `${PREFIX}: read-validator refused a well-formed status "${status}".`,
      );
    }
  }
  for (const maturity of [
    "initial",
    "managed",
    "defined",
    "quantitatively-managed",
    "optimizing",
  ] as const) {
    if (!__acwStoreInternals.isValidWorkspace(baseGood({ maturity }))) {
      throw new Error(
        `${PREFIX}: read-validator refused a well-formed maturity "${maturity}".`,
      );
    }
  }
  for (const priority of ["low", "medium", "high", "critical"] as const) {
    if (!__acwStoreInternals.isValidWorkspace(baseGood({ priority }))) {
      throw new Error(
        `${PREFIX}: read-validator refused a well-formed priority "${priority}".`,
      );
    }
  }
  // Unknown enum values: REJECT.
  if (__acwStoreInternals.isValidWorkspace(baseGood({ status: "unknown" }))) {
    throw new Error(`${PREFIX}: read-validator accepted an unknown status value.`);
  }
  if (__acwStoreInternals.isValidWorkspace(baseGood({ maturity: "expert" }))) {
    throw new Error(`${PREFIX}: read-validator accepted an unknown maturity value.`);
  }
  if (__acwStoreInternals.isValidWorkspace(baseGood({ priority: "urgent" }))) {
    throw new Error(`${PREFIX}: read-validator accepted an unknown priority value.`);
  }
  // Empty-string text fields: REJECT.
  if (__acwStoreInternals.isValidWorkspace(baseGood({ owner: "" }))) {
    throw new Error(`${PREFIX}: read-validator accepted an empty-string owner.`);
  }
  if (__acwStoreInternals.isValidWorkspace(baseGood({ description: "" }))) {
    throw new Error(
      `${PREFIX}: read-validator accepted an empty-string description.`,
    );
  }
  // Wrong types: REJECT.
  if (__acwStoreInternals.isValidWorkspace(baseGood({ status: 1 }))) {
    throw new Error(`${PREFIX}: read-validator accepted a non-string status.`);
  }
  if (__acwStoreInternals.isValidWorkspace(baseGood({ owner: 42 }))) {
    throw new Error(`${PREFIX}: read-validator accepted a non-string owner.`);
  }
  // EAStudio Phase 2 (LoS framework) — `lodRange` shape probes.
  // The validator must accept absence and every well-formed
  // 2-tuple in [1,3] with min<=max; it must reject every other
  // shape so the L3 carve-out cannot be smuggled into a
  // pre-Phase-2 document via a hand-edited JSON blob.
  for (const ok of [
    [1, 1] as const,
    [1, 2] as const,
    [1, 3] as const,
    [2, 2] as const,
    [2, 3] as const,
    [3, 3] as const,
  ]) {
    if (!__acwStoreInternals.isValidWorkspace(baseGood({ lodRange: ok }))) {
      throw new Error(
        `${PREFIX}: read-validator refused a well-formed lodRange [${ok[0]}, ${ok[1]}].`,
      );
    }
  }
  for (const bad of [
    [0, 3] as const,         // below permitted minimum
    [1, 4] as const,         // above permitted maximum
    [2, 1] as const,         // min > max
    [1] as unknown as readonly [number, number], // wrong arity
    [1, 2, 3] as unknown as readonly [number, number], // wrong arity
    [1.5, 3] as unknown as readonly [number, number], // non-integer
    "1,3" as unknown,        // non-array
    null as unknown,         // null
  ]) {
    if (__acwStoreInternals.isValidWorkspace(baseGood({ lodRange: bad }))) {
      throw new Error(
        `${PREFIX}: read-validator accepted a malformed lodRange ${JSON.stringify(bad)}.`,
      );
    }
  }
}

// (11) EAStudio Phase 2 — view-state read-validator accepts the
// new connectModeByLens / connectPendingSourceByLens /
// selectedNodeIdByLens fields and rejects malformed values.
{
  const ok = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    viewModeByLens: {},
    currentDomainByLens: {},
    connectModeByLens: { "/workspace/studio": true },
    connectPendingSourceByLens: { "/workspace/studio": "node-1" },
    selectedNodeIdByLens: { "/workspace/studio": "node-2" },
  };
  if (!__acwViewStateInternals.isValid(ok)) {
    throw new Error(
      `${PREFIX}: view-state read-validator refused well-formed Phase 2 slices.`,
    );
  }
  const badMode = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    connectModeByLens: { "/workspace/studio": "yes" },
  };
  if (__acwViewStateInternals.isValid(badMode)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted a non-boolean connectModeByLens value.`,
    );
  }
  const badPending = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    connectPendingSourceByLens: { "/workspace/studio": "" },
  };
  if (__acwViewStateInternals.isValid(badPending)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted an empty connectPendingSourceByLens value.`,
    );
  }
  const badSel = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    selectedNodeIdByLens: { "/workspace/studio": 7 },
  };
  if (__acwViewStateInternals.isValid(badSel)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted a non-string selectedNodeIdByLens value.`,
    );
  }
}

// (11b) EAStudio Phase 3 — view-state read-validator accepts the
// new optional `viewTabByLens` field at every legal literal and
// rejects unknown values. Mirrors the (9) currentDomainByLens
// probe shape; a fourth-tab smuggle attempt must be refused so
// the Studio shell only ever renders one of design/matrix/export.
{
  for (const tab of ["design", "matrix", "export"] as const) {
    const ok = {
      schemaVersion: ACW_VIEW_SCHEMA_VERSION,
      collapseByLens: {},
      viewTabByLens: { "/workspace/studio": tab },
    };
    if (!__acwViewStateInternals.isValid(ok)) {
      throw new Error(
        `${PREFIX}: view-state read-validator refused a well-formed viewTabByLens "${tab}".`,
      );
    }
  }
  const bad = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    viewTabByLens: { "/workspace/studio": "matrix-2" },
  };
  if (__acwViewStateInternals.isValid(bad)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted an unknown viewTabByLens value.`,
    );
  }
  const badType = {
    schemaVersion: ACW_VIEW_SCHEMA_VERSION,
    collapseByLens: {},
    viewTabByLens: { "/workspace/studio": 3 },
  };
  if (__acwViewStateInternals.isValid(badType)) {
    throw new Error(
      `${PREFIX}: view-state read-validator accepted a non-string viewTabByLens value.`,
    );
  }
}

// (12) EAStudio Phase 2 — live-store probes for updateNodeProperties,
// renameNode, and deleteEdge. Same snapshot-and-restore discipline
// as the (3..6) probes; we mutate the live singleton briefly under
// a clean fixture and restore the user's bytes in finally.
const phase2Snapshot = snapshotLocalStorage();
try {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORE_KEY);
    __acwStoreInternals.reloadFromStorageForTest();
  }
  // Fixture: Zone container A → System; sealed domain Zone D.
  const a = createNode({ type: "Zone", parentId: null, label: "a" });
  if (!a.ok) throw new Error(`${PREFIX}: phase 2 fixture refused: ${a.reason}`);
  const aId = a.id;
  const sys = createNode({ type: "System", parentId: aId, label: "s" });
  if (!sys.ok)
    throw new Error(`${PREFIX}: phase 2 fixture refused: ${sys.reason}`);
  const sysId = sys.id;
  const sys2 = createNode({ type: "System", parentId: aId, label: "s2" });
  if (!sys2.ok)
    throw new Error(`${PREFIX}: phase 2 fixture refused: ${sys2.reason}`);
  const sys2Id = sys2.id;
  const sealed = createNode({
    type: "Zone",
    parentId: null,
    label: "sealed",
    isDomainContainer: true,
    domainTag: "data",
    id: "domain-data",
  });
  if (!sealed.ok)
    throw new Error(`${PREFIX}: phase 2 fixture refused: ${sealed.reason}`);
  const sealedId = sealed.id;

  // (12a) updateNodeProperties accepts a well-formed call.
  {
    const r = updateNodeProperties(sysId, {
      description: "Edge ingress",
      owner: "Platform",
      status: "active",
      maturity: "defined",
      priority: "high",
    });
    if (r.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeProperties refused a well-formed call: ${r.reason}`,
      );
    }
  }
  // (12b) updateNodeProperties refuses an unknown enum and leaves
  // the workspace unchanged.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodeProperties(sysId, {
      status: "shipping" as never,
    });
    if (r.ok !== false) {
      throw new Error(
        `${PREFIX}: updateNodeProperties accepted an unknown status enum.`,
      );
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(
        `${PREFIX}: refused updateNodeProperties mutated the persisted workspace.`,
      );
    }
  }
  // (12c) updateNodeProperties refuses an empty-string owner.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodeProperties(sysId, { owner: "" });
    if (r.ok !== false) {
      throw new Error(
        `${PREFIX}: updateNodeProperties accepted an empty-string owner.`,
      );
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(
        `${PREFIX}: refused empty-string owner mutated the persisted workspace.`,
      );
    }
  }
  // (12d) updateNodeProperties refuses sealed domain containers.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = updateNodeProperties(sealedId, { description: "x" });
    if (r.ok !== false) {
      throw new Error(
        `${PREFIX}: updateNodeProperties accepted an edit on a sealed domain container.`,
      );
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(
        `${PREFIX}: refused sealed-container edit mutated the persisted workspace.`,
      );
    }
  }
  // (12e) renameNode refuses sealed domain containers and empty
  // strings; accepts a non-empty rename on a regular node.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r1 = renameNode(sealedId, "x");
    if (r1.ok !== false) {
      throw new Error(
        `${PREFIX}: renameNode accepted a rename on a sealed domain container.`,
      );
    }
    const r2 = renameNode(sysId, "");
    if (r2.ok !== false) {
      throw new Error(`${PREFIX}: renameNode accepted an empty label.`);
    }
    const afterRefused = __acwStoreInternals.serializeForTest();
    if (before !== afterRefused) {
      throw new Error(
        `${PREFIX}: refused renameNode mutated the persisted workspace.`,
      );
    }
    const r3 = renameNode(sysId, "renamed");
    if (r3.ok !== true) {
      throw new Error(
        `${PREFIX}: renameNode refused a well-formed rename: ${r3.reason}`,
      );
    }
  }
  // (12f) deleteEdge removes the named edge byte-identically; the
  // node set is unchanged.
  {
    const ce = createEdge({ kind: "CONNECTS", fromId: sysId, toId: sys2Id });
    if (ce.ok !== true) {
      throw new Error(
        `${PREFIX}: phase 2 fixture refused createEdge: ${ce.reason}`,
      );
    }
    const wsBefore = parseSnapshot(__acwStoreInternals.serializeForTest());
    const targetEdge = wsBefore.edges.find(
      (e) => e.fromId === sysId && e.toId === sys2Id,
    );
    if (targetEdge === undefined) {
      throw new Error(`${PREFIX}: deleteEdge fixture missing target edge.`);
    }
    const r = deleteEdge(targetEdge.id);
    if (r.ok !== true) {
      throw new Error(`${PREFIX}: deleteEdge refused a real edge: ${r.reason}`);
    }
    const wsAfter = parseSnapshot(__acwStoreInternals.serializeForTest());
    if (wsAfter.edges.length !== wsBefore.edges.length - 1) {
      throw new Error(`${PREFIX}: deleteEdge changed edge count by an unexpected delta.`);
    }
    if (wsAfter.edges.some((e) => e.id === targetEdge.id)) {
      throw new Error(`${PREFIX}: deleteEdge left the deleted edge in the graph.`);
    }
    if (wsAfter.nodes.length !== wsBefore.nodes.length) {
      throw new Error(`${PREFIX}: deleteEdge changed the node count.`);
    }
  }
  // (12g) deleteEdge on an unknown id refuses with a neutral
  // reason and leaves the workspace unchanged.
  {
    const before = __acwStoreInternals.serializeForTest();
    const r = deleteEdge("edge-does-not-exist");
    if (r.ok !== false) {
      throw new Error(`${PREFIX}: deleteEdge accepted an unknown id.`);
    }
    if (typeof r.reason !== "string" || r.reason.length === 0) {
      throw new Error(`${PREFIX}: deleteEdge unknown-id refusal had no neutral reason.`);
    }
    const after = __acwStoreInternals.serializeForTest();
    if (before !== after) {
      throw new Error(`${PREFIX}: refused deleteEdge mutated the persisted workspace.`);
    }
  }
  // (12h) EAStudio Phase 2 CONNECTS widening: peer connectivity is
  // permitted between two Zone nodes (so the Business / Technology
  // domains, which use Zone-typed sub-containers, can author peer
  // edges) and between two Component nodes (peers within a System).
  // The legacy ComputeNode ↔ ComputeNode and System ↔ System pairs
  // continue to work; sealed domain containers and BusinessEntity
  // nodes are still refused as endpoints.
  {
    const za = createNode({ type: "Zone", parentId: aId, label: "za" });
    if (!za.ok) {
      throw new Error(`${PREFIX}: phase 2 CONNECTS fixture refused createNode (Zone): ${za.reason}`);
    }
    const zb = createNode({ type: "Zone", parentId: aId, label: "zb" });
    if (!zb.ok) {
      throw new Error(`${PREFIX}: phase 2 CONNECTS fixture refused createNode (Zone): ${zb.reason}`);
    }
    const ezz = createEdge({ kind: "CONNECTS", fromId: za.id, toId: zb.id });
    if (ezz.ok !== true) {
      throw new Error(
        `${PREFIX}: createEdge refused a Zone↔Zone CONNECTS pair after Phase 2 widening: ${ezz.reason}`,
      );
    }
    const ca = createNode({ type: "Component", parentId: sysId, label: "ca" });
    if (!ca.ok) {
      throw new Error(`${PREFIX}: phase 2 CONNECTS fixture refused createNode (Component): ${ca.reason}`);
    }
    const cb = createNode({ type: "Component", parentId: sysId, label: "cb" });
    if (!cb.ok) {
      throw new Error(`${PREFIX}: phase 2 CONNECTS fixture refused createNode (Component): ${cb.reason}`);
    }
    const ecc = createEdge({ kind: "CONNECTS", fromId: ca.id, toId: cb.id });
    if (ecc.ok !== true) {
      throw new Error(
        `${PREFIX}: createEdge refused a Component↔Component CONNECTS pair after Phase 2 widening: ${ecc.reason}`,
      );
    }
    // Negative: sealed domain containers must still be refused as
    // CONNECTS endpoints — exhaustively in BOTH the source and
    // destination roles. The DomainGrid host's connect-target
    // overlay is gated only on `!isDomainContainer` at the UI
    // level, so the store-side guard is the load-bearing safety
    // net for sealed-endpoint CONNECTS attempts that arrive via
    // any other path (programmatic dispatch, future surfaces,
    // etc.). Both directions must refuse and leave the workspace
    // bytes unchanged.
    const beforeSealed = __acwStoreInternals.serializeForTest();
    const ezSealedFrom = createEdge({
      kind: "CONNECTS",
      fromId: sealedId,
      toId: za.id,
    });
    if (ezSealedFrom.ok !== false) {
      throw new Error(
        `${PREFIX}: createEdge accepted a sealed domain container as a CONNECTS source.`,
      );
    }
    const ezSealedTo = createEdge({
      kind: "CONNECTS",
      fromId: za.id,
      toId: sealedId,
    });
    if (ezSealedTo.ok !== false) {
      throw new Error(
        `${PREFIX}: createEdge accepted a sealed domain container as a CONNECTS destination.`,
      );
    }
    const ezSealedBoth = createEdge({
      kind: "CONNECTS",
      fromId: sealedId,
      toId: sealedId,
    });
    if (ezSealedBoth.ok !== false) {
      throw new Error(
        `${PREFIX}: createEdge accepted a sealed-to-sealed CONNECTS pair.`,
      );
    }
    const afterSealed = __acwStoreInternals.serializeForTest();
    if (beforeSealed !== afterSealed) {
      throw new Error(
        `${PREFIX}: refused sealed-CONNECTS mutated the persisted workspace.`,
      );
    }
  }
  // (12i) EAStudio Phase 2 — `updateNodeBinding` must preserve every
  // additive optional field on the target node. An earlier
  // implementation rebuilt the node from a hard-coded subset
  // (`id/type/parentId/label/x/y` + binding fields), silently
  // dropping `domainTag`, `description`, `owner`, `status`,
  // `maturity`, `priority`, and — most dangerously — the
  // `isDomainContainer` seal flag. This probe writes the full set
  // of additive fields, then runs a binding update, then asserts
  // that every additive field round-tripped intact.
  {
    const propPrep = updateNodeProperties(sys2Id, {
      description: "preserved-desc",
      owner: "preserved-owner",
      status: "active",
      maturity: "managed",
      priority: "high",
    });
    if (propPrep.ok !== true) {
      throw new Error(
        `${PREFIX}: phase 2 binding-preservation fixture failed at updateNodeProperties: ${propPrep.reason}`,
      );
    }
    const before = parseSnapshot(__acwStoreInternals.serializeForTest());
    const beforeNode = before.nodes.find((n) => n.id === sys2Id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (beforeNode === undefined) {
      throw new Error(`${PREFIX}: phase 2 binding-preservation fixture missing target node.`);
    }
    if (
      beforeNode["description"] !== "preserved-desc" ||
      beforeNode["owner"] !== "preserved-owner" ||
      beforeNode["status"] !== "active" ||
      beforeNode["maturity"] !== "managed" ||
      beforeNode["priority"] !== "high"
    ) {
      throw new Error(
        `${PREFIX}: phase 2 binding-preservation fixture: properties did not persist before binding update.`,
      );
    }
    const r = updateNodeBinding(sys2Id, {
      boundTechnologyCategory: "container-runtime",
    });
    if (r.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeBinding refused a well-formed binding write: ${r.reason}`,
      );
    }
    const after = parseSnapshot(__acwStoreInternals.serializeForTest());
    const afterNode = after.nodes.find((n) => n.id === sys2Id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (afterNode === undefined) {
      throw new Error(`${PREFIX}: updateNodeBinding removed the target node.`);
    }
    if (afterNode["boundTechnologyCategory"] !== "container-runtime") {
      throw new Error(`${PREFIX}: updateNodeBinding did not write the new binding.`);
    }
    for (const k of [
      "description",
      "owner",
      "status",
      "maturity",
      "priority",
    ] as const) {
      if (afterNode[k] !== beforeNode[k]) {
        throw new Error(
          `${PREFIX}: updateNodeBinding dropped additive field "${k}" (had "${String(beforeNode[k])}", now "${String(afterNode[k])}").`,
        );
      }
    }
    // The `domainTag` additive field must also round-trip. We use
    // a fresh node tagged into the application domain so this
    // probe is independent of the rest of the fixture.
    const tagged = createNode({
      type: "Component",
      parentId: sysId,
      label: "tagged",
      domainTag: "application",
    });
    if (!tagged.ok) {
      throw new Error(
        `${PREFIX}: phase 2 binding-preservation domainTag fixture refused: ${tagged.reason}`,
      );
    }
    const rt = updateNodeBinding(tagged.id, {
      boundTechnologyCategory: "library",
    });
    if (rt.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeBinding refused a domainTag-bearing binding write: ${rt.reason}`,
      );
    }
    const after2 = parseSnapshot(__acwStoreInternals.serializeForTest());
    const taggedAfter = after2.nodes.find((n) => n.id === tagged.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (taggedAfter === undefined) {
      throw new Error(`${PREFIX}: updateNodeBinding removed the domainTag-bearing node.`);
    }
    if (taggedAfter["domainTag"] !== "application") {
      throw new Error(
        `${PREFIX}: updateNodeBinding dropped the domainTag field (had "application", now "${String(taggedAfter["domainTag"])}").`,
      );
    }
  }
  // (12j) EAStudio Path B Phase 3 — `organisationalUnitId` must
  // round-trip through both `updateNodeProperties` (the explicit
  // forwarding path) and `updateNodeBinding` (the preservedRest
  // auto-carry path). The field is the only point of coupling
  // between the OU registry and the workspace document; if either
  // mutator drops it on update the registry's overlay would
  // silently disagree with the workspace it claims to colour.
  {
    const ouNode = createNode({
      type: "Component",
      parentId: sysId,
      label: "ou-bound",
      domainTag: "application",
    });
    if (!ouNode.ok) {
      throw new Error(`${PREFIX}: phase 3 OU fixture refused createNode: ${ouNode.reason}`);
    }
    const setOu = updateNodeProperties(ouNode.id, {
      organisationalUnitId: "ou-fixture-1",
    });
    if (setOu.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeProperties refused a well-formed organisationalUnitId set: ${setOu.reason}`,
      );
    }
    const afterSet = parseSnapshot(__acwStoreInternals.serializeForTest());
    const setNode = afterSet.nodes.find((n) => n.id === ouNode.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (setNode === undefined) {
      throw new Error(`${PREFIX}: updateNodeProperties removed the OU-bound node.`);
    }
    if (setNode["organisationalUnitId"] !== "ou-fixture-1") {
      throw new Error(
        `${PREFIX}: updateNodeProperties did not persist organisationalUnitId.`,
      );
    }
    const reb = updateNodeBinding(ouNode.id, {
      boundTechnologyCategory: "library",
    });
    if (reb.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeBinding refused an OU-bearing node: ${reb.reason}`,
      );
    }
    const afterBind = parseSnapshot(__acwStoreInternals.serializeForTest());
    const bindNode = afterBind.nodes.find((n) => n.id === ouNode.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (bindNode === undefined) {
      throw new Error(`${PREFIX}: updateNodeBinding removed the OU-bound node.`);
    }
    if (bindNode["organisationalUnitId"] !== "ou-fixture-1") {
      throw new Error(
        `${PREFIX}: updateNodeBinding dropped organisationalUnitId during binding swap.`,
      );
    }
    const cleared = updateNodeProperties(ouNode.id, {
      organisationalUnitId: null,
    });
    if (cleared.ok !== true) {
      throw new Error(
        `${PREFIX}: updateNodeProperties refused the OU clear: ${cleared.reason}`,
      );
    }
    const afterClear = parseSnapshot(__acwStoreInternals.serializeForTest());
    const clearedNode = afterClear.nodes.find((n) => n.id === ouNode.id) as
      | (Record<string, unknown> & { id: string })
      | undefined;
    if (clearedNode === undefined) {
      throw new Error(`${PREFIX}: clear of OU removed the node.`);
    }
    if ("organisationalUnitId" in clearedNode) {
      throw new Error(
        `${PREFIX}: updateNodeProperties did not strip organisationalUnitId on clear.`,
      );
    }
    // Empty-string is a forbidden value; the validator must refuse.
    const empty = updateNodeProperties(ouNode.id, {
      organisationalUnitId: "" as unknown as string,
    });
    if (empty.ok !== false) {
      throw new Error(
        `${PREFIX}: updateNodeProperties accepted an empty organisationalUnitId.`,
      );
    }
  }
  // (12k) EAStudio Path B Phase 3 — right-click "Swap technology"
  // mutation must be visible to the Studio renderer in the same
  // tick. The Studio NodeCard derives its label from
  // `resolveLabel(node)` (which reads `boundParam.optionValue`),
  // so a swap that calls `updateNodeBinding({ ..., optionValue:
  // <new> })` MUST cause `resolveLabel` to return `<new>` on the
  // very next workspace read. This probe locks the binding-read
  // contract end-to-end so a future renderer change cannot
  // silently revert to the pre-Phase-3 `node.label` rendering and
  // break the swap-visibility acceptance criterion.
  {
    const swapNode = createNode({
      type: "Component",
      parentId: sysId,
      label: "swap-probe",
      domainTag: "application",
      boundParam: {
        sectionId: "ops",
        paramId: "containerOrchestration",
        optionValue: "Kubernetes",
      },
    });
    if (!swapNode.ok) {
      throw new Error(
        `${PREFIX}: swap-probe createNode refused: ${swapNode.reason}`,
      );
    }
    const beforeNode = parseSnapshot(
      __acwStoreInternals.serializeForTest(),
    ).nodes.find((n) => n.id === swapNode.id) as
      | (Record<string, unknown> & { id: string; label: string })
      | undefined;
    if (beforeNode === undefined) {
      throw new Error(`${PREFIX}: swap-probe seed node not present.`);
    }
    if (
      resolveLabel(beforeNode as unknown as Parameters<typeof resolveLabel>[0]) !==
      "Kubernetes"
    ) {
      throw new Error(
        `${PREFIX}: resolveLabel did not surface the seeded optionValue ("Kubernetes").`,
      );
    }
    // Swap to a different valid option of the same parameter. The
    // validator must accept and the resolver must immediately read
    // the new value through the live workspace.
    const swapped = updateNodeBinding(swapNode.id, {
      boundParam: {
        sectionId: "ops",
        paramId: "containerOrchestration",
        optionValue: "Nomad",
      },
    });
    if (!swapped.ok) {
      throw new Error(
        `${PREFIX}: swap updateNodeBinding refused: ${swapped.reason}`,
      );
    }
    const afterNode = parseSnapshot(
      __acwStoreInternals.serializeForTest(),
    ).nodes.find((n) => n.id === swapNode.id) as
      | (Record<string, unknown> & { id: string; label: string })
      | undefined;
    if (afterNode === undefined) {
      throw new Error(`${PREFIX}: swap-probe node missing after swap.`);
    }
    if (
      resolveLabel(afterNode as unknown as Parameters<typeof resolveLabel>[0]) !==
      "Nomad"
    ) {
      throw new Error(
        `${PREFIX}: resolveLabel did not reflect the swapped optionValue ("Nomad").`,
      );
    }
  }
} finally {
  restoreLocalStorage(phase2Snapshot);
}

// Canvas Enhancements — invariant probes for layerIds node field
// and layersByLens view-state slice. Focus-stack is transient
// (module-level Map, never persisted) so no invariant is needed for it.
{
  const ceSnapshot = snapshotLocalStorage();
  try {
    clearViewState();
    // Drop any persisted nodes from localStorage so the probe starts
    // from an empty workspace. The snapshot was taken above so the
    // finally block restores the user's real data.
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("acw.workspace.v1");
    }
    __acwStoreInternals.reloadFromStorageForTest();

    // --- layerIds field on AcwNode ---
    // Seed a node for all layer-field probes.
    const seedResult = createNode({ type: "System", parentId: null, label: "L-probe", x: 0, y: 0 });
    if (!seedResult.ok) {
      throw new Error(`${PREFIX} CE: seed node refused: ${seedResult.reason}`);
    }
    const layerProbeId = seedResult.id;

    // Probe 1: undefined layerIds (not set) is accepted on initial create.
    const rawSeed = parseSnapshot(__acwStoreInternals.serializeForTest()).nodes.find(
      (n) => n.id === layerProbeId,
    ) as Record<string, unknown> | undefined;
    if (rawSeed === undefined) {
      throw new Error(`${PREFIX} CE: probe node missing after seed.`);
    }
    // The serialised node must NOT carry a layerIds key when unset.
    if ("layerIds" in rawSeed && (rawSeed as Record<string, unknown>).layerIds !== null && (rawSeed as Record<string, unknown>).layerIds !== undefined) {
      throw new Error(`${PREFIX} CE: unset layerIds must not appear in persisted node.`);
    }

    // Probe 2: setting layerIds to a populated string array is accepted.
    const setLayersResult = updateNodeProperties(layerProbeId, {
      layerIds: ["layer-a", "layer-b"],
    });
    if (!setLayersResult.ok) {
      throw new Error(`${PREFIX} CE: setting layerIds refused: ${setLayersResult.reason}`);
    }
    const afterSet = parseSnapshot(__acwStoreInternals.serializeForTest()).nodes.find(
      (n) => n.id === layerProbeId,
    ) as Record<string, unknown> | undefined;
    if (afterSet === undefined) {
      throw new Error(`${PREFIX} CE: probe node missing after layerIds set.`);
    }
    const storedLayerIds = (afterSet as Record<string, unknown>).layerIds;
    if (
      !Array.isArray(storedLayerIds) ||
      storedLayerIds.length !== 2 ||
      storedLayerIds[0] !== "layer-a" ||
      storedLayerIds[1] !== "layer-b"
    ) {
      throw new Error(`${PREFIX} CE: stored layerIds does not match ["layer-a","layer-b"].`);
    }

    // Probe 3: clearing layerIds (null) is accepted.
    const clearLayersResult = updateNodeProperties(layerProbeId, { layerIds: null });
    if (!clearLayersResult.ok) {
      throw new Error(`${PREFIX} CE: clearing layerIds refused: ${clearLayersResult.reason}`);
    }

    // --- layersByLens view-state slice ---
    // The view-state helpers must round-trip layer definitions through
    // the assertValid boundary without throwing or returning stale data.
    const testLensId = "/workspace/studio";

    // Probe 4: a fresh lens has no layers.
    const initialLayers = getLensLayers(testLensId);
    if (initialLayers.length !== 0) {
      throw new Error(`${PREFIX} CE: fresh lens unexpectedly has ${initialLayers.length} layer(s).`);
    }

    // Probe 5: addLensLayer creates a layer with a string id and name.
    addLensLayer(testLensId, "Infrastructure");
    const afterAdd = getLensLayers(testLensId);
    if (afterAdd.length !== 1) {
      throw new Error(`${PREFIX} CE: expected 1 layer after add, got ${afterAdd.length}.`);
    }
    const layerDef = afterAdd[0];
    if (typeof layerDef.id !== "string" || layerDef.id.length === 0) {
      throw new Error(`${PREFIX} CE: addLensLayer produced a layer with empty id.`);
    }
    if (layerDef.name !== "Infrastructure") {
      throw new Error(`${PREFIX} CE: addLensLayer name mismatch: "${layerDef.name}".`);
    }

    // Probe 6: visibility defaults to true.
    const visAfterAdd = getLensLayerVisibility(testLensId);
    if (visAfterAdd[layerDef.id] !== undefined && visAfterAdd[layerDef.id] !== true) {
      throw new Error(`${PREFIX} CE: default layer visibility must be true or absent.`);
    }

    // Probe 7: toggleLensLayerVisibility flips to false.
    toggleLensLayerVisibility(testLensId, layerDef.id);
    const visAfterToggle = getLensLayerVisibility(testLensId);
    if (visAfterToggle[layerDef.id] !== false) {
      throw new Error(`${PREFIX} CE: toggle did not set visibility to false.`);
    }

    // Probe 8: renameLensLayer changes the name.
    renameLensLayer(testLensId, layerDef.id, "Network");
    const afterRename = getLensLayers(testLensId);
    if (afterRename[0].name !== "Network") {
      throw new Error(`${PREFIX} CE: renameLensLayer did not update name (got "${afterRename[0].name}").`);
    }

    // Probe 9: deleteLensLayer removes the layer.
    deleteLensLayer(testLensId, layerDef.id);
    const afterDelete = getLensLayers(testLensId);
    if (afterDelete.length !== 0) {
      throw new Error(`${PREFIX} CE: deleteLensLayer left ${afterDelete.length} layer(s).`);
    }

    // Probe 10: focus-stack push / pop / clear.
    // The stack is module-level (transient), not stored in localStorage.
    // The snapshot/restore around this block is harmless.
    {
      const p10 = "__probe-focus-10__";
      clearFocusStack(p10);
      if (getFocusStack(p10).length !== 0) {
        throw new Error(`${PREFIX} CE: focus stack for an unseen lens must start empty.`);
      }
      pushFocusFrame(p10, ["na", "nb"]);
      const s1 = getFocusStack(p10);
      if (s1.length !== 1) {
        throw new Error(`${PREFIX} CE: focus stack depth after one push must be 1, got ${s1.length}.`);
      }
      if (s1[0].length !== 2 || !s1[0].includes("na")) {
        throw new Error(`${PREFIX} CE: top frame must contain the pushed node ids.`);
      }
      pushFocusFrame(p10, ["nc"]);
      if (getFocusStack(p10).length !== 2) {
        throw new Error(`${PREFIX} CE: focus stack depth after second push must be 2.`);
      }
      popFocusFrame(p10);
      const s3 = getFocusStack(p10);
      if (s3.length !== 1 || !s3[0].includes("na")) {
        throw new Error(`${PREFIX} CE: pop must revert to the first frame.`);
      }
      clearFocusStack(p10);
      if (getFocusStack(p10).length !== 0) {
        throw new Error(`${PREFIX} CE: clearFocusStack must empty the stack.`);
      }
    }

    // Probe 11: enumerateLensVisibility layer-filter semantics.
    // Pure function — no store mutation. Uses inline objects cast to
    // the minimal shape that enumerateLensVisibility reads.
    {
      // A node with one visible + one hidden layer must pass.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nLayered = { id: "p11-1", parentId: null, type: "system", label: "L", x: 0, y: 0, layerIds: ["lv", "lh"] } as any;
      // A node with no layerIds must always pass (unassigned contract).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nOpen = { id: "p11-2", parentId: null, type: "system", label: "O", x: 0, y: 0 } as any;
      // A node whose only layer is hidden must be filtered out.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nHidden = { id: "p11-3", parentId: null, type: "system", label: "H", x: 0, y: 0, layerIds: ["lh"] } as any;
      const activeSet = new Set(["lv"]);
      const vis11 = enumerateLensVisibility(
        [nLayered, nOpen, nHidden],
        [],
        null,
        new Set<string>(),
        undefined,
        activeSet,
      );
      const ids = new Set(vis11.directSiblings.map((n) => n.id));
      if (!ids.has("p11-1")) {
        throw new Error(
          `${PREFIX} CE: enumerateLensVisibility must pass node whose layerIds intersects activeLayerIds.`,
        );
      }
      if (!ids.has("p11-2")) {
        throw new Error(
          `${PREFIX} CE: enumerateLensVisibility must pass node with no layerIds regardless of layer filter.`,
        );
      }
      if (ids.has("p11-3")) {
        throw new Error(
          `${PREFIX} CE: enumerateLensVisibility must filter out node whose all layers are hidden.`,
        );
      }
    }
  } finally {
    restoreLocalStorage(ceSnapshot);
  }
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

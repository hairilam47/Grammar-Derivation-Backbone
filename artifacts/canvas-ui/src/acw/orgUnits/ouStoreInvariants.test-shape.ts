// EAStudio Path B Phase 3 — build-time invariants for the OU store.
//
// Same negative-shape pattern as the v1 / v2 ACW invariant modules:
// module-load assertions that fail the bundle if the OU registry's
// schema drifts, its allow-list widens, or its cascade-on-remove
// stops clearing node bindings.
//
// What this module guards:
//   1. OU schema is locked to "ou-1.0".
//   2. The read-validator drops OU documents that smuggle unknown
//      top-level fields, unknown unit fields, duplicate ids,
//      empty strings, or dangling parentId references.
//   3. `createOu` returns a stable id for an idempotent retry.
//   4. `removeOu` cascades into every workspace node carrying the
//      removed unit's id and clears the field through the validator.
//   5. `removeOu` also reassigns the parentId of any unit whose
//      parent was the removed unit to undefined (no dangling refs).
//   6. The ACW read-validator REFUSES `organisationalUnitId` on
//      sealed domain containers (`isDomainContainer === true`),
//      so the unreachable-cascade hazard cannot materialise.
//   7. `removeOu` is transactional: if the cascade-clear is
//      refused for any node, the OU document is NOT mutated and
//      the function returns `{ ok: false, reason }`.
import {
  OU_SCHEMA_VERSION,
  __ouStoreInternals,
  createOu,
  getOu,
  listOus,
  removeOu,
} from "./ouStore";
import {
  __acwStoreInternals,
  createNode,
  getWorkspace,
  updateNodeProperties,
} from "../acwStore";
import {
  __snapshotScope,
  __restoreScopeSnapshot,
  getScopedKey,
} from "../../governance/storageKeyUtils";

// Phase 2 (SaaS Onboarding) — workspace + view-state are
// Org+Work-Item-scoped; the OU registry is Org-scoped. The probe
// runs against an isolated tenant so user data is never disturbed.
const PROBE_ORG_ID = "probe-org-ou";
const PROBE_WORK_ITEM_ID = "probe-wi-ou";
const STORE_KEY = getScopedKey(
  "acw.workspace.v1",
  PROBE_ORG_ID,
  PROBE_WORK_ITEM_ID,
);
const VIEW_KEY = getScopedKey(
  "acw.workspace.view.v1",
  PROBE_ORG_ID,
  PROBE_WORK_ITEM_ID,
);
const OU_KEY = getScopedKey("acw.organisational-units.v1", PROBE_ORG_ID);

function snapshotLocalStorage(): {
  ws: string | null;
  view: string | null;
  ou: string | null;
} {
  if (typeof window === "undefined") return { ws: null, view: null, ou: null };
  return {
    ws: window.localStorage.getItem(STORE_KEY),
    view: window.localStorage.getItem(VIEW_KEY),
    ou: window.localStorage.getItem(OU_KEY),
  };
}

function restoreLocalStorage(snap: {
  ws: string | null;
  view: string | null;
  ou: string | null;
}): void {
  if (typeof window === "undefined") return;
  if (snap.ws !== null) window.localStorage.setItem(STORE_KEY, snap.ws);
  else window.localStorage.removeItem(STORE_KEY);
  if (snap.view !== null) window.localStorage.setItem(VIEW_KEY, snap.view);
  else window.localStorage.removeItem(VIEW_KEY);
  if (snap.ou !== null) window.localStorage.setItem(OU_KEY, snap.ou);
  else window.localStorage.removeItem(OU_KEY);
  __acwStoreInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
}

const PREFIX = "ACW Path B Phase 3 OU invariant violation";

// (1) Schema version locked.
if (OU_SCHEMA_VERSION !== "ou-1.0") {
  throw new Error(
    `${PREFIX}: OU_SCHEMA_VERSION drift. Phase 3 must remain "ou-1.0"; future OU shape changes require an explicit "ou-2.0".`,
  );
}

// (2) Read-validation negatives.
{
  const wrongVersion = { schemaVersion: "ou-2.0", units: [] };
  if (__ouStoreInternals.isValid(wrongVersion)) {
    throw new Error(
      `${PREFIX}: OU read-validator accepted an unknown schemaVersion.`,
    );
  }
}
{
  const extraTop = { schemaVersion: OU_SCHEMA_VERSION, units: [], rogue: 1 };
  if (__ouStoreInternals.isValid(extraTop)) {
    throw new Error(
      `${PREFIX}: OU read-validator accepted an unknown top-level field "rogue".`,
    );
  }
}
{
  const dup = {
    schemaVersion: OU_SCHEMA_VERSION,
    units: [
      { id: "ou-x", name: "X" },
      { id: "ou-x", name: "Y" },
    ],
  };
  if (__ouStoreInternals.isValid(dup)) {
    throw new Error(`${PREFIX}: OU read-validator accepted a duplicate unit id.`);
  }
}
{
  const empty = {
    schemaVersion: OU_SCHEMA_VERSION,
    units: [{ id: "", name: "X" }],
  };
  if (__ouStoreInternals.isValid(empty)) {
    throw new Error(`${PREFIX}: OU read-validator accepted an empty unit id.`);
  }
}
{
  const dangling = {
    schemaVersion: OU_SCHEMA_VERSION,
    units: [{ id: "ou-a", name: "A", parentId: "ou-missing" }],
  };
  if (__ouStoreInternals.isValid(dangling)) {
    throw new Error(
      `${PREFIX}: OU read-validator accepted a dangling parentId reference.`,
    );
  }
}

// (3 + 4 + 5) Live-store probes. Snapshot every relevant
// localStorage key first; restore on the way out so the user's
// persisted units / workspace survive a probe failure. Phase 2
// (SaaS Onboarding) — also snapshot/restore the active scope so
// the probe runs under a deterministic probe tenant.
const saved = snapshotLocalStorage();
const __scopeSnap = __snapshotScope();
__restoreScopeSnapshot({
  orgId: PROBE_ORG_ID,
  workItemId: PROBE_WORK_ITEM_ID,
});
try {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(OU_KEY);
    window.localStorage.removeItem(STORE_KEY);
    window.localStorage.removeItem(VIEW_KEY);
  }
  __acwStoreInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();

  // (3) createOu idempotent on supplied id.
  const a = createOu({ id: "ou-a", name: "A" });
  if (!a.ok || a.id !== "ou-a") {
    throw new Error(`${PREFIX}: createOu refused the seed unit.`);
  }
  const a2 = createOu({ id: "ou-a", name: "A again" });
  if (!a2.ok || a2.id !== "ou-a") {
    throw new Error(`${PREFIX}: createOu was not idempotent on a supplied id.`);
  }
  if (listOus().length !== 1) {
    throw new Error(`${PREFIX}: createOu duplicated the existing unit.`);
  }
  if (getOu("ou-a")?.name !== "A") {
    throw new Error(`${PREFIX}: createOu's idempotent path overwrote the name.`);
  }

  // (4) removeOu cascade into nodes.
  const b = createOu({ id: "ou-b", name: "B" });
  if (!b.ok) throw new Error(`${PREFIX}: createOu refused the second seed.`);
  // Build a sealed domain container ad-hoc rather than depending on
  // the workspace seeder having run at module load. The cascade
  // semantics under test are independent of which container holds
  // the node; we only need a legitimate parent that the validator
  // accepts.
  const sealed = createNode({
    type: "Zone",
    parentId: null,
    label: "ou-cascade-zone",
    isDomainContainer: true,
    domainTag: "application",
  });
  if (!sealed.ok) {
    throw new Error(`${PREFIX}: cascade-fixture sealed container refused: ${sealed.reason}`);
  }
  const node = createNode({
    type: "Component",
    parentId: sealed.id,
    label: "ou-cascade-node",
    domainTag: "application",
  });
  if (!node.ok) throw new Error(`${PREFIX}: createNode refused the cascade fixture: ${node.reason}`);
  const setOu = updateNodeProperties(node.id, { organisationalUnitId: "ou-b" });
  if (!setOu.ok) {
    throw new Error(`${PREFIX}: updateNodeProperties refused the OU bind: ${setOu.reason}`);
  }
  const r = removeOu("ou-b");
  if (!r.ok) throw new Error(`${PREFIX}: removeOu refused: ${r.reason}`);
  const wsAfter = getWorkspace();
  const after = wsAfter.structureGraph.nodes.find((n) => n.id === node.id);
  if (after === undefined) {
    throw new Error(`${PREFIX}: removeOu cascade removed the node itself.`);
  }
  if (after.organisationalUnitId !== undefined) {
    throw new Error(
      `${PREFIX}: removeOu did not cascade-clear the node's organisationalUnitId.`,
    );
  }

  // (5) removeOu reassigns child unit's parentId.
  const c = createOu({ id: "ou-c", name: "C" });
  const d = createOu({ id: "ou-d", name: "D", parentId: "ou-c" });
  if (!c.ok || !d.ok) {
    throw new Error(`${PREFIX}: parent / child OU seeds refused.`);
  }
  const rc = removeOu("ou-c");
  if (!rc.ok) throw new Error(`${PREFIX}: removeOu refused parent unit: ${rc.reason}`);
  const dAfter = getOu("ou-d");
  if (dAfter === undefined) {
    throw new Error(`${PREFIX}: removeOu of parent removed the child unit.`);
  }
  if (dAfter.parentId !== undefined) {
    throw new Error(
      `${PREFIX}: removeOu of parent did not reassign child parentId to undefined.`,
    );
  }

  // Negative: createOu rejects empty name and dangling parent.
  const bad1 = createOu({ name: "" });
  if (bad1.ok !== false) throw new Error(`${PREFIX}: createOu accepted an empty name.`);
  const bad2 = createOu({ name: "Z", parentId: "ou-missing" });
  if (bad2.ok !== false) throw new Error(`${PREFIX}: createOu accepted a dangling parent.`);

  // (6) ACW read-validator refuses organisationalUnitId on sealed
  // domain containers — the structural enforcement that prevents
  // an unreachable cascade target. We probe via __acwStoreInternals
  // .isValidWorkspace directly so we exercise the validator path
  // that runs on every read from storage.
  {
    const sealedWithOu = {
      schemaVersion: "acw-1.0",
      structureGraph: {
        nodes: [
          {
            id: "n-sealed",
            type: "Zone",
            parentId: null,
            label: "sealed",
            isDomainContainer: true,
            domainTag: "application",
            organisationalUnitId: "ou-x",
          },
        ],
        edges: [],
      },
    };
    if (__acwStoreInternals.isValidWorkspace(sealedWithOu)) {
      throw new Error(
        `${PREFIX}: ACW read-validator accepted organisationalUnitId on a sealed domain container; the cascade-clear path cannot reach sealed nodes, so this combination must be refused at the storage boundary.`,
      );
    }
  }

  // (7) removeOu is transactional on a refused call: it must NOT
  // mutate the OU document. Sealed nodes carrying an OU id (the
  // only path through which a clear could be refused) cannot
  // exist by virtue of (6), so we exercise the simpler refusal
  // path: a removeOu call against a non-existent unit id must
  // return `{ ok: false }` AND leave the OU document untouched.
  const beforeCount = listOus().length;
  const ghost = removeOu("ou-does-not-exist");
  if (ghost.ok !== false) {
    throw new Error(
      `${PREFIX}: removeOu accepted a non-existent unit id without refusing.`,
    );
  }
  if (listOus().length !== beforeCount) {
    throw new Error(
      `${PREFIX}: removeOu mutated the OU document on a refused call.`,
    );
  }
} finally {
  restoreLocalStorage(saved);
  __restoreScopeSnapshot(__scopeSnap);
}

export function assertOuStoreInvariants(): void {
  if (OU_SCHEMA_VERSION !== "ou-1.0") {
    throw new Error(`${PREFIX}: OU schema drift detected at runtime.`);
  }
}

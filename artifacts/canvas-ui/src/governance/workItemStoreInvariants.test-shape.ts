// Work-Item registry — build-time invariants.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"wi-1.0"`.
//   2. A round-trip create / list / lookup / remove probe behaves
//      correctly against an isolated localStorage snapshot.
//   3. The Enhancement / Change-Request guard fires when no EA
//      Blueprint exists in the same organisation.
//   4. The "at most one EA Blueprint per organisation" rule fires.
//   5. Malformed ids / orgIds / types are rejected.
//   6. Persisted document shape conforms to the allow-list.

import {
  WORK_ITEM_SCHEMA_VERSION,
  WORK_ITEM_TYPES,
  createWorkItem,
  listWorkItemsForOrg,
  getEaBlueprintForOrg,
  removeAllWorkItemsForOrg,
  removeWorkItem,
} from "./workItemStore";

const EXPECTED_SCHEMA_VERSION = "wi-1.0";
const STORAGE_KEY = "app.work-items.v1";
// `createWorkItem` now verifies the referenced organisation
// exists in `orgStore` (defensive guard against orphan rows under
// tampered localStorage). The probe pre-seeds two synthetic
// organisations directly into the org-store key for the duration
// of the probe and restores the prior content afterwards.
const ORG_STORAGE_KEY = "app.organisations.v1";
const PROBE_ORGS_DOC = JSON.stringify({
  schemaVersion: "org-1.0",
  organisations: {
    "org-probeaaaaaa": {
      id: "org-probeaaaaaa",
      name: "Probe Org A",
      slug: "probe-org-a",
      sector: "private-sector",
      natureOfBusiness: "other",
      logo: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    "org-probebbbbbb": {
      id: "org-probebbbbbb",
      name: "Probe Org B",
      slug: "probe-org-b",
      sector: "private-sector",
      natureOfBusiness: "other",
      logo: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    "org-probexxxxx1": {
      id: "org-probexxxxx1",
      name: "Probe Org X",
      slug: "probe-org-x",
      sector: "private-sector",
      natureOfBusiness: "other",
      logo: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  },
});

if (WORK_ITEM_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `workItemStore invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${WORK_ITEM_SCHEMA_VERSION}".`,
  );
}

const EXPECTED_TYPES = ["ea-blueprint", "project", "enhancement", "change-request"];
if (
  WORK_ITEM_TYPES.length !== EXPECTED_TYPES.length ||
  !EXPECTED_TYPES.every((t, i) => WORK_ITEM_TYPES[i] === t)
) {
  throw new Error(
    `workItemStore invariant: WORK_ITEM_TYPES drifted from the locked enum. ` +
      `Expected [${EXPECTED_TYPES.join(", ")}], got [${WORK_ITEM_TYPES.join(", ")}].`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  const prior = hasWindow ? window.localStorage.getItem(STORAGE_KEY) : null;
  const priorOrgs = hasWindow
    ? window.localStorage.getItem(ORG_STORAGE_KEY)
    : null;
  if (hasWindow) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(ORG_STORAGE_KEY, PROBE_ORGS_DOC);
  }
  try {
    probe();
  } finally {
    if (hasWindow) {
      if (prior === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, prior);
      if (priorOrgs === null) window.localStorage.removeItem(ORG_STORAGE_KEY);
      else window.localStorage.setItem(ORG_STORAGE_KEY, priorOrgs);
    }
  }
}

function assertDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTopLevel = new Set(["schemaVersion", "workItems"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTopLevel.has(k)) {
      throw new Error(
        `workItemStore invariant: persisted doc carries forbidden top-level key "${k}".`,
      );
    }
  }
  const items = (doc.workItems ?? {}) as Record<string, Record<string, unknown>>;
  const allowed = new Set([
    "id",
    "orgId",
    "type",
    "title",
    "description",
    "createdAt",
  ]);
  for (const [wid, wi] of Object.entries(items)) {
    for (const k of Object.keys(wi)) {
      if (!allowed.has(k)) {
        throw new Error(
          `workItemStore invariant: Work Item "${wid}" carries forbidden field "${k}".`,
        );
      }
    }
  }
}

function expectThrow(label: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(
      `workItemStore invariant: validator failed to reject "${label}".`,
    );
  }
}

function probeRoundTrip(): void {
  const orgA = "org-probeaaaaaa";
  const orgB = "org-probebbbbbb";
  // Empty start
  if (listWorkItemsForOrg(orgA).length !== 0) {
    throw new Error("workItemStore invariant: isolated storage was not empty.");
  }

  // Cannot create enhancement without EA Blueprint.
  expectThrow("enhancement before EA Blueprint", () =>
    createWorkItem({ orgId: orgA, type: "enhancement", title: "Should fail" }),
  );
  expectThrow("change-request before EA Blueprint", () =>
    createWorkItem({ orgId: orgA, type: "change-request", title: "Should fail" }),
  );

  // Project type does not require EA Blueprint to exist.
  const proj = createWorkItem({ orgId: orgA, type: "project", title: "Project A" });
  if (proj.type !== "project") {
    throw new Error("workItemStore invariant: project type round-trip failed.");
  }

  // Create EA Blueprint.
  const bp = createWorkItem({
    orgId: orgA,
    type: "ea-blueprint",
    title: "OrgA — EA Blueprint",
  });
  if (getEaBlueprintForOrg(orgA)?.id !== bp.id) {
    throw new Error("workItemStore invariant: getEaBlueprintForOrg round-trip failed.");
  }

  // Cannot create a second EA Blueprint in the same org.
  expectThrow("second EA Blueprint in same org", () =>
    createWorkItem({ orgId: orgA, type: "ea-blueprint", title: "Duplicate" }),
  );

  // Now enhancement / change-request work in orgA.
  const enh = createWorkItem({
    orgId: orgA,
    type: "enhancement",
    title: "Enh A",
  });
  const cr = createWorkItem({
    orgId: orgA,
    type: "change-request",
    title: "CR A",
  });
  if (
    listWorkItemsForOrg(orgA).length !== 4 ||
    listWorkItemsForOrg(orgA)[0].type !== "ea-blueprint"
  ) {
    throw new Error(
      "workItemStore invariant: listWorkItemsForOrg ordering / count drifted.",
    );
  }

  // OrgB is isolated — its enhancement guard fires independently.
  expectThrow("enhancement in unrelated org without blueprint", () =>
    createWorkItem({ orgId: orgB, type: "enhancement", title: "Should fail" }),
  );

  assertDocAllowListShape();

  // Cleanup
  removeWorkItem(enh.id);
  removeWorkItem(cr.id);
  removeWorkItem(proj.id);
  removeWorkItem(bp.id);
  removeAllWorkItemsForOrg(orgA);
  if (listWorkItemsForOrg(orgA).length !== 0) {
    throw new Error("workItemStore invariant: removeAllWorkItemsForOrg left orphans.");
  }
}

function probeRejections(): void {
  expectThrow("malformed orgId", () =>
    createWorkItem({ orgId: "not-an-org-id", type: "project", title: "x" }),
  );
  expectThrow("orgId not registered in orgStore", () =>
    createWorkItem({
      orgId: "org-doesnotexist",
      type: "project",
      title: "x",
    }),
  );
  expectThrow("invalid type", () =>
    createWorkItem({
      orgId: "org-probexxxxx1",
      type: "made-up" as never,
      title: "x",
    }),
  );
  expectThrow("empty title", () =>
    createWorkItem({ orgId: "org-probexxxxx1", type: "project", title: "  " }),
  );
  expectThrow("malformed work-item id", () =>
    createWorkItem({
      id: "not-a-wi-id",
      orgId: "org-probexxxxx1",
      type: "project",
      title: "x",
    }),
  );
}

function run(): void {
  withIsolatedStorage(() => {
    probeRoundTrip();
    probeRejections();
  });
}

run();

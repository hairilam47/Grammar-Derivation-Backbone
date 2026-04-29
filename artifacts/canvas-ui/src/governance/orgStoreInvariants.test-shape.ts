// Organisation registry — build-time invariants.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"org-1.0"`.
//   2. A round-trip create / list / get probe behaves correctly
//      against an isolated localStorage snapshot.
//   3. Creating an organisation auto-seeds an `ea-blueprint`
//      Work Item in the same organisation (the
//      every-org-has-a-blueprint invariant at rest).
//   4. Slug-pattern violations are rejected.
//   5. Sector and natureOfBusiness enum violations are rejected.
//   6. Persisted document shape conforms to the allow-list.

import {
  ORG_SCHEMA_VERSION,
  ORG_SECTORS,
  NATURE_OF_BUSINESS_OPTIONS,
  createOrganisation,
  listOrganisations,
  removeOrganisation,
} from "./orgStore";
import {
  getEaBlueprintForOrg,
  listWorkItemsForOrg,
} from "./workItemStore";

const EXPECTED_SCHEMA_VERSION = "org-1.0";
const ORG_STORAGE_KEY = "app.organisations.v1";
const WI_STORAGE_KEY = "app.work-items.v1";

if (ORG_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `orgStore invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${ORG_SCHEMA_VERSION}".`,
  );
}

const EXPECTED_SECTORS = ["government", "private-sector"];
if (
  ORG_SECTORS.length !== EXPECTED_SECTORS.length ||
  !EXPECTED_SECTORS.every((s, i) => ORG_SECTORS[i] === s)
) {
  throw new Error(
    `orgStore invariant: ORG_SECTORS drifted from the locked enum. ` +
      `Expected [${EXPECTED_SECTORS.join(", ")}], got [${ORG_SECTORS.join(", ")}].`,
  );
}

const EXPECTED_NATURE = [
  "financial-services",
  "healthcare",
  "government-administration",
  "telecommunications",
  "manufacturing",
  "retail",
  "other",
];
if (
  NATURE_OF_BUSINESS_OPTIONS.length !== EXPECTED_NATURE.length ||
  !EXPECTED_NATURE.every((s, i) => NATURE_OF_BUSINESS_OPTIONS[i] === s)
) {
  throw new Error(
    `orgStore invariant: NATURE_OF_BUSINESS_OPTIONS drifted from the locked enum.`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  const priorOrg = hasWindow ? window.localStorage.getItem(ORG_STORAGE_KEY) : null;
  const priorWi = hasWindow ? window.localStorage.getItem(WI_STORAGE_KEY) : null;
  if (hasWindow) {
    window.localStorage.removeItem(ORG_STORAGE_KEY);
    window.localStorage.removeItem(WI_STORAGE_KEY);
  }
  try {
    probe();
  } finally {
    if (hasWindow) {
      if (priorOrg === null) window.localStorage.removeItem(ORG_STORAGE_KEY);
      else window.localStorage.setItem(ORG_STORAGE_KEY, priorOrg);
      if (priorWi === null) window.localStorage.removeItem(WI_STORAGE_KEY);
      else window.localStorage.setItem(WI_STORAGE_KEY, priorWi);
    }
  }
}

function assertOrgDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTopLevel = new Set(["schemaVersion", "organisations"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTopLevel.has(k)) {
      throw new Error(
        `orgStore invariant: persisted doc carries forbidden top-level key "${k}".`,
      );
    }
  }
  const orgs = (doc.organisations ?? {}) as Record<string, Record<string, unknown>>;
  const allowed = new Set([
    "id",
    "name",
    "slug",
    "sector",
    "natureOfBusiness",
    "logo",
    "createdAt",
  ]);
  for (const [oid, org] of Object.entries(orgs)) {
    for (const k of Object.keys(org)) {
      if (!allowed.has(k)) {
        throw new Error(
          `orgStore invariant: org "${oid}" carries forbidden field "${k}".`,
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
      `orgStore invariant: validator failed to reject "${label}".`,
    );
  }
}

function probeRoundTrip(): void {
  if (listOrganisations().length !== 0) {
    throw new Error("orgStore invariant: isolated storage was not empty.");
  }
  const r1 = createOrganisation({
    name: "Probe Org Alpha",
    sector: "government",
    natureOfBusiness: "government-administration",
  });
  // Auto-seeded EA Blueprint must exist for the new org.
  const bp = getEaBlueprintForOrg(r1.organisation.id);
  if (!bp || bp.id !== r1.eaBlueprintWorkItemId) {
    throw new Error(
      "orgStore invariant: createOrganisation did not auto-seed an EA Blueprint Work Item.",
    );
  }
  if (listWorkItemsForOrg(r1.organisation.id).length !== 1) {
    throw new Error(
      "orgStore invariant: auto-seeded EA Blueprint must be the only Work Item for a fresh org.",
    );
  }
  const r2 = createOrganisation({
    name: "Probe Org Beta",
    sector: "private-sector",
    natureOfBusiness: "financial-services",
  });
  if (r1.organisation.id === r2.organisation.id) {
    throw new Error("orgStore invariant: duplicate org ids.");
  }
  if (r1.organisation.slug === r2.organisation.slug) {
    throw new Error("orgStore invariant: duplicate slugs.");
  }
  if (listOrganisations().length !== 2) {
    throw new Error(
      `orgStore invariant: expected 2 orgs after create, got ${listOrganisations().length}.`,
    );
  }
  assertOrgDocAllowListShape();
  removeOrganisation(r1.organisation.id);
  removeOrganisation(r2.organisation.id);
  if (listOrganisations().length !== 0) {
    throw new Error("orgStore invariant: removeOrganisation left orphans.");
  }
  if (listWorkItemsForOrg(r1.organisation.id).length !== 0) {
    throw new Error(
      "orgStore invariant: removeOrganisation left orphan Work Items.",
    );
  }
}

function probeRejections(): void {
  expectThrow("empty name", () =>
    createOrganisation({
      name: "  ",
      sector: "government",
      natureOfBusiness: "other",
    }),
  );
  expectThrow("invalid sector", () =>
    createOrganisation({
      name: "x",
      sector: "made-up" as never,
      natureOfBusiness: "other",
    }),
  );
  expectThrow("invalid natureOfBusiness", () =>
    createOrganisation({
      name: "x",
      sector: "government",
      natureOfBusiness: "made-up" as never,
    }),
  );
  expectThrow("malformed org id", () =>
    createOrganisation({
      id: "not-an-org-id",
      name: "x",
      sector: "government",
      natureOfBusiness: "other",
    }),
  );
  expectThrow("malformed slug", () =>
    createOrganisation({
      slug: "Bad Slug With Spaces",
      name: "x",
      sector: "government",
      natureOfBusiness: "other",
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

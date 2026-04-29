// Module Catalogue store — build-time invariants.
//
// File suffix `.test-shape.ts` mirrors the architecture-attachment /
// CTAD / ACW negative-shape pattern: this module's exports are
// build-time predicates, not feature surface. Removing this file
// plus its side-effect import in `App.tsx` reverts the catalogue
// to its pre-invariant shape.
//
// Asserts at module load:
//   1. The schema-version constant is exactly `"mod-1.0"`.
//   2. A round-trip create / list / update / remove probe behaves
//      correctly against an isolated localStorage snapshot.
//   3. `relatedCapabilityIds` validation rejects unknown / malformed
//      capability ids.
//   4. `id` validator rejects malformed module ids.
//   5. Persisted document shape conforms to the allow-list:
//      top-level keys = { schemaVersion, modules }; each module =
//      { id, name, description, relatedCapabilityIds }.

import {
  MODULE_CATALOG_SCHEMA_VERSION,
  createModule,
  updateModule,
  removeModule,
  listModules,
  getModule,
} from "./moduleCatalogStore";
import { CAPABILITIES } from "@workspace/architecture-grammar";

const EXPECTED_SCHEMA_VERSION = "mod-1.0";
const STORAGE_KEY = "adc.module-catalog.v1";

if (MODULE_CATALOG_SCHEMA_VERSION !== EXPECTED_SCHEMA_VERSION) {
  throw new Error(
    `Module-catalog invariant: schema-version constant drifted. ` +
      `Expected "${EXPECTED_SCHEMA_VERSION}", got "${MODULE_CATALOG_SCHEMA_VERSION}". ` +
      `Bumping the schema requires a deterministic read-time migration.`,
  );
}

function withIsolatedStorage(probe: () => void): void {
  const hasWindow = typeof window !== "undefined" && !!window.localStorage;
  const prior = hasWindow ? window.localStorage.getItem(STORAGE_KEY) : null;
  if (hasWindow) window.localStorage.removeItem(STORAGE_KEY);
  try {
    probe();
  } finally {
    if (hasWindow) {
      if (prior === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, prior);
    }
  }
}

function assertDocAllowListShape(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) return;
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const allowedTopLevel = new Set(["schemaVersion", "modules"]);
  for (const k of Object.keys(doc)) {
    if (!allowedTopLevel.has(k)) {
      throw new Error(
        `Module-catalog invariant: persisted doc carries forbidden top-level key "${k}". ` +
          `Allow-list = { schemaVersion, modules }.`,
      );
    }
  }
  const modules = (doc.modules ?? {}) as Record<string, Record<string, unknown>>;
  const allowedModuleKeys = new Set([
    "id",
    "name",
    "description",
    "relatedCapabilityIds",
  ]);
  for (const [mid, mod] of Object.entries(modules)) {
    for (const k of Object.keys(mod)) {
      if (!allowedModuleKeys.has(k)) {
        throw new Error(
          `Module-catalog invariant: module "${mid}" carries forbidden field "${k}". ` +
            `Allow-list = { id, name, description, relatedCapabilityIds }.`,
        );
      }
    }
  }
}

function probeRoundTrip(): void {
  if (listModules().length !== 0) {
    throw new Error(
      "Module-catalog invariant: isolated storage was not empty at probe start.",
    );
  }
  const cap = CAPABILITIES[0]?.id ?? "";
  const m1 = createModule({
    name: "Probe Module Alpha",
    description: "alpha description",
    relatedCapabilityIds: cap ? [cap] : [],
  });
  const m2 = createModule({
    name: "Probe Module Beta",
    description: "",
    relatedCapabilityIds: [],
  });
  if (m1.id === m2.id) {
    throw new Error(
      "Module-catalog invariant: createModule produced duplicate module ids.",
    );
  }
  if (!getModule(m1.id) || !getModule(m2.id)) {
    throw new Error(
      "Module-catalog invariant: getModule failed to return a freshly created module.",
    );
  }
  if (listModules().length !== 2) {
    throw new Error(
      `Module-catalog invariant: expected 2 modules after create, got ${listModules().length}.`,
    );
  }
  const updated = updateModule(m1.id, { name: "Renamed Alpha" });
  if (updated.name !== "Renamed Alpha") {
    throw new Error("Module-catalog invariant: updateModule did not apply name patch.");
  }
  assertDocAllowListShape();
  removeModule(m1.id);
  removeModule(m2.id);
  if (listModules().length !== 0) {
    throw new Error(
      "Module-catalog invariant: removeModule left orphans in the document.",
    );
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
      `Module-catalog invariant: validator failed to reject "${label}".`,
    );
  }
}

function probeValidatorRejection(): void {
  expectThrow("empty module name", () =>
    createModule({ name: "   ", relatedCapabilityIds: [] }),
  );
  expectThrow("malformed module id", () =>
    createModule({ id: "not-a-module-id", name: "x", relatedCapabilityIds: [] }),
  );
  expectThrow("unknown capability id", () =>
    createModule({
      name: "Unknown cap",
      relatedCapabilityIds: ["CAP_NOT_REAL_FAKE"],
    }),
  );
  expectThrow("non-string capability id", () =>
    createModule({
      name: "Non-string cap",
      relatedCapabilityIds: [123 as unknown as string],
    }),
  );
}

function run(): void {
  withIsolatedStorage(() => {
    probeRoundTrip();
    probeValidatorRejection();
  });
}

run();

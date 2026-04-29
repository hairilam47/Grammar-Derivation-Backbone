// Runtime invariant for `legacyMigration.ts`.
//
// Phase 2 (SaaS Onboarding). Probes the legacy-migration helper
// inside an isolated localStorage snapshot so it never perturbs
// real user data. The migration target is DETERMINISTIC
// (first-created Organisation + that org's auto-seeded EA
// Blueprint Work Item) — NOT the user's currently-selected
// scope — so this probe seeds two organisations (orderA before
// orderB) and a Project Work Item under orderB to prove that:
//
//   (T) Deterministic targeting — pre-Phase-2 flat data lands
//       under orderA + blueprintA scoped keys, never under orderB
//       or under non-blueprint Work Items, regardless of which
//       Work Item happens to be active in the UI.
//   (1) Idempotency — the second call after a successful first
//       call reports `ran === false` and does not touch any key.
//   (2) Sentinel guard — after a successful migration the
//       `app:legacyMigration.v1` key is set to `"done"` and a
//       subsequent call short-circuits.
//   (3) Routing — an org-only legacy key lands at
//       `<orgA>:<baseKey>` and an org+wi legacy key lands at
//       `<orgA>:<blueprintA>:<baseKey>`. The flat keys are LEFT
//       IN PLACE (copy-only migration; sentinel prevents
//       re-import).
//   (4) No clobber — a flat key whose target tenant slot already
//       has a document is reported as skipped, the existing target
//       is preserved, and the flat key is left in place.
//   (5) No-anchor no-op — when no Organisation has been created
//       yet, the migration short-circuits without setting the
//       sentinel so a later call (after the first org is created)
//       still has a chance to run.

import {
  ALL_LEGACY_FLAT_KEYS,
  LEGACY_MIGRATION_SENTINEL_KEY,
  ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS,
  ORG_SCOPED_LEGACY_KEYS,
  __resetLegacyMigrationSentinelForTest,
  migrateLegacyFlatKeysIfNeeded,
} from "./legacyMigration";
import { getScopedKey } from "./storageKeyUtils";
import { BASE_STORAGE_KEY as PORTFOLIO_BASE_KEY } from "./portfolioStore";
import { BASE_STORAGE_KEY as SIGNALS_BASE_KEY } from "./signalsStore";
import { BASE_STORAGE_KEY as REQUIREMENTS_BASE_KEY } from "./requirementsStore";
import { BASE_STORAGE_KEY as REQUIREMENTS_CONTRACT_BASE_KEY } from "./requirementsContractStore";
import { BASE_STORAGE_KEY as ARCHITECTURE_ATTACHMENT_BASE_KEY } from "./architectureAttachmentStore";
import { BASE_STORAGE_KEY as MODULE_CATALOG_BASE_KEY } from "./moduleCatalogStore";
import { BASE_STORAGE_KEY as CTAD_STATE_BASE_KEY } from "../ctad/ctadStore";
import { BASE_STORAGE_KEY as CTAD_APPLIED_CARDS_BASE_KEY } from "../ctad/ctadAppliedCardsStore";
import { BASE_STORAGE_KEY as CTAD_CONSTRAINTS_BASE_KEY } from "../ctad/ctadConstraintsStore";
import { BASE_STORAGE_KEY as ACW_BASE_KEY } from "../acw/acwStore";
import { BASE_STORAGE_KEY as ACW_VIEW_BASE_KEY } from "../acw/acwViewState";
import { BASE_STORAGE_KEY as ACW_VIEWPREFS_BASE_KEY } from "../acw/acwWorkspaceViewPrefs";
import { BASE_STORAGE_KEY as OU_BASE_KEY } from "../acw/orgUnits/ouStore";
import { BASE_STORAGE_KEY as TRACK3_VIEWPREFS_BASE_KEY } from "../acw/track3/track3ViewPrefs";

// Deterministic anchors used by the probe. orderA is created
// FIRST (older `createdAt`) and therefore must be the migration
// target. orderB is created SECOND and is left as the active UI
// scope — the probe proves it never receives migrated data.
const ORDER_A_ORG = "org-aaaaaa000001";
const ORDER_A_BLUEPRINT_WI = "wi-aaaaaa000002";
const ORDER_B_ORG = "org-bbbbbb000003";
const ORDER_B_PROJECT_WI = "wi-bbbbbb000004";

const ORDER_A_CREATED_AT = "2026-01-01T00:00:00.000Z";
const ORDER_B_CREATED_AT = "2026-06-01T00:00:00.000Z";

const ORG_STORAGE_KEY = "app.organisations.v1";
const WORK_ITEM_STORAGE_KEY = "app.work-items.v1";

function buildOrgsDoc(): string {
  return JSON.stringify({
    schemaVersion: "org-1.0",
    organisations: {
      [ORDER_A_ORG]: {
        id: ORDER_A_ORG,
        name: "Order A Org",
        slug: "order-a-org",
        sector: "private-sector",
        natureOfBusiness: "other",
        logo: "",
        createdAt: ORDER_A_CREATED_AT,
      },
      [ORDER_B_ORG]: {
        id: ORDER_B_ORG,
        name: "Order B Org",
        slug: "order-b-org",
        sector: "private-sector",
        natureOfBusiness: "other",
        logo: "",
        createdAt: ORDER_B_CREATED_AT,
      },
    },
  });
}

function buildWorkItemsDoc(): string {
  // Deliberately includes ONLY a blueprint under orderA and a
  // Project under orderB. orderB has no blueprint, and orderA has
  // no Project — the first-org + blueprint resolver must pick
  // (orderA, blueprintA) regardless of how the dict is iterated.
  return JSON.stringify({
    schemaVersion: "wi-1.0",
    workItems: {
      [ORDER_A_BLUEPRINT_WI]: {
        id: ORDER_A_BLUEPRINT_WI,
        orgId: ORDER_A_ORG,
        type: "ea-blueprint",
        title: "Order A Blueprint",
        description: "",
        createdAt: ORDER_A_CREATED_AT,
      },
      [ORDER_B_PROJECT_WI]: {
        id: ORDER_B_PROJECT_WI,
        orgId: ORDER_B_ORG,
        type: "project",
        title: "Order B Project",
        description: "",
        createdAt: ORDER_B_CREATED_AT,
      },
    },
  });
}

/**
 * (0) — Static cross-check: every store's `BASE_STORAGE_KEY` must
 * appear in exactly one of `ORG_SCOPED_LEGACY_KEYS` /
 * `ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS`, with the right scope
 * tier. Drift here (e.g. a store renames its key without updating
 * `legacyMigration.ts`) silently strands pre-Phase-2 data. This is
 * a build-time-shaped runtime probe so the violation surfaces on
 * the next page load instead of on a future user's migration.
 */
function assertLegacyKeysCoverEveryStore(): void {
  const expectedOrgOnly: ReadonlySet<string> = new Set([
    MODULE_CATALOG_BASE_KEY,
    OU_BASE_KEY,
  ]);
  const expectedOrgAndWi: ReadonlySet<string> = new Set([
    PORTFOLIO_BASE_KEY,
    SIGNALS_BASE_KEY,
    REQUIREMENTS_BASE_KEY,
    REQUIREMENTS_CONTRACT_BASE_KEY,
    ARCHITECTURE_ATTACHMENT_BASE_KEY,
    CTAD_STATE_BASE_KEY,
    CTAD_APPLIED_CARDS_BASE_KEY,
    CTAD_CONSTRAINTS_BASE_KEY,
    ACW_BASE_KEY,
    ACW_VIEW_BASE_KEY,
    ACW_VIEWPREFS_BASE_KEY,
    TRACK3_VIEWPREFS_BASE_KEY,
  ]);
  const declaredOrgOnly = new Set(ORG_SCOPED_LEGACY_KEYS);
  const declaredOrgAndWi = new Set(ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS);
  for (const k of expectedOrgOnly) {
    if (!declaredOrgOnly.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: ORG_SCOPED_LEGACY_KEYS is missing the org-only store key "${k}". Pre-Phase-2 data for this store will not be migrated.`,
      );
    }
    if (declaredOrgAndWi.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: store key "${k}" is declared as Org-only by its store but appears in ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS — scope tier mismatch.`,
      );
    }
  }
  for (const k of expectedOrgAndWi) {
    if (!declaredOrgAndWi.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS is missing the org+work-item store key "${k}". Pre-Phase-2 data for this store will not be migrated.`,
      );
    }
    if (declaredOrgOnly.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: store key "${k}" is declared as Org+Work-Item by its store but appears in ORG_SCOPED_LEGACY_KEYS — scope tier mismatch.`,
      );
    }
  }
  // No undeclared keys allowed: everything in the legacy lists must
  // map back to a real store.
  for (const k of declaredOrgOnly) {
    if (!expectedOrgOnly.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: ORG_SCOPED_LEGACY_KEYS contains "${k}" but no store reports this as its BASE_STORAGE_KEY at the Org-only tier.`,
      );
    }
  }
  for (const k of declaredOrgAndWi) {
    if (!expectedOrgAndWi.has(k)) {
      throw new Error(
        `legacyMigrationInvariants: ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS contains "${k}" but no store reports this as its BASE_STORAGE_KEY at the Org+Work-Item tier.`,
      );
    }
  }
}

function runProbe(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  // (0) — static cross-check first; a drift here is a code-level
  // bug, not a runtime/state condition, so we surface it before
  // the localStorage probes.
  assertLegacyKeysCoverEveryStore();

  // Snapshot every key this probe could touch so we can fully
  // restore them at the end (org/work-item registry docs included).
  const touched = new Set<string>([
    LEGACY_MIGRATION_SENTINEL_KEY,
    ORG_STORAGE_KEY,
    WORK_ITEM_STORAGE_KEY,
    ...ALL_LEGACY_FLAT_KEYS,
  ]);
  for (const baseKey of ORG_SCOPED_LEGACY_KEYS) {
    touched.add(getScopedKey(baseKey, ORDER_A_ORG));
    touched.add(getScopedKey(baseKey, ORDER_B_ORG));
  }
  for (const baseKey of ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS) {
    touched.add(getScopedKey(baseKey, ORDER_A_ORG, ORDER_A_BLUEPRINT_WI));
    touched.add(getScopedKey(baseKey, ORDER_B_ORG, ORDER_B_PROJECT_WI));
  }
  const snapshot = new Map<string, string | null>();
  for (const k of touched) snapshot.set(k, window.localStorage.getItem(k));

  // Fresh probe space.
  for (const k of touched) window.localStorage.removeItem(k);
  __resetLegacyMigrationSentinelForTest();

  try {
    // (5) — no-anchor no-op runs FIRST, before we seed the
    // registries: with no orgs in the registry the migration must
    // be a no-op and MUST NOT spend the sentinel.
    const noAnchor = migrateLegacyFlatKeysIfNeeded();
    if (noAnchor.ran) {
      throw new Error(
        "legacyMigrationInvariants: no-anchor call reported ran === true.",
      );
    }
    if (
      window.localStorage.getItem(LEGACY_MIGRATION_SENTINEL_KEY) === "done"
    ) {
      throw new Error(
        "legacyMigrationInvariants: no-anchor call spent the sentinel — a later anchored call would now be impossible.",
      );
    }

    // Seed the org + work-item registries with two orgs, where
    // orderA is older than orderB, and a Project under orderB
    // (NOT under orderA) so that the resolver MUST resolve to
    // orderA + blueprintA — not the active selection.
    window.localStorage.setItem(ORG_STORAGE_KEY, buildOrgsDoc());
    window.localStorage.setItem(WORK_ITEM_STORAGE_KEY, buildWorkItemsDoc());

    // (T, 1, 3) — deterministic targeting + routing + idempotency.
    // Seed legacy flat data and run the migration. The active
    // user selection (notional) is orderB + projectB; the
    // migration MUST still land everything under
    // orderA + blueprintA.
    const orgOnlyBase = ORG_SCOPED_LEGACY_KEYS[0];
    const orgWiBase = ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS[0];
    window.localStorage.setItem(orgOnlyBase, "ORG_ONLY_BLOB");
    window.localStorage.setItem(orgWiBase, "ORG_WI_BLOB");

    const r1 = migrateLegacyFlatKeysIfNeeded();
    if (!r1.ran) {
      throw new Error(
        "legacyMigrationInvariants: anchored call did not run.",
      );
    }
    if (r1.targetOrgId !== ORDER_A_ORG) {
      throw new Error(
        `legacyMigrationInvariants: migration targeted orgId="${r1.targetOrgId}" — expected first-created org "${ORDER_A_ORG}".`,
      );
    }
    if (r1.targetWorkItemId !== ORDER_A_BLUEPRINT_WI) {
      throw new Error(
        `legacyMigrationInvariants: migration targeted workItemId="${r1.targetWorkItemId}" — expected first-created org's EA Blueprint "${ORDER_A_BLUEPRINT_WI}".`,
      );
    }

    // Copy-only contract: the flat keys must be LEFT IN PLACE so
    // a one-release safety-net rollback can still see them.
    if (window.localStorage.getItem(orgOnlyBase) !== "ORG_ONLY_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org-only flat key "${orgOnlyBase}" was modified — migration must be copy-only.`,
      );
    }
    if (window.localStorage.getItem(orgWiBase) !== "ORG_WI_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org+wi flat key "${orgWiBase}" was modified — migration must be copy-only.`,
      );
    }

    // Routing: data lands under orderA + blueprintA, NOT under
    // orderB / orderB-project.
    const orgOnlyTargetA = getScopedKey(orgOnlyBase, ORDER_A_ORG);
    if (window.localStorage.getItem(orgOnlyTargetA) !== "ORG_ONLY_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org-only legacy blob did not land at first-org slot "${orgOnlyTargetA}".`,
      );
    }
    const orgWiTargetA = getScopedKey(
      orgWiBase,
      ORDER_A_ORG,
      ORDER_A_BLUEPRINT_WI,
    );
    if (window.localStorage.getItem(orgWiTargetA) !== "ORG_WI_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org+wi legacy blob did not land at first-org+blueprint slot "${orgWiTargetA}".`,
      );
    }
    // Anti-targets — orderB must remain empty.
    const orgOnlyTargetB = getScopedKey(orgOnlyBase, ORDER_B_ORG);
    if (window.localStorage.getItem(orgOnlyTargetB) !== null) {
      throw new Error(
        `legacyMigrationInvariants: org-only legacy blob LEAKED into second-org slot "${orgOnlyTargetB}".`,
      );
    }
    const orgWiTargetB = getScopedKey(
      orgWiBase,
      ORDER_B_ORG,
      ORDER_B_PROJECT_WI,
    );
    if (window.localStorage.getItem(orgWiTargetB) !== null) {
      throw new Error(
        `legacyMigrationInvariants: org+wi legacy blob LEAKED into second-org's Project slot "${orgWiTargetB}".`,
      );
    }

    // (2) — sentinel guard
    if (
      window.localStorage.getItem(LEGACY_MIGRATION_SENTINEL_KEY) !== "done"
    ) {
      throw new Error(
        "legacyMigrationInvariants: sentinel key was not set after a successful migration.",
      );
    }
    const r2 = migrateLegacyFlatKeysIfNeeded();
    if (r2.ran) {
      throw new Error(
        "legacyMigrationInvariants: second call ran despite the sentinel being set.",
      );
    }

    // (4) — no-clobber. Reset the sentinel, prime the orderA
    // blueprint slot with an existing tenant document and a fresh
    // legacy blob, and verify the helper refuses to overwrite the
    // tenant slot but still leaves the flat key in place.
    __resetLegacyMigrationSentinelForTest();
    window.localStorage.setItem(orgWiBase, "FRESH_BLOB");
    window.localStorage.setItem(orgWiTargetA, "EXISTING_TENANT_BLOB");
    const r3 = migrateLegacyFlatKeysIfNeeded();
    if (!r3.ran) {
      throw new Error(
        "legacyMigrationInvariants: post-reset call did not run.",
      );
    }
    if (!r3.skippedKeys.includes(orgWiBase)) {
      throw new Error(
        `legacyMigrationInvariants: expected "${orgWiBase}" to appear in skippedKeys when target slot is occupied.`,
      );
    }
    if (window.localStorage.getItem(orgWiBase) !== "FRESH_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: skipped flat key "${orgWiBase}" must be left in place when the target slot is occupied.`,
      );
    }
    if (window.localStorage.getItem(orgWiTargetA) !== "EXISTING_TENANT_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: existing tenant slot "${orgWiTargetA}" was clobbered.`,
      );
    }
  } finally {
    // Restore every touched key.
    for (const [k, v] of snapshot.entries()) {
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    }
  }
}

if (typeof window !== "undefined" && window.localStorage) {
  runProbe();
}

export {};

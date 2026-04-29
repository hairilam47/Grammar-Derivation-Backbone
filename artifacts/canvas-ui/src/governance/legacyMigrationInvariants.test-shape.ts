// Runtime invariant for `legacyMigration.ts`.
//
// Phase 2 (SaaS Onboarding). Probes the legacy-migration helper
// inside an isolated localStorage snapshot so it never perturbs
// real user data:
//
//   1. Idempotency — the second call after a successful first call
//      reports `ran === false` and does not touch any key.
//   2. Sentinel guard — after a successful migration the
//      `app:legacyMigration.v1` key is set to `"done"` and a
//      subsequent call short-circuits.
//   3. Routing — an org-only legacy key lands at
//      `<orgId>:<baseKey>` and an org+wi legacy key lands at
//      `<orgId>:<wiId>:<baseKey>`. The flat keys are LEFT IN
//      PLACE (copy-only migration; sentinel prevents re-import).
//   4. No clobber — a flat key whose target tenant slot already
//      has a document is reported as skipped, the existing target
//      is preserved, and the flat key is left in place.
//   5. Malformed-id rejection — invalid orgId / workItemId throws
//      synchronously and writes nothing.

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

  const PROBE_ORG = "org-aaaaaa000001";
  const PROBE_WI = "wi-aaaaaa000002";
  const PROBE_OTHER_ORG = "org-bbbbbb000003";
  const PROBE_OTHER_WI = "wi-bbbbbb000004";

  // Snapshot every key this probe could touch so we can fully
  // restore them at the end.
  const touched = new Set<string>([
    LEGACY_MIGRATION_SENTINEL_KEY,
    ...ALL_LEGACY_FLAT_KEYS,
  ]);
  for (const baseKey of ORG_SCOPED_LEGACY_KEYS) {
    touched.add(getScopedKey(baseKey, PROBE_ORG));
    touched.add(getScopedKey(baseKey, PROBE_OTHER_ORG));
  }
  for (const baseKey of ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS) {
    touched.add(getScopedKey(baseKey, PROBE_ORG, PROBE_WI));
    touched.add(getScopedKey(baseKey, PROBE_OTHER_ORG, PROBE_OTHER_WI));
  }
  const snapshot = new Map<string, string | null>();
  for (const k of touched) snapshot.set(k, window.localStorage.getItem(k));

  // Fresh probe space.
  for (const k of touched) window.localStorage.removeItem(k);
  __resetLegacyMigrationSentinelForTest();

  try {
    // (1) — idempotency / routing
    const orgOnlyBase = ORG_SCOPED_LEGACY_KEYS[0];
    const orgWiBase = ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS[0];
    window.localStorage.setItem(orgOnlyBase, "ORG_ONLY_BLOB");
    window.localStorage.setItem(orgWiBase, "ORG_WI_BLOB");

    const r1 = migrateLegacyFlatKeysIfNeeded(PROBE_ORG, PROBE_WI);
    if (!r1.ran) {
      throw new Error(
        "legacyMigrationInvariants: first call did not run (sentinel state corrupted).",
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
    const orgOnlyTarget = getScopedKey(orgOnlyBase, PROBE_ORG);
    if (window.localStorage.getItem(orgOnlyTarget) !== "ORG_ONLY_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org-only legacy blob did not land at "${orgOnlyTarget}".`,
      );
    }
    const orgWiTarget = getScopedKey(orgWiBase, PROBE_ORG, PROBE_WI);
    if (window.localStorage.getItem(orgWiTarget) !== "ORG_WI_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: org+wi legacy blob did not land at "${orgWiTarget}".`,
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
    const r2 = migrateLegacyFlatKeysIfNeeded(PROBE_ORG, PROBE_WI);
    if (r2.ran) {
      throw new Error(
        "legacyMigrationInvariants: second call ran despite the sentinel being set.",
      );
    }

    // (4) — no-clobber
    __resetLegacyMigrationSentinelForTest();
    window.localStorage.setItem(orgWiBase, "FRESH_BLOB");
    // Pre-populate the target tenant slot so we can verify the
    // helper refuses to overwrite.
    const otherTarget = getScopedKey(orgWiBase, PROBE_OTHER_ORG, PROBE_OTHER_WI);
    window.localStorage.setItem(otherTarget, "EXISTING_TENANT_BLOB");
    const r3 = migrateLegacyFlatKeysIfNeeded(PROBE_OTHER_ORG, PROBE_OTHER_WI);
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
    if (window.localStorage.getItem(otherTarget) !== "EXISTING_TENANT_BLOB") {
      throw new Error(
        `legacyMigrationInvariants: existing tenant slot "${otherTarget}" was clobbered.`,
      );
    }

    // (5) — malformed-id rejection
    __resetLegacyMigrationSentinelForTest();
    let threw = false;
    try {
      migrateLegacyFlatKeysIfNeeded("not-an-org", PROBE_WI);
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        "legacyMigrationInvariants: malformed orgId did not throw.",
      );
    }
    threw = false;
    try {
      migrateLegacyFlatKeysIfNeeded(PROBE_ORG, "not-a-wi");
    } catch {
      threw = true;
    }
    if (!threw) {
      throw new Error(
        "legacyMigrationInvariants: malformed workItemId did not throw.",
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

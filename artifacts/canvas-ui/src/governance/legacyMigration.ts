// One-shot migration of legacy flat localStorage keys into the
// Phase 2 (SaaS Onboarding) scoped key namespace.
//
// Before Phase 2, every store wrote to a flat key
// (`adc.portfolio.v1`, `ctad.state.v1`, `acw.workspace.v1`, ...)
// with no tenant prefix. After Phase 2, the same documents live
// under `<orgId>:<workItemId>:<baseKey>` (Work-Item-scoped) or
// `<orgId>:<baseKey>` (Org-scoped).
//
// This module runs ONCE, the first time the user resolves both an
// Organisation and a Work Item. It COPIES any pre-Phase-2 flat
// document into the active tenant's scoped namespace and LEAVES
// the original flat document in place for one release as a safety
// net — if the user ever needs to roll back to a pre-Phase-2 build
// or wants to re-export the legacy blob for diagnosis, the flat
// document is still there. A sentinel key
// (`app:legacyMigration.v1`) records the completion so a second
// page load (or a switch into a different tenant) does NOT re-copy
// the legacy blob into a second organisation.
//
// The migration is intentionally narrow: it touches only the
// pre-Phase-2 flat keys we shipped, never any other localStorage
// entry. Any flat key not in `LEGACY_FLAT_KEYS` is left untouched.

import { getScopedKey } from "./storageKeyUtils";

export const LEGACY_MIGRATION_SENTINEL_KEY = "app:legacyMigration.v1";

// Pre-Phase-2 flat keys, classified by scope. The classification
// MUST match the scope each store reads in its refactored
// `getStorageKey()` accessor — drift here would route data into a
// namespace the store never reads from.
export const ORG_SCOPED_LEGACY_KEYS: readonly string[] = [
  "adc.module-catalog.v1",
  "acw.organisational-units.v1",
];

export const ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS: readonly string[] = [
  "adc.portfolio.v1",
  "adc.policy-signals.v1",
  "adc.requirements.v1",
  "adc.requirements-contracts.v1",
  "adc.architecture-attachments.v1",
  "ctad.state.v1",
  "ctad.applied-cards.v1",
  "ctad.constraints.v1",
  "acw.workspace.v1",
  "acw.workspace.view.v1",
  "acw.workspace.viewprefs.v1",
  "acw.track3.viewprefs.v1",
];

export const ALL_LEGACY_FLAT_KEYS: readonly string[] = [
  ...ORG_SCOPED_LEGACY_KEYS,
  ...ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS,
];

const ORG_ID_RE = /^org-[a-z0-9]+$/;
const WORK_ITEM_ID_RE = /^wi-[a-z0-9]+$/;

export interface LegacyMigrationResult {
  readonly ran: boolean;
  readonly migratedKeys: readonly string[];
  readonly skippedKeys: readonly string[];
}

/**
 * Migrate any pre-Phase-2 flat localStorage entries into the
 * Phase 2 scoped namespace under (orgId, workItemId). Idempotent —
 * a sentinel key short-circuits subsequent calls. Throws on
 * malformed orgId / workItemId so a caller cannot silently route
 * data into an invalid namespace.
 */
export function migrateLegacyFlatKeysIfNeeded(
  orgId: string,
  workItemId: string,
): LegacyMigrationResult {
  if (typeof window === "undefined" || !window.localStorage) {
    return { ran: false, migratedKeys: [], skippedKeys: [] };
  }
  if (!ORG_ID_RE.test(orgId)) {
    throw new Error(
      `legacyMigration: invalid orgId "${orgId}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  if (!WORK_ITEM_ID_RE.test(workItemId)) {
    throw new Error(
      `legacyMigration: invalid workItemId "${workItemId}". Expected pattern ${WORK_ITEM_ID_RE.source}.`,
    );
  }
  const sentinel = window.localStorage.getItem(LEGACY_MIGRATION_SENTINEL_KEY);
  if (sentinel === "done") {
    return { ran: false, migratedKeys: [], skippedKeys: [] };
  }

  const migrated: string[] = [];
  const skipped: string[] = [];

  // Copy-only: never remove the flat key. The sentinel below
  // prevents a second migration into a different tenant.
  for (const baseKey of ORG_SCOPED_LEGACY_KEYS) {
    const flat = window.localStorage.getItem(baseKey);
    if (flat === null) continue;
    const targetKey = getScopedKey(baseKey, orgId);
    const existing = window.localStorage.getItem(targetKey);
    if (existing !== null) {
      // Target tenant already has a document under this key —
      // refuse to overwrite. The flat key is left in place either
      // way (copy-only).
      skipped.push(baseKey);
      continue;
    }
    window.localStorage.setItem(targetKey, flat);
    migrated.push(baseKey);
  }

  for (const baseKey of ORG_AND_WORK_ITEM_SCOPED_LEGACY_KEYS) {
    const flat = window.localStorage.getItem(baseKey);
    if (flat === null) continue;
    const targetKey = getScopedKey(baseKey, orgId, workItemId);
    const existing = window.localStorage.getItem(targetKey);
    if (existing !== null) {
      skipped.push(baseKey);
      continue;
    }
    window.localStorage.setItem(targetKey, flat);
    migrated.push(baseKey);
  }

  // Mark the sentinel even if nothing was migrated — the migration
  // is a one-shot event keyed on "the user has an active scope for
  // the first time", not on "there was something to migrate".
  window.localStorage.setItem(LEGACY_MIGRATION_SENTINEL_KEY, "done");

  return { ran: true, migratedKeys: migrated, skippedKeys: skipped };
}

/** Test hook — clears the sentinel so the next call re-runs. */
export function __resetLegacyMigrationSentinelForTest(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(LEGACY_MIGRATION_SENTINEL_KEY);
}

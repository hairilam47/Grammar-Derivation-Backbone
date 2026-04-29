// One-shot migration of legacy flat localStorage keys into the
// Phase 2 (SaaS Onboarding) scoped key namespace.
//
// Before Phase 2, every store wrote to a flat key
// (`adc.portfolio.v1`, `ctad.state.v1`, `acw.workspace.v1`, ...)
// with no tenant prefix. After Phase 2, the same documents live
// under `<orgId>:<workItemId>:<baseKey>` (Work-Item-scoped) or
// `<orgId>:<baseKey>` (Org-scoped).
//
// This module runs ONCE, anchored to a DETERMINISTIC target:
// the **first-created Organisation** and that org's auto-seeded
// **EA Blueprint** Work Item. The "first" anchor is computed from
// the registries (`createdAt` ascending), not from the user's
// currently-selected scope — so a user who creates two orgs and
// then opens a Project under the second org still has their
// pre-Phase-2 data migrated into Org #1's EA Blueprint, never
// into Org #2 or into a non-blueprint Work Item. This matches the
// recovery semantics that "your existing pre-Phase-2 work belongs
// to your first org's blueprint scope".
//
// The module COPIES the pre-Phase-2 flat document into that
// deterministic scope and LEAVES the original flat document in
// place for one release as a safety net — if the user ever needs
// to roll back to a pre-Phase-2 build or wants to re-export the
// legacy blob for diagnosis, the flat document is still there. A
// sentinel key (`app:legacyMigration.v1`) records the completion
// so a second page load does NOT re-copy the legacy blob.
//
// The migration is intentionally narrow: it touches only the
// pre-Phase-2 flat keys we shipped, never any other localStorage
// entry. Any flat key not in `LEGACY_FLAT_KEYS` is left untouched.

import { getScopedKey } from "./storageKeyUtils";
import { listOrganisations } from "./orgStore";
import { getEaBlueprintForOrg } from "./workItemStore";

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
  readonly targetOrgId: string | null;
  readonly targetWorkItemId: string | null;
}

const NOOP_RESULT: LegacyMigrationResult = Object.freeze({
  ran: false,
  migratedKeys: [],
  skippedKeys: [],
  targetOrgId: null,
  targetWorkItemId: null,
});

/**
 * Resolve the deterministic migration target: the first-created
 * Organisation in the registry and that organisation's
 * auto-seeded EA Blueprint Work Item. Returns `null` if either is
 * not yet present (no orgs at all, or the blueprint registry row
 * is missing for the first org).
 */
export function resolveLegacyMigrationTarget():
  | { orgId: string; workItemId: string }
  | null {
  const orgs = listOrganisations(); // sorted by createdAt asc
  const first = orgs[0];
  if (!first) return null;
  const blueprint = getEaBlueprintForOrg(first.id);
  if (!blueprint) return null;
  return { orgId: first.id, workItemId: blueprint.id };
}

/**
 * Migrate any pre-Phase-2 flat localStorage entries into the
 * Phase 2 scoped namespace under the deterministic
 * first-created-org + EA-Blueprint anchor (NOT the user's current
 * selection). Idempotent — a sentinel key short-circuits
 * subsequent calls. Returns a no-op result whenever no anchor can
 * yet be resolved.
 */
export function migrateLegacyFlatKeysIfNeeded(): LegacyMigrationResult {
  if (typeof window === "undefined" || !window.localStorage) {
    return NOOP_RESULT;
  }
  const sentinel = window.localStorage.getItem(LEGACY_MIGRATION_SENTINEL_KEY);
  if (sentinel === "done") return NOOP_RESULT;

  const target = resolveLegacyMigrationTarget();
  if (!target) {
    // No first org / blueprint yet — sentinel stays unset so we
    // retry on the next opportunity (e.g. once an org has been
    // created). This is intentional: we only "spend" the one-shot
    // when we actually have a deterministic anchor to spend it on.
    return NOOP_RESULT;
  }
  const { orgId, workItemId } = target;

  // Defensive double-check: the deterministic resolver should
  // always return well-formed ids, but the assertion below is
  // cheap insurance against a future schema drift.
  if (!ORG_ID_RE.test(orgId)) {
    throw new Error(
      `legacyMigration: resolved orgId "${orgId}" is malformed. Expected ${ORG_ID_RE.source}.`,
    );
  }
  if (!WORK_ITEM_ID_RE.test(workItemId)) {
    throw new Error(
      `legacyMigration: resolved workItemId "${workItemId}" is malformed. Expected ${WORK_ITEM_ID_RE.source}.`,
    );
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
  // is a one-shot event keyed on "we resolved a first-org +
  // blueprint anchor for the first time", not on "there was
  // something to migrate".
  window.localStorage.setItem(LEGACY_MIGRATION_SENTINEL_KEY, "done");

  return {
    ran: true,
    migratedKeys: migrated,
    skippedKeys: skipped,
    targetOrgId: orgId,
    targetWorkItemId: workItemId,
  };
}

/** Test hook — clears the sentinel so the next call re-runs. */
export function __resetLegacyMigrationSentinelForTest(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(LEGACY_MIGRATION_SENTINEL_KEY);
}

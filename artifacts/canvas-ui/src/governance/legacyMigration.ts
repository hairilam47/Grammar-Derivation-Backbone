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
import { getEaBlueprintForOrg, listWorkItemsForOrg } from "./workItemStore";
import { apiLegacyUpload, type LegacyUploadPayload } from "./serverApi";

export const LEGACY_MIGRATION_SENTINEL_KEY = "app:legacyMigration.v1";

// Phase 3 — one-shot "upload every locally-resident tenant
// document to the api-server" migration. Spent independently from
// the Phase-2 flat-key copy migration above so a user who already
// completed the Phase-2 migration on a previous build still gets
// their data uploaded to the server on first run of this build.
export const SERVER_UPLOAD_SENTINEL_KEY = "app:serverUpload.v1";

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

// ---- Phase 3: server upload ------------------------------------------------

const ORG_DOC_KEY = "app.organisations.v1";
const WORK_ITEM_DOC_KEY = "app.work-items.v1";
const SCOPED_KEY_RE = /^(org-[a-z0-9]+)(?::(wi-[a-z0-9]+))?:(.+)$/;

interface ServerUploadResult {
  readonly ran: boolean;
  readonly orgs: number;
  readonly workItems: number;
  readonly orgScoped: number;
  readonly workItemScoped: number;
}

const NOOP_UPLOAD: ServerUploadResult = Object.freeze({
  ran: false,
  orgs: 0,
  workItems: 0,
  orgScoped: 0,
  workItemScoped: 0,
});

/**
 * Walk every locally-resident tenant document and POST it to the
 * api-server in one batched request. Idempotent — guarded by a
 * dedicated sentinel (`app:serverUpload.v1`) so subsequent boots
 * are a single localStorage check. The post is best-effort: a
 * failure leaves the sentinel UNSET so the next boot retries.
 *
 * The payload combines two sources:
 *   1. The flat org / work-item registries (`app.organisations.v1`
 *      / `app.work-items.v1`) — these are the authoritative source
 *      for org and work-item rows.
 *   2. Every `<orgId>:*` and `<orgId>:<wiId>:*` scoped key for
 *      orgs and work items present in the registries above.
 *
 * Anything outside of those two sources is left alone — the
 * upload is intentionally narrow and never enumerates random
 * localStorage entries.
 */
export async function uploadLegacyTenantsToServerIfNeeded(): Promise<ServerUploadResult> {
  if (typeof window === "undefined" || !window.localStorage) {
    return NOOP_UPLOAD;
  }
  const sentinel = window.localStorage.getItem(SERVER_UPLOAD_SENTINEL_KEY);
  if (sentinel === "done") return NOOP_UPLOAD;

  const orgs = listOrganisations();
  const workItems: NonNullable<ReturnType<typeof listWorkItemsForOrg>>[number][] = [];
  for (const o of orgs) {
    for (const wi of listWorkItemsForOrg(o.id)) workItems.push(wi);
  }

  // Collect known org and work-item ids so we can classify scoped
  // keys without re-running the SCOPED_KEY_RE against every key.
  const orgIds = new Set(orgs.map((o) => o.id));
  const wiByOrg = new Set(workItems.map((wi) => `${wi.orgId}:${wi.id}`));

  const orgScoped: Array<{
    orgId: string;
    baseKey: string;
    value: string;
  }> = [];
  const workItemScoped: Array<{
    orgId: string;
    workItemId: string;
    baseKey: string;
    value: string;
  }> = [];

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (k === ORG_DOC_KEY || k === WORK_ITEM_DOC_KEY) continue;
    const m = SCOPED_KEY_RE.exec(k);
    if (!m) continue;
    const [, orgId, wiId, baseKey] = m;
    if (!orgIds.has(orgId)) continue;
    const v = window.localStorage.getItem(k);
    if (v === null) continue;
    if (wiId) {
      if (!wiByOrg.has(`${orgId}:${wiId}`)) continue;
      workItemScoped.push({ orgId, workItemId: wiId, baseKey, value: v });
    } else {
      orgScoped.push({ orgId, baseKey, value: v });
    }
  }

  const payload: LegacyUploadPayload = {
    orgs: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      sector: o.sector,
      natureOfBusiness: o.natureOfBusiness,
      logo: o.logo,
      createdAt: o.createdAt,
    })),
    workItems: workItems.map((wi) => ({
      id: wi.id,
      orgId: wi.orgId,
      type: wi.type,
      title: wi.title,
      description: wi.description,
      createdAt: wi.createdAt,
      archived: wi.archived,
    })),
    orgScoped,
    workItemScoped,
  };

  try {
    const accepted = await apiLegacyUpload(payload);
    window.localStorage.setItem(SERVER_UPLOAD_SENTINEL_KEY, "done");
    return {
      ran: true,
      orgs: accepted.orgs,
      workItems: accepted.workItems,
      orgScoped: accepted.orgScoped,
      workItemScoped: accepted.workItemScoped,
    };
  } catch (err) {
    // Leave sentinel unset so a later boot retries. Surface the
    // failure in the console for diagnosis.
    // eslint-disable-next-line no-console
    console.warn("[legacyMigration] server upload failed:", err);
    return NOOP_UPLOAD;
  }
}

/** Test hook — clears the server-upload sentinel so the next call re-runs. */
export function __resetServerUploadSentinelForTest(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SERVER_UPLOAD_SENTINEL_KEY);
}

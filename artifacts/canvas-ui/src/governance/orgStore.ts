// Organisation registry.
//
// Phase 2 (SaaS Onboarding) introduces multi-tenant scoping above
// every persisted ADC/CTAD/ACW store. Every architect operates
// inside exactly one Organisation at a time; every persisted
// document is keyed under that organisation's id (combined with a
// Work Item id for tool-level stores).
//
// Architectural constraints:
//   - Top-level allow-list. Persisted document carries exactly
//     `{ schemaVersion, organisations }`. Unknown keys at any
//     level are refused on read.
//   - Schema-version locked at `org-1.0`.
//   - `id` matches `^org-[a-z0-9]+$` (12 hex chars by default).
//   - `slug` matches `^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$` —
//     URL-safe, lowercase, optional internal hyphens, 1-40 chars.
//   - `sector ∈ { "government", "private-sector" }`.
//   - `natureOfBusiness ∈ NATURE_OF_BUSINESS_OPTIONS` (curated list
//     below). The list passes the new `ONBOARDING_FORBIDDEN`
//     vocabulary tier (Phase 2 step 6).
//   - Creating an Organisation immediately seeds an `ea-blueprint`
//     Work Item for that organisation via the Work-Item registry.
//     The two writes are not atomic across processes (browser
//     localStorage has no transaction primitive) but they are
//     sequential within one tick: if the Work-Item write throws,
//     the Organisation write is rolled back so the org+blueprint
//     pairing invariant holds at rest.

import { createWorkItem, removeAllWorkItemsForOrg } from "./workItemStore";
import {
  apiDeleteOrg,
  apiListOrgs,
  apiPutOrg,
} from "./serverApi";
import { clearScope } from "./scopedStorageClient";

const STORAGE_KEY = "app.organisations.v1";
export const ORG_SCHEMA_VERSION = "org-1.0" as const;

const ORG_ID_RE = /^org-[a-z0-9]+$/;
const ORG_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export const ORG_SECTORS = ["government", "private-sector"] as const;
export type OrgSector = (typeof ORG_SECTORS)[number];

export const SECTOR_LABELS: Readonly<Record<OrgSector, string>> = Object.freeze({
  government: "Government",
  "private-sector": "Private Sector",
});

// Curated nature-of-business taxonomy. Every label below passes
// the Phase 2 `ONBOARDING_FORBIDDEN` vocabulary tier — none uses
// prescriptive / judgemental wording.
export const NATURE_OF_BUSINESS_OPTIONS = [
  "financial-services",
  "healthcare",
  "government-administration",
  "telecommunications",
  "manufacturing",
  "retail",
  "other",
] as const;
export type NatureOfBusiness = (typeof NATURE_OF_BUSINESS_OPTIONS)[number];

export const NATURE_OF_BUSINESS_LABELS: Readonly<Record<NatureOfBusiness, string>> =
  Object.freeze({
    "financial-services": "Financial Services",
    healthcare: "Healthcare",
    "government-administration": "Government Administration",
    telecommunications: "Telecommunications",
    manufacturing: "Manufacturing",
    retail: "Retail",
    other: "Other",
  });

const SECTOR_SET: ReadonlySet<string> = new Set(ORG_SECTORS);
const NATURE_SET: ReadonlySet<string> = new Set(NATURE_OF_BUSINESS_OPTIONS);

export interface Organisation {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sector: OrgSector;
  readonly natureOfBusiness: NatureOfBusiness;
  readonly logo: string;
  readonly createdAt: string;
}

interface OrgDoc {
  readonly schemaVersion: typeof ORG_SCHEMA_VERSION;
  readonly organisations: Readonly<Record<string, Organisation>>;
}

const EMPTY_DOC: OrgDoc = Object.freeze({
  schemaVersion: ORG_SCHEMA_VERSION,
  organisations: Object.freeze({}),
});

const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "organisations"]);
const ALLOWED_ORG_KEYS = new Set([
  "id",
  "name",
  "slug",
  "sector",
  "natureOfBusiness",
  "logo",
  "createdAt",
]);

function isValidOrgId(id: unknown): id is string {
  return typeof id === "string" && ORG_ID_RE.test(id);
}

function isValidOrgSlug(slug: unknown): slug is string {
  return typeof slug === "string" && ORG_SLUG_RE.test(slug);
}

function isValidOrganisation(value: unknown): value is Organisation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_ORG_KEYS.has(k)) return false;
  }
  if (!isValidOrgId(v.id)) return false;
  if (typeof v.name !== "string" || v.name.length === 0) return false;
  if (!isValidOrgSlug(v.slug)) return false;
  if (typeof v.sector !== "string" || !SECTOR_SET.has(v.sector)) return false;
  if (
    typeof v.natureOfBusiness !== "string" ||
    !NATURE_SET.has(v.natureOfBusiness)
  ) {
    return false;
  }
  if (typeof v.logo !== "string") return false;
  if (typeof v.createdAt !== "string" || v.createdAt.length === 0) return false;
  return true;
}

function readDoc(): OrgDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<OrgDoc> & Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== ORG_SCHEMA_VERSION ||
      typeof parsed.organisations !== "object" ||
      parsed.organisations === null
    ) {
      return EMPTY_DOC;
    }
    for (const k of Object.keys(parsed)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) return EMPTY_DOC;
    }
    const cleaned: Record<string, Organisation> = {};
    for (const [key, val] of Object.entries(parsed.organisations)) {
      if (key !== (val as Organisation | undefined)?.id) continue;
      if (!isValidOrganisation(val)) continue;
      cleaned[key] = val;
    }
    return {
      schemaVersion: ORG_SCHEMA_VERSION,
      organisations: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: OrgDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  bumpVersion();
}

function mirrorOrgToServer(org: Organisation): void {
  void apiPutOrg(org).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[orgStore] failed to PUT org ${org.id}:`, err);
  });
}

function mirrorOrgDeleteToServer(orgId: string): void {
  void apiDeleteOrg(orgId).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(`[orgStore] failed to DELETE org ${orgId}:`, err);
  });
}

/**
 * One-shot boot hydration: pull every organisation row off the
 * server and merge it into local state. Server rows take
 * precedence over a co-located localStorage row (a fresh device
 * sees the durable copy), but pre-existing local-only rows that
 * the server has not seen yet are preserved so the legacy
 * upload migration still has a chance to push them up.
 */
export async function hydrateOrgsFromServer(): Promise<void> {
  let rows: ReadonlyArray<{
    id: string;
    name: string;
    slug: string;
    sector: string;
    natureOfBusiness: string;
    logo: string;
    createdAt: string;
  }>;
  try {
    rows = await apiListOrgs();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[orgStore] hydrate failed:", err);
    return;
  }
  const local = readDoc();
  const merged: Record<string, Organisation> = { ...local.organisations };
  for (const r of rows) {
    if (!isValidOrganisation(r)) continue;
    merged[r.id] = Object.freeze({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sector: r.sector as OrgSector,
      natureOfBusiness: r.natureOfBusiness as NatureOfBusiness,
      logo: r.logo,
      createdAt: r.createdAt,
    });
  }
  writeDoc({ schemaVersion: ORG_SCHEMA_VERSION, organisations: merged });
}

let storeVersion = 0;
const listeners = new Set<() => void>();
function bumpVersion(): void {
  storeVersion += 1;
  for (const l of listeners) l();
}
export function getStoreVersion(): number {
  return storeVersion;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function generateOrgId(): string {
  const bytes = new Uint8Array(6);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `org-${hex}`;
}

function deriveSlug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return base.length > 0 ? base : "org";
}

// Resolve a unique, well-formed slug for the org dictionary,
// honouring the 40-char cap AND the slug regex's "must end with
// [a-z0-9]" rule even when a numeric suffix has to be appended.
// We shorten the base portion (rather than blindly truncating the
// composed candidate) so the suffix is preserved and the end of
// the slug is always alphanumeric, then re-check uniqueness in a
// loop. Throws on the (impossible-in-practice) exhaustion case.
function uniqueSlug(name: string, doc: OrgDoc): string {
  const MAX = 40;
  const base = deriveSlug(name);
  const taken = new Set(Object.values(doc.organisations).map((o) => o.slug));
  if (!taken.has(base) && isValidOrgSlug(base)) return base;
  for (let n = 2; n < 1_000_000; n += 1) {
    const suffix = `-${n}`;
    const allowedBaseLen = MAX - suffix.length;
    let trimmedBase = base.slice(0, Math.max(allowedBaseLen, 1));
    // After the slice, the trimmed base must still end with an
    // alphanumeric (slug regex requirement). Strip trailing dashes
    // before re-composing.
    trimmedBase = trimmedBase.replace(/-+$/g, "");
    if (trimmedBase.length === 0) trimmedBase = "org";
    const candidate = `${trimmedBase}${suffix}`;
    if (taken.has(candidate)) continue;
    if (!isValidOrgSlug(candidate)) continue;
    return candidate;
  }
  throw new Error(
    `orgStore: could not derive a unique slug from name "${name}".`,
  );
}

export interface CreateOrganisationInput {
  readonly id?: string;
  readonly slug?: string;
  readonly name: string;
  readonly sector: OrgSector;
  readonly natureOfBusiness: NatureOfBusiness;
  readonly logo?: string;
}

export interface CreateOrganisationResult {
  readonly organisation: Organisation;
  readonly eaBlueprintWorkItemId: string;
}

export function createOrganisation(
  input: CreateOrganisationInput,
): CreateOrganisationResult {
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    throw new Error("orgStore: organisation name must be a non-empty string.");
  }
  if (typeof input.sector !== "string" || !SECTOR_SET.has(input.sector)) {
    throw new Error(
      `orgStore: invalid sector "${String(input.sector)}". Allowed: ${ORG_SECTORS.join(", ")}.`,
    );
  }
  if (
    typeof input.natureOfBusiness !== "string" ||
    !NATURE_SET.has(input.natureOfBusiness)
  ) {
    throw new Error(
      `orgStore: invalid natureOfBusiness "${String(input.natureOfBusiness)}".`,
    );
  }
  const id = input.id ?? generateOrgId();
  if (!isValidOrgId(id)) {
    throw new Error(
      `orgStore: invalid org id "${id}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  const doc = readDoc();
  if (id in doc.organisations) {
    throw new Error(`orgStore: an organisation with id "${id}" already exists.`);
  }
  const slug = input.slug ?? uniqueSlug(input.name, doc);
  if (!isValidOrgSlug(slug)) {
    throw new Error(
      `orgStore: invalid slug "${slug}". Expected pattern ${ORG_SLUG_RE.source}.`,
    );
  }
  if (Object.values(doc.organisations).some((o) => o.slug === slug)) {
    throw new Error(`orgStore: an organisation with slug "${slug}" already exists.`);
  }

  const next: Organisation = Object.freeze({
    id,
    name: input.name.trim(),
    slug,
    sector: input.sector,
    natureOfBusiness: input.natureOfBusiness,
    logo: input.logo ?? "",
    createdAt: new Date().toISOString(),
  });

  // Stage 1: write the organisation.
  writeDoc({
    schemaVersion: ORG_SCHEMA_VERSION,
    organisations: { ...doc.organisations, [id]: next },
  });
  mirrorOrgToServer(next);

  // Stage 2: seed the EA Blueprint Work Item. If this throws we
  // roll the org write back to preserve the
  // every-org-has-an-EA-blueprint invariant at rest.
  let blueprintId: string;
  try {
    const blueprint = createWorkItem({
      orgId: id,
      type: "ea-blueprint",
      title: `${next.name} — EA Blueprint`,
      description: "Enterprise Architecture Blueprint Work Item.",
    });
    blueprintId = blueprint.id;
  } catch (e) {
    // Roll back the org write.
    writeDoc({
      schemaVersion: ORG_SCHEMA_VERSION,
      organisations: doc.organisations,
    });
    mirrorOrgDeleteToServer(id);
    throw e;
  }

  return { organisation: next, eaBlueprintWorkItemId: blueprintId };
}

export function getOrganisation(id: string): Organisation | null {
  if (!isValidOrgId(id)) return null;
  const doc = readDoc();
  return doc.organisations[id] ?? null;
}

export function listOrganisations(): readonly Organisation[] {
  const doc = readDoc();
  return Object.values(doc.organisations).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}

// Removes both the org and every Work Item belonging to that org
// so a removed org leaves no orphan Work Items. Idempotent: a
// second call with the same id (or with a malformed / unknown id)
// is a no-op.
//
// NOTE: this is the legacy entry point that only touches the
// registries. UI-facing deletion goes through `deleteOrganisation`,
// which additionally enumerates and clears every scoped
// `<orgId>:*` localStorage key for the org being removed.
export function removeOrganisation(id: string): void {
  if (!isValidOrgId(id)) return;
  const doc = readDoc();
  if (!(id in doc.organisations)) return;
  const next: Record<string, Organisation> = { ...doc.organisations };
  delete next[id];
  writeDoc({
    schemaVersion: ORG_SCHEMA_VERSION,
    organisations: next,
  });
  mirrorOrgDeleteToServer(id);
  removeAllWorkItemsForOrg(id);
}

// Update an Organisation's editable fields. Only `name`, `sector`,
// and `natureOfBusiness` may change — `id`, `slug`, `createdAt`,
// and `logo` are immutable through this mutator (slug is preserved
// across renames per the existing `renameOrganisation` contract).
// Idempotent: a patch that produces no change to any field is a
// no-op (no write, no version bump, no server mirror). Throws on
// a malformed id, an unknown id, an empty trimmed name, or an
// invalid sector / natureOfBusiness enum value.
export interface UpdateOrganisationInput {
  readonly name?: string;
  readonly sector?: OrgSector;
  readonly natureOfBusiness?: NatureOfBusiness;
}

export function updateOrganisation(
  id: string,
  fields: UpdateOrganisationInput,
): Organisation {
  if (!isValidOrgId(id)) {
    throw new Error(
      `orgStore: invalid org id "${id}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  const doc = readDoc();
  const existing = doc.organisations[id];
  if (!existing) {
    throw new Error(`orgStore: no organisation with id "${id}".`);
  }

  let nextName = existing.name;
  if (fields.name !== undefined) {
    if (typeof fields.name !== "string" || fields.name.trim().length === 0) {
      throw new Error(
        "orgStore: organisation name must be a non-empty string.",
      );
    }
    nextName = fields.name.trim();
  }

  let nextSector = existing.sector;
  if (fields.sector !== undefined) {
    if (typeof fields.sector !== "string" || !SECTOR_SET.has(fields.sector)) {
      throw new Error(
        `orgStore: invalid sector "${String(fields.sector)}". Allowed: ${ORG_SECTORS.join(", ")}.`,
      );
    }
    nextSector = fields.sector;
  }

  let nextNature = existing.natureOfBusiness;
  if (fields.natureOfBusiness !== undefined) {
    if (
      typeof fields.natureOfBusiness !== "string" ||
      !NATURE_SET.has(fields.natureOfBusiness)
    ) {
      throw new Error(
        `orgStore: invalid natureOfBusiness "${String(fields.natureOfBusiness)}".`,
      );
    }
    nextNature = fields.natureOfBusiness;
  }

  if (
    nextName === existing.name &&
    nextSector === existing.sector &&
    nextNature === existing.natureOfBusiness
  ) {
    return existing;
  }

  const next: Organisation = Object.freeze({
    ...existing,
    name: nextName,
    sector: nextSector,
    natureOfBusiness: nextNature,
  });
  writeDoc({
    schemaVersion: ORG_SCHEMA_VERSION,
    organisations: { ...doc.organisations, [id]: next },
  });
  mirrorOrgToServer(next);
  return next;
}

// Rename an Organisation. Updates `name` only; the `slug` is
// deliberately preserved across renames so any external reference
// or future URL keyed on the slug stays stable. Idempotent: a
// rename to the same trimmed name is a no-op (no write, no version
// bump). Throws on a malformed id, an unknown id, or an empty /
// whitespace-only name.
export function renameOrganisation(id: string, newName: string): Organisation {
  if (!isValidOrgId(id)) {
    throw new Error(
      `orgStore: invalid org id "${id}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  if (typeof newName !== "string" || newName.trim().length === 0) {
    throw new Error("orgStore: organisation name must be a non-empty string.");
  }
  const trimmed = newName.trim();
  const doc = readDoc();
  const existing = doc.organisations[id];
  if (!existing) {
    throw new Error(`orgStore: no organisation with id "${id}".`);
  }
  if (existing.name === trimmed) return existing;
  const next: Organisation = Object.freeze({
    ...existing,
    name: trimmed,
  });
  writeDoc({
    schemaVersion: ORG_SCHEMA_VERSION,
    organisations: { ...doc.organisations, [id]: next },
  });
  mirrorOrgToServer(next);
  return next;
}

const SCOPE_LS_ORG_KEY = "app:currentOrgId";
const SCOPE_LS_WORK_ITEM_KEY = "app:currentWorkItemId";

/**
 * Delete an Organisation and every byte of tenant-scoped
 * localStorage that belongs to it.
 *
 * Removes:
 *   1. The org row itself (via `removeOrganisation`).
 *   2. Every Work Item under that org (transitive via
 *      `removeOrganisation`).
 *   3. Every localStorage key prefixed with `<orgId>:` — covers
 *      both `<orgId>:<baseKey>` (org-scoped stores) and
 *      `<orgId>:<workItemId>:<baseKey>` (work-item-scoped stores).
 *   4. The persisted active scope (`app:currentOrgId` /
 *      `app:currentWorkItemId`) WHEN it points at the org being
 *      deleted — leaves an unrelated active selection untouched.
 *
 * Idempotent: a second call with the same id is a no-op. A
 * malformed id is rejected up-front (no localStorage scan
 * performed). Returns the number of `<orgId>:*` keys removed so
 * callers / probes can observe the cleanup.
 */
export function deleteOrganisation(id: string): number {
  if (!isValidOrgId(id)) {
    throw new Error(
      `orgStore: invalid org id "${id}". Expected pattern ${ORG_ID_RE.source}.`,
    );
  }
  removeOrganisation(id);
  if (typeof window === "undefined" || !window.localStorage) return 0;
  const prefix = `${id}:`;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (k !== null && k.startsWith(prefix)) toRemove.push(k);
  }
  for (const k of toRemove) window.localStorage.removeItem(k);
  // Clear the persisted active-scope pointer when it targets the
  // org we just deleted. The provider's reconciliation pass would
  // catch this on the next mount, but clearing eagerly avoids a
  // moment where the topbar / gates render against a tombstoned id.
  if (window.localStorage.getItem(SCOPE_LS_ORG_KEY) === id) {
    window.localStorage.removeItem(SCOPE_LS_ORG_KEY);
    window.localStorage.removeItem(SCOPE_LS_WORK_ITEM_KEY);
  }
  // Drop any cached scoped docs the in-memory L1 may still be
  // holding for this org so subsequent reads return null instead
  // of a tombstoned cache hit. The api-side cascade was already
  // requested by `removeOrganisation`.
  clearScope(id);
  return toRemove.length;
}

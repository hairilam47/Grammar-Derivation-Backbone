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

// Included for completeness per the task brief — no UI surface
// invokes it. Removes both the org and every Work Item belonging
// to that org so a removed org leaves no orphan Work Items.
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
  removeAllWorkItemsForOrg(id);
}

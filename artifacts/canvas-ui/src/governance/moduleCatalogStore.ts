// Module Catalogue store — `adc.module-catalog.v1`.
//
// Stage A (ADC Wizard Retrofit). Owns a single localStorage document
// holding the user's Modules — each Module carries a stable id, a
// human-readable name, an optional description, and a set of
// `relatedCapabilityIds` that anchor the Module to the canonical
// architecture-grammar capability registry.
//
// Architectural constraints:
//   - Top-level allow-list. Persisted document carries exactly
//     `{ schemaVersion, modules }`. Unknown keys at any level are
//     refused on read (returned as the empty document) so a
//     malformed payload can never feed a downstream derivation.
//   - Schema-version locked at `mod-1.0`. Bumping requires a
//     deterministic read-time migration (see invariant).
//   - All capability ids referenced by a Module must resolve through
//     `getCapabilityById` from `@workspace/architecture-grammar`.
//     Unknown / malformed capability ids throw — no silent coercion.
//   - `id` must match `^module:[a-z0-9-]+$`. The store generates
//     module ids on `createModule`; callers can also supply an id
//     (used by the invariant probe), but the format check is the
//     same on both paths.

import { getCapabilityById } from "@workspace/architecture-grammar";
import { resolveActiveKey, currentScope } from "./storageKeyUtils";

// Phase 2 (SaaS Onboarding) — Org-only scope. The Module Catalogue
// is shared across every Work Item inside a single Organisation
// (an Enhancement, a Change Request and an EA Blueprint all author
// against the same module taxonomy), so the resolver does not bind
// to a Work Item id.
export const BASE_STORAGE_KEY = "adc.module-catalog.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, false);
}
export const MODULE_CATALOG_SCHEMA_VERSION = "mod-1.0" as const;

const MODULE_ID_RE = /^module:[a-z0-9-]+$/;

export interface Module {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly relatedCapabilityIds: readonly string[];
}

interface ModuleCatalogDoc {
  readonly schemaVersion: typeof MODULE_CATALOG_SCHEMA_VERSION;
  readonly modules: Readonly<Record<string, Module>>;
}

const EMPTY_DOC: ModuleCatalogDoc = Object.freeze({
  schemaVersion: MODULE_CATALOG_SCHEMA_VERSION,
  modules: Object.freeze({}),
});

const ALLOWED_TOP_LEVEL_KEYS = new Set(["schemaVersion", "modules"]);
const ALLOWED_MODULE_KEYS = new Set([
  "id",
  "name",
  "description",
  "relatedCapabilityIds",
]);

function isValidModuleId(id: unknown): id is string {
  return typeof id === "string" && MODULE_ID_RE.test(id);
}

function isValidModule(value: unknown): value is Module {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_MODULE_KEYS.has(k)) return false;
  }
  if (!isValidModuleId(v.id)) return false;
  if (typeof v.name !== "string" || v.name.length === 0) return false;
  if (typeof v.description !== "string") return false;
  if (
    !Array.isArray(v.relatedCapabilityIds) ||
    !v.relatedCapabilityIds.every((c) => typeof c === "string")
  ) {
    return false;
  }
  return true;
}

function readDoc(): ModuleCatalogDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  const key = getStorageKey();
  if (key === null) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<ModuleCatalogDoc> & Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== MODULE_CATALOG_SCHEMA_VERSION ||
      typeof parsed.modules !== "object" ||
      parsed.modules === null
    ) {
      return EMPTY_DOC;
    }
    for (const k of Object.keys(parsed)) {
      if (!ALLOWED_TOP_LEVEL_KEYS.has(k)) return EMPTY_DOC;
    }
    const cleaned: Record<string, Module> = {};
    for (const [key, val] of Object.entries(parsed.modules)) {
      if (key !== (val as Module | undefined)?.id) continue;
      if (!isValidModule(val)) continue;
      cleaned[key] = val;
    }
    return {
      schemaVersion: MODULE_CATALOG_SCHEMA_VERSION,
      modules: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: ModuleCatalogDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getStorageKey();
  if (key === null) return;
  window.localStorage.setItem(key, JSON.stringify(doc));
  bumpVersion();
}

// Phase 2 (SaaS Onboarding) — re-render every subscribed view when
// the active scope changes (Org switch, Org-then-WorkItem switch),
// so the Modules screen re-reads the document for the newly active
// Organisation.
if (typeof window !== "undefined") {
  currentScope.subscribe(() => {
    bumpVersion();
  });
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

function generateModuleId(): string {
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
  return `module:${hex}`;
}

function assertCapabilityIds(ids: readonly string[]): void {
  for (const cid of ids) {
    if (typeof cid !== "string" || cid.length === 0) {
      throw new Error(
        `moduleCatalogStore: capability id must be a non-empty string (got "${String(cid)}").`,
      );
    }
    if (!getCapabilityById(cid)) {
      throw new Error(
        `moduleCatalogStore: unknown capability id "${cid}" — does not resolve through the architecture-grammar capability registry.`,
      );
    }
  }
}

export interface CreateModuleInput {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly relatedCapabilityIds?: readonly string[];
}

export function createModule(input: CreateModuleInput): Module {
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    throw new Error("moduleCatalogStore: module name must be a non-empty string.");
  }
  const id = input.id ?? generateModuleId();
  if (!isValidModuleId(id)) {
    throw new Error(
      `moduleCatalogStore: invalid module id "${id}". Expected pattern ${MODULE_ID_RE.source}.`,
    );
  }
  const description = input.description ?? "";
  const relatedCapabilityIds = (input.relatedCapabilityIds ?? []).slice();
  assertCapabilityIds(relatedCapabilityIds);

  const doc = readDoc();
  if (id in doc.modules) {
    throw new Error(`moduleCatalogStore: a module with id "${id}" already exists.`);
  }
  const next: Module = Object.freeze({
    id,
    name: input.name.trim(),
    description,
    relatedCapabilityIds: Object.freeze(relatedCapabilityIds.slice()),
  });
  writeDoc({
    schemaVersion: MODULE_CATALOG_SCHEMA_VERSION,
    modules: { ...doc.modules, [id]: next },
  });
  return next;
}

export interface UpdateModuleInput {
  readonly name?: string;
  readonly description?: string;
  readonly relatedCapabilityIds?: readonly string[];
}

export function updateModule(id: string, patch: UpdateModuleInput): Module {
  if (!isValidModuleId(id)) {
    throw new Error(`moduleCatalogStore: invalid module id "${id}".`);
  }
  const doc = readDoc();
  const existing = doc.modules[id];
  if (!existing) {
    throw new Error(`moduleCatalogStore: no module found with id "${id}".`);
  }
  const nextName = patch.name !== undefined ? patch.name.trim() : existing.name;
  if (typeof nextName !== "string" || nextName.length === 0) {
    throw new Error("moduleCatalogStore: module name must be a non-empty string.");
  }
  const nextDescription =
    patch.description !== undefined ? patch.description : existing.description;
  const nextRelated =
    patch.relatedCapabilityIds !== undefined
      ? patch.relatedCapabilityIds.slice()
      : existing.relatedCapabilityIds.slice();
  assertCapabilityIds(nextRelated);
  const next: Module = Object.freeze({
    id,
    name: nextName,
    description: nextDescription,
    relatedCapabilityIds: Object.freeze(nextRelated.slice()),
  });
  writeDoc({
    schemaVersion: MODULE_CATALOG_SCHEMA_VERSION,
    modules: { ...doc.modules, [id]: next },
  });
  return next;
}

export function removeModule(id: string): void {
  if (!isValidModuleId(id)) return;
  const doc = readDoc();
  if (!(id in doc.modules)) return;
  const nextModules: Record<string, Module> = { ...doc.modules };
  delete nextModules[id];
  writeDoc({
    schemaVersion: MODULE_CATALOG_SCHEMA_VERSION,
    modules: nextModules,
  });
}

export function listModules(): readonly Module[] {
  const doc = readDoc();
  return Object.values(doc.modules).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
}

export function getModule(id: string): Module | null {
  if (!isValidModuleId(id)) return null;
  const doc = readDoc();
  return doc.modules[id] ?? null;
}

export function getModulesForCapability(capabilityId: string): readonly Module[] {
  if (typeof capabilityId !== "string" || capabilityId.length === 0) return [];
  const doc = readDoc();
  return Object.values(doc.modules)
    .filter((m) => m.relatedCapabilityIds.includes(capabilityId))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

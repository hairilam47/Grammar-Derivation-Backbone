// CTAD — bounded exploration state store.
//
// Persists categorical technology selections in localStorage under
// `ctad.state.v1`. Selections are reversible at any time; missing
// values mean "not specified" (null in the serialised CTAD_STATE),
// never a default.
//
// The store maintains TWO peer top-level maps:
//   - `bindings`     keyed by `${adsId}@${adsVersion}`, each
//                    representing an exploration anchored to a
//                    frozen ADC decision (legacy default mode);
//   - `architectures` keyed by `architectureId`, each representing
//                    a standalone exploration that exists
//                    independently of any frozen decision (Phase 1
//                    decoupling). Architecture entries deliberately
//                    carry NO `adsId` / `adsVersion` — they are
//                    pure CTAD workspaces.
//
// The store does NOT mutate or read ADC artefacts in either mode.
// Binding keys are opaque from CTAD's point of view; the entry page
// resolves them against the read-only portfolio listing for
// rendering only.

import {
  CTAD_PRIOR_SCHEMA_VERSIONS,
  CTAD_SCHEMA_VERSION,
  CTAD_SECTIONS,
  findParam,
  isValidEnvironmentHostingModel,
  isValidEnvironmentId,
  isValidEnvironmentKind,
  type CtadEnvironmentDef,
  type CtadSectionId,
} from "./ctadRegistry";
import {
  generateArchitectureId,
  isValidArchitectureId,
} from "./architectureIdentity";
import {
  resolveActiveKey,
  currentScope,
} from "@/governance/storageKeyUtils";

// Phase 2 (SaaS Onboarding) — Org+WorkItem scope. The CTAD state
// document is the per-Work-Item exploration workspace; switching
// Work Items must surface a different CTAD state. The base key is
// preserved for the legacy migration utility.
export const BASE_STORAGE_KEY = "ctad.state.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}

export type CtadParamValue = string | readonly string[] | null;

export interface CtadBinding {
  readonly adsId: string;
  readonly adsVersion: string;
}

export interface CtadBindingDoc {
  readonly adsId: string;
  readonly adsVersion: string;
  readonly params: Readonly<Record<string, CtadParamValue>>;
  readonly environments: readonly CtadEnvironmentDef[];
  readonly updatedAt: string;
}

// Architecture workspace document — the standalone-mode peer of
// `CtadBindingDoc`. Carries the same params + environments shape
// (so panels can read both modes through a unified surface) plus
// architecture-specific identity fields. Crucially: NO `adsId` and
// NO `adsVersion`. The grammar invariant pins this absence at
// build time.
export interface CtadArchitectureDoc {
  readonly architectureId: string;
  readonly architectureName: string;
  readonly params: Readonly<Record<string, CtadParamValue>>;
  readonly environments: readonly CtadEnvironmentDef[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CtadStoreDoc {
  readonly schemaVersion: typeof CTAD_SCHEMA_VERSION;
  readonly bindings: Readonly<Record<string, CtadBindingDoc>>;
  readonly architectures: Readonly<Record<string, CtadArchitectureDoc>>;
}

const EMPTY_DOC: CtadStoreDoc = Object.freeze({
  schemaVersion: CTAD_SCHEMA_VERSION,
  bindings: Object.freeze({}),
  architectures: Object.freeze({}),
});

// Deterministic prior-schema migrations. The migrations are pure
// read-time projections; they never mutate the persisted blob.
// The next write rewrites the doc with the bumped schemaVersion.
//
//   v1.0 → v1.1  : add `environments: []` per binding.
//   v1.1 → v1.2  : add a top-level `architectures: {}` map; each
//                  binding's shape is unchanged.
function isPriorSchemaVersion(v: unknown): v is (typeof CTAD_PRIOR_SCHEMA_VERSIONS)[number] {
  return (
    typeof v === "string" &&
    (CTAD_PRIOR_SCHEMA_VERSIONS as readonly string[]).includes(v)
  );
}

function migrateBindingDoc(raw: unknown): CtadBindingDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.adsId !== "string" || typeof r.adsVersion !== "string") return null;
  const params =
    r.params && typeof r.params === "object"
      ? (r.params as Record<string, CtadParamValue>)
      : {};
  const updatedAt = typeof r.updatedAt === "string" ? r.updatedAt : "";
  const rawEnvs = Array.isArray(r.environments) ? r.environments : [];
  const environments: CtadEnvironmentDef[] = [];
  for (const e of rawEnvs) {
    if (!e || typeof e !== "object") continue;
    const er = e as Record<string, unknown>;
    if (typeof er.id !== "string" || typeof er.name !== "string") continue;
    if (typeof er.kind !== "string") continue;
    const hosting =
      er.hostingModel === null || typeof er.hostingModel === "string"
        ? (er.hostingModel as string | null)
        : null;
    environments.push(
      Object.freeze({
        id: er.id,
        name: er.name,
        kind: er.kind,
        hostingModel: hosting,
      }),
    );
  }
  return Object.freeze({
    adsId: r.adsId,
    adsVersion: r.adsVersion,
    params,
    environments: Object.freeze(environments),
    updatedAt,
  });
}

function bindingKey(b: CtadBinding): string {
  return `${b.adsId}@${b.adsVersion}`;
}

function migrateArchitectureDoc(raw: unknown): CtadArchitectureDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.architectureId !== "string" || !isValidArchitectureId(r.architectureId)) {
    return null;
  }
  if (typeof r.architectureName !== "string") return null;
  // Architecture entries must NOT carry `adsId` / `adsVersion` —
  // strip them defensively if a future write ever leaks them.
  const params =
    r.params && typeof r.params === "object"
      ? (r.params as Record<string, CtadParamValue>)
      : {};
  const createdAt = typeof r.createdAt === "string" ? r.createdAt : "";
  const updatedAt = typeof r.updatedAt === "string" ? r.updatedAt : createdAt;
  const rawEnvs = Array.isArray(r.environments) ? r.environments : [];
  const environments: CtadEnvironmentDef[] = [];
  for (const e of rawEnvs) {
    if (!e || typeof e !== "object") continue;
    const er = e as Record<string, unknown>;
    if (typeof er.id !== "string" || typeof er.name !== "string") continue;
    if (typeof er.kind !== "string") continue;
    const hosting =
      er.hostingModel === null || typeof er.hostingModel === "string"
        ? (er.hostingModel as string | null)
        : null;
    environments.push(
      Object.freeze({
        id: er.id,
        name: er.name,
        kind: er.kind,
        hostingModel: hosting,
      }),
    );
  }
  return Object.freeze({
    architectureId: r.architectureId,
    architectureName: r.architectureName,
    params,
    environments: Object.freeze(environments),
    createdAt,
    updatedAt,
  });
}

function readDoc(): CtadStoreDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  const key = getStorageKey();
  if (key === null) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<CtadStoreDoc>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.bindings !== "object" ||
      parsed.bindings === null
    ) {
      return EMPTY_DOC;
    }
    if (
      parsed.schemaVersion !== CTAD_SCHEMA_VERSION &&
      !isPriorSchemaVersion(parsed.schemaVersion)
    ) {
      return EMPTY_DOC;
    }
    const bindings: Record<string, CtadBindingDoc> = {};
    for (const [k, v] of Object.entries(
      parsed.bindings as Record<string, unknown>,
    )) {
      const migrated = migrateBindingDoc(v);
      if (migrated !== null) bindings[k] = migrated;
    }
    // v1.1 → v1.2 migration: `architectures` is absent on v1.1
    // documents; materialise an empty map. On v1.2 documents we
    // deserialise the stored architecture entries through the
    // dedicated migrator (which strips any leaked adsId fields).
    const architectures: Record<string, CtadArchitectureDoc> = {};
    if (
      parsed.architectures &&
      typeof parsed.architectures === "object" &&
      parsed.architectures !== null
    ) {
      for (const [k, v] of Object.entries(
        parsed.architectures as Record<string, unknown>,
      )) {
        const migrated = migrateArchitectureDoc(v);
        if (migrated !== null && migrated.architectureId === k) {
          architectures[k] = migrated;
        }
      }
    }
    return {
      schemaVersion: CTAD_SCHEMA_VERSION,
      bindings,
      architectures,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: CtadStoreDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getStorageKey();
  if (key === null) return;
  window.localStorage.setItem(key, JSON.stringify(doc));
  storeVersion += 1;
  notify();
}

// Phase 2 (SaaS Onboarding) — re-render every subscribed view when
// the active scope changes so the CTAD shell re-reads the document
// for the newly active Work Item.
if (typeof window !== "undefined") {
  currentScope.subscribe(() => {
    storeVersion += 1;
    notify();
  });
}

// Monotonic version counter incremented on every successful write.
// Views that adapt this store to React's `useSyncExternalStore`
// MUST use `getStoreVersion` as the snapshot — returning a fresh
// timestamp or new object identity from the snapshot function
// breaks the contract and triggers React's "snapshot should be
// cached" warning / re-render loops.
let storeVersion = 0;
export function getStoreVersion(): number {
  return storeVersion;
}

// Subscription model mirroring the ACW store: views call
// subscribe() and re-render whenever the stored doc changes.
type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      // Listener errors must not break other subscribers.
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Read API ----------------------------------------------------------

export function getBindingDoc(b: CtadBinding): CtadBindingDoc {
  const doc = readDoc();
  const existing = doc.bindings[bindingKey(b)];
  if (existing) return existing;
  return {
    adsId: b.adsId,
    adsVersion: b.adsVersion,
    params: {},
    environments: [],
    updatedAt: "",
  };
}

export function getCtadParam(
  b: CtadBinding,
  paramId: string,
): CtadParamValue {
  const v = getBindingDoc(b).params[paramId];
  return v === undefined ? null : v;
}

// Write API ---------------------------------------------------------

export function setCtadParam(
  b: CtadBinding,
  paramId: string,
  value: CtadParamValue,
): void {
  const param = findParam(paramId);
  if (!param) {
    throw new Error(
      `CTAD store: unknown parameter id "${paramId}". Every parameter must be declared in ctadRegistry.`,
    );
  }
  if (value !== null) {
    if (param.kind === "single") {
      if (typeof value !== "string" || !param.options.includes(value)) {
        throw new Error(
          `CTAD store: value "${String(value)}" is not a permitted option for "${paramId}".`,
        );
      }
    } else {
      if (
        !Array.isArray(value) ||
        !value.every(
          (v) => typeof v === "string" && param.options.includes(v),
        )
      ) {
        throw new Error(
          `CTAD store: multi-value "${JSON.stringify(value)}" contains options not permitted for "${paramId}".`,
        );
      }
    }
  }

  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key];

  // No-op fast path: clearing a param on a binding that doesn't
  // exist would otherwise create an empty {params: {}} record. We
  // refuse to materialise an empty binding so the persisted
  // document stays clean and so build-time invariants can prove
  // that the store never leaks synthetic bindings.
  if (value === null && prev === undefined) return;

  const params = { ...(prev?.params ?? {}) };
  if (value === null) {
    delete params[paramId];
  } else {
    params[paramId] = value;
  }

  const prevEnvs = prev?.environments ?? [];
  const nextBindings = { ...doc.bindings };
  if (Object.keys(params).length === 0 && prevEnvs.length === 0) {
    delete nextBindings[key];
  } else {
    nextBindings[key] = {
      adsId: b.adsId,
      adsVersion: b.adsVersion,
      params,
      environments: prevEnvs,
      updatedAt: new Date().toISOString(),
    };
  }
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: nextBindings, architectures: doc.architectures });
}

export function clearCtadParam(b: CtadBinding, paramId: string): void {
  setCtadParam(b, paramId, null);
}

// Environments write API (Task #77) -------------------------------

function writeEnvironments(
  b: CtadBinding,
  next: readonly CtadEnvironmentDef[],
): void {
  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key];
  const params = prev?.params ?? {};
  const nextBindings = { ...doc.bindings };
  if (next.length === 0 && Object.keys(params).length === 0) {
    delete nextBindings[key];
  } else {
    nextBindings[key] = {
      adsId: b.adsId,
      adsVersion: b.adsVersion,
      params,
      environments: Object.freeze(next.map((e) => Object.freeze({ ...e }))),
      updatedAt: new Date().toISOString(),
    };
  }
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: nextBindings, architectures: doc.architectures });
}

function validateEnvironment(env: CtadEnvironmentDef): void {
  if (!isValidEnvironmentId(env.id)) {
    throw new Error(
      `CTAD store: environment id "${env.id}" is not a valid identifier (lowercase letters, digits, hyphens; must start with a letter).`,
    );
  }
  if (env.name.trim().length === 0) {
    throw new Error(`CTAD store: environment "${env.id}" requires a non-empty name.`);
  }
  if (!isValidEnvironmentKind(env.kind)) {
    throw new Error(
      `CTAD store: environment kind "${env.kind}" is not in the permitted set.`,
    );
  }
  if (!isValidEnvironmentHostingModel(env.hostingModel)) {
    throw new Error(
      `CTAD store: environment hosting model "${env.hostingModel}" is not in the permitted set.`,
    );
  }
}

export function getEnvironments(b: CtadBinding): readonly CtadEnvironmentDef[] {
  return getBindingDoc(b).environments;
}

export function addEnvironment(b: CtadBinding, env: CtadEnvironmentDef): void {
  validateEnvironment(env);
  const current = getEnvironments(b);
  if (current.some((e) => e.id === env.id)) {
    throw new Error(
      `CTAD store: environment id "${env.id}" already exists for this binding.`,
    );
  }
  writeEnvironments(b, [...current, env]);
}

export function updateEnvironment(
  b: CtadBinding,
  env: CtadEnvironmentDef,
): void {
  validateEnvironment(env);
  const current = getEnvironments(b);
  const idx = current.findIndex((e) => e.id === env.id);
  if (idx === -1) {
    throw new Error(
      `CTAD store: cannot update unknown environment id "${env.id}".`,
    );
  }
  const next = current.slice();
  next[idx] = env;
  writeEnvironments(b, next);
}

export function removeEnvironment(b: CtadBinding, envId: string): void {
  const current = getEnvironments(b);
  if (!current.some((e) => e.id === envId)) return;
  writeEnvironments(b, current.filter((e) => e.id !== envId));
}

export function clearBinding(b: CtadBinding): void {
  const doc = readDoc();
  const key = bindingKey(b);
  if (!(key in doc.bindings)) return;
  const next = { ...doc.bindings };
  delete next[key];
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: next, architectures: doc.architectures });
}

// Canonical CTAD_STATE export --------------------------------------

export interface CtadStateExport {
  readonly schemaVersion: typeof CTAD_SCHEMA_VERSION;
  readonly binding: CtadBinding;
  readonly infrastructure: Readonly<Record<string, CtadParamValue>>;
  readonly application: Readonly<Record<string, CtadParamValue>>;
  readonly integration: Readonly<Record<string, CtadParamValue>>;
  readonly crossCutting: Readonly<Record<string, CtadParamValue>>;
  readonly ops: Readonly<Record<string, CtadParamValue>>;
  // First-class environments (Task #77). Always present (possibly
  // empty). The DiagramSpec compiler reads this list verbatim — when
  // empty, the deployment view falls into a flat host-only branch
  // with no environment containers.
  readonly environments: readonly CtadEnvironmentDef[];
}

export function exportCtadState(b: CtadBinding): CtadStateExport {
  const doc = getBindingDoc(b);
  const grouped: Record<CtadSectionId, Record<string, CtadParamValue>> = {
    infrastructure: {},
    application: {},
    integration: {},
    crossCutting: {},
    ops: {},
  };
  for (const section of CTAD_SECTIONS) {
    const sectionParams = grouped[section.id];
    // Deterministic key order: registry order, never insertion order.
    for (const param of section.parameters) {
      const v = doc.params[param.id];
      sectionParams[param.id] = v === undefined ? null : v;
    }
  }
  return {
    schemaVersion: CTAD_SCHEMA_VERSION,
    binding: { adsId: b.adsId, adsVersion: b.adsVersion },
    infrastructure: grouped.infrastructure,
    application: grouped.application,
    integration: grouped.integration,
    crossCutting: grouped.crossCutting,
    ops: grouped.ops,
    environments: doc.environments,
  };
}

// Documented alias matching the brief's `getCtadState(binding)` API.
// Some external readers (downstream ACW handoff, future tests) may
// import this name; we delegate to `exportCtadState` so there is a
// single source of truth for the canonical, registry-ordered,
// null-padded snapshot.
export function getCtadState(b: CtadBinding): CtadStateExport {
  return exportCtadState(b);
}

// Architecture workspace API (Phase 1 — standalone explorations) --

function writeArchitectureDoc(next: CtadArchitectureDoc | null, id: string): void {
  const doc = readDoc();
  const nextArchs = { ...doc.architectures };
  if (next === null) {
    delete nextArchs[id];
  } else {
    nextArchs[id] = next;
  }
  writeDoc({
    schemaVersion: CTAD_SCHEMA_VERSION,
    bindings: doc.bindings,
    architectures: nextArchs,
  });
}

export function listArchitectures(): readonly CtadArchitectureDoc[] {
  const doc = readDoc();
  // Deterministic order: createdAt ascending, then id for ties.
  return Object.values(doc.architectures).slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.architectureId < b.architectureId ? -1 : 1;
  });
}

export function getArchitectureDoc(id: string): CtadArchitectureDoc | null {
  if (!isValidArchitectureId(id)) return null;
  const doc = readDoc();
  return doc.architectures[id] ?? null;
}

// Optional `id` is an additive seed-affordance: when absent the routine
// behaves exactly as before (random hex suffix). The dev-only seeder
// (`/seed-all`) supplies it so re-running the seed produces a
// byte-identical localStorage snapshot. When supplied it must satisfy
// `isValidArchitectureId` (the same regex the persisted-doc validator
// enforces).
export function createArchitecture(
  name: string,
  opts?: { readonly id?: string },
): CtadArchitectureDoc {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("CTAD store: architecture name must be non-empty.");
  }
  let id: string;
  if (opts?.id !== undefined) {
    if (!isValidArchitectureId(opts.id)) {
      throw new Error(
        `CTAD store: caller-supplied architecture id "${opts.id}" does not match the required format.`,
      );
    }
    id = opts.id;
  } else {
    id = generateArchitectureId(trimmed);
  }
  const now = new Date().toISOString();
  const next: CtadArchitectureDoc = Object.freeze({
    architectureId: id,
    architectureName: trimmed,
    params: {},
    environments: [],
    createdAt: now,
    updatedAt: now,
  });
  writeArchitectureDoc(next, id);
  return next;
}

export function removeArchitecture(id: string): void {
  if (!isValidArchitectureId(id)) return;
  const doc = readDoc();
  if (!(id in doc.architectures)) return;
  writeArchitectureDoc(null, id);
}

export function setArchitectureParam(
  id: string,
  paramId: string,
  value: CtadParamValue,
): void {
  const param = findParam(paramId);
  if (!param) {
    throw new Error(
      `CTAD store: unknown parameter id "${paramId}". Every parameter must be declared in ctadRegistry.`,
    );
  }
  if (value !== null) {
    if (param.kind === "single") {
      if (typeof value !== "string" || !param.options.includes(value)) {
        throw new Error(
          `CTAD store: value "${String(value)}" is not a permitted option for "${paramId}".`,
        );
      }
    } else if (
      !Array.isArray(value) ||
      !value.every((v) => typeof v === "string" && param.options.includes(v))
    ) {
      throw new Error(
        `CTAD store: multi-value "${JSON.stringify(value)}" contains options not permitted for "${paramId}".`,
      );
    }
  }
  const prev = getArchitectureDoc(id);
  if (prev === null) {
    throw new Error(
      `CTAD store: architecture "${id}" does not exist. Call createArchitecture first.`,
    );
  }
  const params = { ...prev.params };
  const had = paramId in params;
  if (value === null) {
    if (!had) return; // no-op: clearing an already-unset param.
    delete params[paramId];
  } else {
    params[paramId] = value;
  }
  // Empty-architecture-leak rule mirrors the empty-binding rule:
  // clearing the LAST param AND having no environments removes the
  // architecture entry. The rule only triggers on a real transition
  // (a no-op clear above is short-circuited and never reaches this
  // point), so a freshly-created workspace with no selections still
  // persists until a real param/env edit collapses it back to empty.
  if (Object.keys(params).length === 0 && prev.environments.length === 0) {
    writeArchitectureDoc(null, id);
    return;
  }
  writeArchitectureDoc(
    Object.freeze({
      ...prev,
      params,
      updatedAt: new Date().toISOString(),
    }),
    id,
  );
}

export function clearArchitectureParam(id: string, paramId: string): void {
  setArchitectureParam(id, paramId, null);
}

export function getArchitectureEnvironments(
  id: string,
): readonly CtadEnvironmentDef[] {
  return getArchitectureDoc(id)?.environments ?? [];
}

function writeArchitectureEnvironments(
  id: string,
  next: readonly CtadEnvironmentDef[],
): void {
  const prev = getArchitectureDoc(id);
  if (prev === null) {
    throw new Error(
      `CTAD store: architecture "${id}" does not exist. Call createArchitecture first.`,
    );
  }
  // Empty-architecture-leak parity with setArchitectureParam:
  // removing the LAST environment AND having no params removes the
  // architecture entry.
  if (next.length === 0 && Object.keys(prev.params).length === 0) {
    writeArchitectureDoc(null, id);
    return;
  }
  writeArchitectureDoc(
    Object.freeze({
      ...prev,
      environments: Object.freeze(next.map((e) => Object.freeze({ ...e }))),
      updatedAt: new Date().toISOString(),
    }),
    id,
  );
}

// Rename (also serves as the editable-title write path in the
// architecture shell). Updates `updatedAt` so the listing's
// "Last edited" column reflects the change.
export function renameArchitecture(id: string, newName: string): void {
  const trimmed = newName.trim();
  if (trimmed.length === 0) {
    throw new Error("CTAD store: architecture name must be non-empty.");
  }
  const prev = getArchitectureDoc(id);
  if (prev === null) {
    throw new Error(
      `CTAD store: architecture "${id}" does not exist.`,
    );
  }
  if (prev.architectureName === trimmed) return;
  writeArchitectureDoc(
    Object.freeze({
      ...prev,
      architectureName: trimmed,
      updatedAt: new Date().toISOString(),
    }),
    id,
  );
}

export function addArchitectureEnvironment(
  id: string,
  env: CtadEnvironmentDef,
): void {
  validateEnvironment(env);
  const current = getArchitectureEnvironments(id);
  if (current.some((e) => e.id === env.id)) {
    throw new Error(
      `CTAD store: environment id "${env.id}" already exists for this architecture.`,
    );
  }
  writeArchitectureEnvironments(id, [...current, env]);
}

export function updateArchitectureEnvironment(
  id: string,
  env: CtadEnvironmentDef,
): void {
  validateEnvironment(env);
  const current = getArchitectureEnvironments(id);
  const idx = current.findIndex((e) => e.id === env.id);
  if (idx === -1) {
    throw new Error(
      `CTAD store: cannot update unknown environment id "${env.id}".`,
    );
  }
  const next = current.slice();
  next[idx] = env;
  writeArchitectureEnvironments(id, next);
}

export function removeArchitectureEnvironment(id: string, envId: string): void {
  const current = getArchitectureEnvironments(id);
  if (!current.some((e) => e.id === envId)) return;
  writeArchitectureEnvironments(
    id,
    current.filter((e) => e.id !== envId),
  );
}

// Architecture-mode CTAD_STATE export. Mirrors `exportCtadState`
// for bindings but carries an `architecture: { id, name }` block in
// place of `binding: { adsId, adsVersion }`. The five section
// dictionaries and the `environments` list have an identical shape
// so downstream readers can treat both modes through a single set
// of accessors keyed by section / parameter id.
export interface CtadArchitectureStateExport {
  readonly schemaVersion: typeof CTAD_SCHEMA_VERSION;
  readonly architecture: {
    readonly architectureId: string;
    readonly architectureName: string;
  };
  readonly infrastructure: Readonly<Record<string, CtadParamValue>>;
  readonly application: Readonly<Record<string, CtadParamValue>>;
  readonly integration: Readonly<Record<string, CtadParamValue>>;
  readonly crossCutting: Readonly<Record<string, CtadParamValue>>;
  readonly ops: Readonly<Record<string, CtadParamValue>>;
  readonly environments: readonly CtadEnvironmentDef[];
}

export function exportArchitectureState(
  id: string,
): CtadArchitectureStateExport | null {
  const doc = getArchitectureDoc(id);
  if (doc === null) return null;
  const grouped: Record<CtadSectionId, Record<string, CtadParamValue>> = {
    infrastructure: {},
    application: {},
    integration: {},
    crossCutting: {},
    ops: {},
  };
  for (const section of CTAD_SECTIONS) {
    const sectionParams = grouped[section.id];
    for (const param of section.parameters) {
      const v = doc.params[param.id];
      sectionParams[param.id] = v === undefined ? null : v;
    }
  }
  return {
    schemaVersion: CTAD_SCHEMA_VERSION,
    architecture: {
      architectureId: doc.architectureId,
      architectureName: doc.architectureName,
    },
    infrastructure: grouped.infrastructure,
    application: grouped.application,
    integration: grouped.integration,
    crossCutting: grouped.crossCutting,
    ops: grouped.ops,
    environments: doc.environments,
  };
}

// Internal hook for the build-time grammar invariant ----------------
export const __ctadStoreInternals = {
  STORAGE_KEY: BASE_STORAGE_KEY,
  BASE_STORAGE_KEY,
  getStorageKey,
  readDoc,
  EMPTY_DOC,
};

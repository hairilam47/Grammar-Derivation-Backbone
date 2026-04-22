// CTAD — bounded, per-binding exploration state store.
//
// Persists categorical technology selections per ADC binding in
// localStorage under `ctad.state.v1`. Each binding is keyed by
// `${adsId}@${adsVersion}`. Selections are reversible at any
// time; missing values mean "not specified" (null in the
// serialised CTAD_STATE), never a default.
//
// The store does NOT mutate or read ADC artefacts. The binding key
// is opaque from CTAD's point of view — CTAD never validates that
// the binding refers to a real frozen decision; the entry page is
// responsible for resolving it via the read-only portfolio listing.

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

const STORAGE_KEY = "ctad.state.v1";

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

interface CtadStoreDoc {
  readonly schemaVersion: typeof CTAD_SCHEMA_VERSION;
  readonly bindings: Readonly<Record<string, CtadBindingDoc>>;
}

const EMPTY_DOC: CtadStoreDoc = Object.freeze({
  schemaVersion: CTAD_SCHEMA_VERSION,
  bindings: Object.freeze({}),
});

// Deterministic v1.0 → v1.1 migration. The only structural change
// is the addition of a `environments: []` array per binding (the
// canonical empty value for the new first-class concept). The
// migration is a pure function of the input doc, runs at read
// time, and never mutates the persisted blob — the next write
// will rewrite the doc with the bumped schemaVersion.
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

function readDoc(): CtadStoreDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    return {
      schemaVersion: CTAD_SCHEMA_VERSION,
      bindings,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: CtadStoreDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  storeVersion += 1;
  notify();
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
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: nextBindings });
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
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: nextBindings });
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
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: next });
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

// Internal hook for the build-time grammar invariant ----------------
export const __ctadStoreInternals = {
  STORAGE_KEY,
  readDoc,
  EMPTY_DOC,
};

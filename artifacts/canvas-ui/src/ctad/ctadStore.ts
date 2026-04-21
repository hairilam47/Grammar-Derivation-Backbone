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
  CTAD_SCHEMA_VERSION,
  CTAD_SECTIONS,
  findParam,
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
      parsed.schemaVersion !== CTAD_SCHEMA_VERSION ||
      typeof parsed.bindings !== "object" ||
      parsed.bindings === null
    ) {
      return EMPTY_DOC;
    }
    return {
      schemaVersion: CTAD_SCHEMA_VERSION,
      bindings: parsed.bindings as Record<string, CtadBindingDoc>,
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

  const nextBindings = { ...doc.bindings };
  if (Object.keys(params).length === 0) {
    delete nextBindings[key];
  } else {
    nextBindings[key] = {
      adsId: b.adsId,
      adsVersion: b.adsVersion,
      params,
      updatedAt: new Date().toISOString(),
    };
  }
  writeDoc({ schemaVersion: CTAD_SCHEMA_VERSION, bindings: nextBindings });
}

export function clearCtadParam(b: CtadBinding, paramId: string): void {
  setCtadParam(b, paramId, null);
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
}

export function exportCtadState(b: CtadBinding): CtadStateExport {
  const doc = getBindingDoc(b);
  const grouped: Record<CtadSectionId, Record<string, CtadParamValue>> = {
    infrastructure: {},
    application: {},
    integration: {},
    crossCutting: {},
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

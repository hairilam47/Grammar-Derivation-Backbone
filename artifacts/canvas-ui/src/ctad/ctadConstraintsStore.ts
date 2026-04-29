// CTAD constraints store — `ctad.constraints.v1`.
//
// Persists the per-binding, per-parameter list of constraint
// contributions that have been applied from CNCF cards. Each
// contribution records:
//   - the card id that introduced it
//   - the allowedOptions subset it imposes
//   - the wall-clock timestamp at which it was applied
//
// The ACTIVE allowed-option set for a parameter is the
// intersection of every contribution's allowedOptions for that
// param. If the intersection is empty, the contributions are
// reported as "in conflict" and the UI surfaces the conflict
// rather than silently hiding an option.
//
// This store does NOT mutate CTAD parameter values; it stores
// only the constraint annotations alongside them. The CTAD value
// store (`ctadStore.ts`) remains the source of truth for what
// option a parameter currently holds.

import {
  resolveActiveKey,
  currentScope,
} from "@/governance/storageKeyUtils";

// Phase 2 (SaaS Onboarding) — Org+WorkItem scope.
export const BASE_STORAGE_KEY = "ctad.constraints.v1";
const SCHEMA_VERSION = "ctad-constraints-1.0" as const;

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}

import { findParam, type CtadParameter } from "./ctadRegistry";
import type { CtadBinding } from "./ctadStore";

export interface ConstraintContribution {
  readonly cardId: string;
  readonly allowedOptions: readonly string[];
  readonly appliedAt: string;
}

export interface BindingConstraintsDoc {
  readonly adsId: string;
  readonly adsVersion: string;
  readonly byParam: Readonly<Record<string, readonly ConstraintContribution[]>>;
}

interface ConstraintsStoreDoc {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly bindings: Readonly<Record<string, BindingConstraintsDoc>>;
}

const EMPTY_DOC: ConstraintsStoreDoc = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  bindings: Object.freeze({}),
});

function bindingKey(b: CtadBinding): string {
  return `${b.adsId}@${b.adsVersion}`;
}

function readDoc(): ConstraintsStoreDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  const key = getStorageKey();
  if (key === null) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<ConstraintsStoreDoc>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== SCHEMA_VERSION ||
      typeof parsed.bindings !== "object" ||
      parsed.bindings === null
    ) {
      return EMPTY_DOC;
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      bindings: parsed.bindings as Record<string, BindingConstraintsDoc>,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: ConstraintsStoreDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getStorageKey();
  if (key === null) return;
  window.localStorage.setItem(key, JSON.stringify(doc));
  storeVersion += 1;
  notify();
}

if (typeof window !== "undefined") {
  currentScope.subscribe(() => {
    storeVersion += 1;
    notify();
  });
}

let storeVersion = 0;
export function getConstraintsStoreVersion(): number {
  return storeVersion;
}

type Listener = () => void;
const listeners = new Set<Listener>();
function notify(): void {
  for (const l of Array.from(listeners)) {
    try {
      l();
    } catch {
      /* listener errors must not break siblings */
    }
  }
}
export function subscribeConstraints(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Read API ----------------------------------------------------------

export function getBindingConstraintsDoc(
  b: CtadBinding,
): BindingConstraintsDoc {
  const doc = readDoc();
  const existing = doc.bindings[bindingKey(b)];
  if (existing) return existing;
  return { adsId: b.adsId, adsVersion: b.adsVersion, byParam: {} };
}

export function getContributions(
  b: CtadBinding,
  paramId: string,
): readonly ConstraintContribution[] {
  return getBindingConstraintsDoc(b).byParam[paramId] ?? [];
}

// Active allowed-option set for a parameter:
//   - no contributions     → null (parameter is unconstrained;
//                                  all registry options remain
//                                  permitted)
//   - >=1 contributions    → intersection of every contribution's
//                            allowedOptions, preserving registry
//                            order. May be the empty array (which
//                            is reported as "in conflict").
export function getActiveAllowedOptions(
  b: CtadBinding,
  paramId: string,
): readonly string[] | null {
  const contribs = getContributions(b, paramId);
  if (contribs.length === 0) return null;
  const param: CtadParameter | undefined = findParam(paramId);
  if (!param) return null;
  // Start with the parameter's full option set in registry order,
  // then intersect with each contribution.
  let active: string[] = [...param.options];
  for (const c of contribs) {
    const allow = new Set(c.allowedOptions);
    active = active.filter((opt) => allow.has(opt));
  }
  return active;
}

// Write API ---------------------------------------------------------

export function addContribution(
  b: CtadBinding,
  paramId: string,
  contribution: ConstraintContribution,
): void {
  const param = findParam(paramId);
  if (!param) {
    throw new Error(
      `CTAD constraints: unknown parameter id "${paramId}".`,
    );
  }
  for (const opt of contribution.allowedOptions) {
    if (!param.options.includes(opt)) {
      throw new Error(
        `CTAD constraints: option "${opt}" is not permitted for "${paramId}".`,
      );
    }
  }
  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key] ?? {
    adsId: b.adsId,
    adsVersion: b.adsVersion,
    byParam: {},
  };
  const prevContribs = prev.byParam[paramId] ?? [];
  // Idempotency: if the same cardId already has a contribution for
  // this paramId, replace it; otherwise append.
  const without = prevContribs.filter((c) => c.cardId !== contribution.cardId);
  const nextContribs: readonly ConstraintContribution[] = [
    ...without,
    contribution,
  ];
  const nextByParam = { ...prev.byParam, [paramId]: nextContribs };
  const nextBinding: BindingConstraintsDoc = {
    adsId: b.adsId,
    adsVersion: b.adsVersion,
    byParam: nextByParam,
  };
  writeDoc({
    schemaVersion: SCHEMA_VERSION,
    bindings: { ...doc.bindings, [key]: nextBinding },
  });
}

export function removeCardContributions(b: CtadBinding, cardId: string): void {
  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key];
  if (!prev) return;
  const nextByParam: Record<string, readonly ConstraintContribution[]> = {};
  let changed = false;
  for (const [paramId, contribs] of Object.entries(prev.byParam)) {
    const filtered = contribs.filter((c) => c.cardId !== cardId);
    if (filtered.length !== contribs.length) changed = true;
    if (filtered.length > 0) nextByParam[paramId] = filtered;
  }
  if (!changed) return;
  const nextBindings = { ...doc.bindings };
  if (Object.keys(nextByParam).length === 0) {
    delete nextBindings[key];
  } else {
    nextBindings[key] = {
      adsId: b.adsId,
      adsVersion: b.adsVersion,
      byParam: nextByParam,
    };
  }
  writeDoc({ schemaVersion: SCHEMA_VERSION, bindings: nextBindings });
}

export const __ctadConstraintsInternals = {
  STORAGE_KEY: BASE_STORAGE_KEY,
  BASE_STORAGE_KEY,
  getStorageKey,
  SCHEMA_VERSION,
  readDoc,
};

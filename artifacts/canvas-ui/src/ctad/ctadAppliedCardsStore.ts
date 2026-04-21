// CTAD applied-cards store — `ctad.applied-cards.v1`.
//
// Per-binding audit log of CNCF cards that have been applied to
// the current binding. Each applied entry captures the diff that
// the application produced (set effects, constrain effects,
// justify effects). The diff is what the binding engine consults
// to ROLL BACK an applied card on removal.
//
// This store is independent of `ctadConstraintsStore` and the
// value store: the constraints store records the ACTIVE
// constraint contributions; this store records the AUDIT TRAIL of
// every card that has been applied. The two are kept consistent
// by the binding engine (`cncfBindingEngine.ts`).

const STORAGE_KEY = "ctad.applied-cards.v1";
const SCHEMA_VERSION = "ctad-applied-cards-1.0" as const;

import type { CtadBinding, CtadParamValue } from "./ctadStore";

export interface AppliedSetEffect {
  readonly paramId: string;
  readonly before: CtadParamValue;
  readonly after: CtadParamValue;
}
export interface AppliedConstrainEffect {
  readonly paramId: string;
  readonly allowedOptions: readonly string[];
}
export interface AppliedJustifyEffect {
  readonly paramId: string;
  readonly rationale: string;
}

export interface AppliedCardEntry {
  readonly cardId: string;
  readonly appliedAt: string;
  readonly sets: readonly AppliedSetEffect[];
  readonly constrains: readonly AppliedConstrainEffect[];
  readonly justifies: readonly AppliedJustifyEffect[];
}

export interface BindingAppliedCardsDoc {
  readonly adsId: string;
  readonly adsVersion: string;
  readonly entries: readonly AppliedCardEntry[];
}

interface AppliedCardsStoreDoc {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly bindings: Readonly<Record<string, BindingAppliedCardsDoc>>;
}

const EMPTY_DOC: AppliedCardsStoreDoc = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  bindings: Object.freeze({}),
});

function bindingKey(b: CtadBinding): string {
  return `${b.adsId}@${b.adsVersion}`;
}

function readDoc(): AppliedCardsStoreDoc {
  if (typeof window === "undefined" || !window.localStorage) return EMPTY_DOC;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_DOC;
    const parsed = JSON.parse(raw) as Partial<AppliedCardsStoreDoc>;
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
      bindings: parsed.bindings as Record<string, BindingAppliedCardsDoc>,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: AppliedCardsStoreDoc): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  storeVersion += 1;
  notify();
}

let storeVersion = 0;
export function getAppliedCardsStoreVersion(): number {
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
export function subscribeAppliedCards(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Read API ----------------------------------------------------------

export function getAppliedCardsForBinding(
  b: CtadBinding,
): readonly AppliedCardEntry[] {
  const doc = readDoc();
  return doc.bindings[bindingKey(b)]?.entries ?? [];
}

export function isCardApplied(b: CtadBinding, cardId: string): boolean {
  return getAppliedCardsForBinding(b).some((e) => e.cardId === cardId);
}

export function getAppliedEntry(
  b: CtadBinding,
  cardId: string,
): AppliedCardEntry | undefined {
  return getAppliedCardsForBinding(b).find((e) => e.cardId === cardId);
}

// Write API ---------------------------------------------------------

export function recordAppliedCard(
  b: CtadBinding,
  entry: AppliedCardEntry,
): void {
  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key] ?? {
    adsId: b.adsId,
    adsVersion: b.adsVersion,
    entries: [],
  };
  // Idempotency: replace any existing entry for the same cardId.
  const without = prev.entries.filter((e) => e.cardId !== entry.cardId);
  const nextEntries = [...without, entry];
  const nextBinding: BindingAppliedCardsDoc = {
    adsId: b.adsId,
    adsVersion: b.adsVersion,
    entries: nextEntries,
  };
  writeDoc({
    schemaVersion: SCHEMA_VERSION,
    bindings: { ...doc.bindings, [key]: nextBinding },
  });
}

export function removeAppliedCardEntry(b: CtadBinding, cardId: string): void {
  const doc = readDoc();
  const key = bindingKey(b);
  const prev = doc.bindings[key];
  if (!prev) return;
  const nextEntries = prev.entries.filter((e) => e.cardId !== cardId);
  if (nextEntries.length === prev.entries.length) return;
  const nextBindings = { ...doc.bindings };
  if (nextEntries.length === 0) {
    delete nextBindings[key];
  } else {
    nextBindings[key] = {
      adsId: b.adsId,
      adsVersion: b.adsVersion,
      entries: nextEntries,
    };
  }
  writeDoc({ schemaVersion: SCHEMA_VERSION, bindings: nextBindings });
}

export const __ctadAppliedCardsInternals = {
  STORAGE_KEY,
  SCHEMA_VERSION,
  readDoc,
};

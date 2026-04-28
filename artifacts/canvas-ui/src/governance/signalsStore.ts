// Step 6 — Policy Signals & Institutional Memory
//
// S6-HC1 Derived-only: this module imports nothing from grammar, wizard,
// freeze, or ADS/ECP builders. It only references the Step 5 portfolio
// read-model via PortfolioEntry shape (adsId + adsVersion).
// S6-HC2 No decision authority: no Step 1–4 module imports this file.
// S6-HC4 Strict field allow-list: write throws on unknown fields; read
// silently drops invalid entries. Nested objects are key-checked too.
// S6-HC5 Fixed taxonomy: exactly seven categories.
// S6-HC6 Fixed lifecycle: three states, forward-only, human-initiated.
// S6-HC9 Interpretation guidance phrased as questions only (validator).

const STORAGE_KEY = "adc.policy-signals.v1";

export const SIGNAL_CATEGORIES = [
  "Risk Accumulation",
  "Complexity Accumulation",
  "Dependency Concentration",
  "Posture Drift",
  "Control Load",
  "Decision Volatility",
  "Exception Normalisation",
] as const;

export type SignalCategory = (typeof SIGNAL_CATEGORIES)[number];

export const SIGNAL_STATUSES = [
  "Observed",
  "Under Discussion",
  "Acknowledged",
] as const;

export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export interface RelatedEntry {
  adsId: string;
  adsVersion: string;
}

export interface EvidenceSummary {
  observationWindow: string;
  relatedDecisionCount: number;
  qualitativePattern: string;
  relatedEntries?: RelatedEntry[];
}

export interface PolicySignal {
  signalId: string;
  signalCategory: SignalCategory;
  signalTitle: string;
  signalDescription: string;
  evidenceSummary: EvidenceSummary;
  interpretationGuidance: string[];
  regulatoryContext?: string;
  reviewingBody: string;
  status: SignalStatus;
  createdAt: string;
  lastReviewedAt: string;
}

const ALLOWED_TOP_LEVEL = [
  "signalId",
  "signalCategory",
  "signalTitle",
  "signalDescription",
  "evidenceSummary",
  "interpretationGuidance",
  "regulatoryContext",
  "reviewingBody",
  "status",
  "createdAt",
  "lastReviewedAt",
] as const;

const ALLOWED_EVIDENCE_KEYS = new Set([
  "observationWindow",
  "relatedDecisionCount",
  "qualitativePattern",
  "relatedEntries",
]);

const ALLOWED_RELATED_ENTRY_KEYS = new Set(["adsId", "adsVersion"]);

const SIGNAL_CATEGORIES_SET = new Set<string>(SIGNAL_CATEGORIES);
const SIGNAL_STATUSES_SET = new Set<string>(SIGNAL_STATUSES);

// S6-HC9: every interpretation guidance entry must be a non-empty string
// that ends with a question mark. Surrounding whitespace is ignored.
export function endsWithQuestionMark(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.endsWith("?");
}

export function nextStatus(current: SignalStatus): SignalStatus | null {
  if (current === "Observed") return "Under Discussion";
  if (current === "Under Discussion") return "Acknowledged";
  return null;
}

function assertAllowedTopLevel(signal: unknown): void {
  if (signal === null || typeof signal !== "object") {
    throw new Error("Policy signal must be an object.");
  }
  const allowed = new Set<string>(ALLOWED_TOP_LEVEL);
  for (const k of Object.keys(signal as Record<string, unknown>)) {
    if (!allowed.has(k)) {
      throw new Error(
        `Policy signal contains forbidden field "${k}". Allowed fields: ${ALLOWED_TOP_LEVEL.join(", ")}.`,
      );
    }
  }
}

// S6-HC4: nested allow-list also enforced at write time. createSignal
// must throw on unknown keys in evidenceSummary or in any relatedEntries
// item — not silently drop them.
function assertAllowedEvidenceInput(input: unknown): void {
  if (input === null || typeof input !== "object") {
    throw new Error("evidenceSummary must be an object.");
  }
  for (const k of Object.keys(input as Record<string, unknown>)) {
    if (!ALLOWED_EVIDENCE_KEYS.has(k)) {
      throw new Error(
        `evidenceSummary contains forbidden field "${k}". Allowed: ${[...ALLOWED_EVIDENCE_KEYS].join(", ")}.`,
      );
    }
  }
  const e = input as Record<string, unknown>;
  if (e.relatedEntries !== undefined) {
    if (!Array.isArray(e.relatedEntries)) {
      throw new Error("evidenceSummary.relatedEntries must be an array.");
    }
    for (const r of e.relatedEntries) {
      if (r === null || typeof r !== "object") {
        throw new Error("relatedEntries items must be objects.");
      }
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!ALLOWED_RELATED_ENTRY_KEYS.has(k)) {
          throw new Error(
            `relatedEntries item contains forbidden field "${k}". Allowed: ${[...ALLOWED_RELATED_ENTRY_KEYS].join(", ")}.`,
          );
        }
      }
    }
  }
}

function isValidRelatedEntry(raw: unknown): raw is RelatedEntry {
  if (raw === null || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  for (const k of Object.keys(e)) {
    if (!ALLOWED_RELATED_ENTRY_KEYS.has(k)) return false;
  }
  return typeof e.adsId === "string" && typeof e.adsVersion === "string";
}

function isValidEvidence(raw: unknown): raw is EvidenceSummary {
  if (raw === null || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  for (const k of Object.keys(e)) {
    if (!ALLOWED_EVIDENCE_KEYS.has(k)) return false;
  }
  if (typeof e.observationWindow !== "string") return false;
  if (typeof e.relatedDecisionCount !== "number") return false;
  if (typeof e.qualitativePattern !== "string") return false;
  if (e.relatedEntries !== undefined) {
    if (!Array.isArray(e.relatedEntries)) return false;
    for (const r of e.relatedEntries) {
      if (!isValidRelatedEntry(r)) return false;
    }
  }
  return true;
}

function isValidSignal(raw: unknown): raw is PolicySignal {
  if (raw === null || typeof raw !== "object") return false;
  const s = raw as Record<string, unknown>;
  for (const k of Object.keys(s)) {
    if (!ALLOWED_TOP_LEVEL.includes(k as (typeof ALLOWED_TOP_LEVEL)[number])) {
      return false;
    }
  }
  if (typeof s.signalId !== "string" || s.signalId.length === 0) return false;
  if (typeof s.signalCategory !== "string" || !SIGNAL_CATEGORIES_SET.has(s.signalCategory)) return false;
  if (typeof s.signalTitle !== "string") return false;
  if (typeof s.signalDescription !== "string") return false;
  if (!isValidEvidence(s.evidenceSummary)) return false;
  if (!Array.isArray(s.interpretationGuidance)) return false;
  if (s.interpretationGuidance.length === 0) return false;
  for (const q of s.interpretationGuidance) {
    // S6-HC9: persisted guidance entries must also be questions. Records
    // whose guidance has been tampered with into non-question text are
    // dropped at read time, never rendered.
    if (typeof q !== "string") return false;
    if (!endsWithQuestionMark(q)) return false;
  }
  if (s.regulatoryContext !== undefined && typeof s.regulatoryContext !== "string") return false;
  if (typeof s.reviewingBody !== "string") return false;
  if (typeof s.status !== "string" || !SIGNAL_STATUSES_SET.has(s.status)) return false;
  if (typeof s.createdAt !== "string") return false;
  if (typeof s.lastReviewedAt !== "string") return false;
  return true;
}

function readAll(): PolicySignal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSignal);
  } catch {
    return [];
  }
}

function writeAll(signals: PolicySignal[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(signals));
}

export function listSignals(): PolicySignal[] {
  return readAll();
}

export interface CreateSignalInput {
  signalCategory: SignalCategory;
  signalTitle: string;
  signalDescription: string;
  evidenceSummary: EvidenceSummary;
  interpretationGuidance: string[];
  regulatoryContext?: string;
  reviewingBody: string;
}

function newSignalId(): string {
  const rand = Math.random().toString(16).slice(2, 10);
  return `sig-${Date.now().toString(16)}-${rand}`;
}

// Creates a new signal in Observed state. Both timestamps stamped to the
// same instant on creation (S6 spec: createdAt and lastReviewedAt are
// equal at birth).
//
// Optional `id` is an additive seed-affordance: when absent the routine
// behaves exactly as before (`sig-…` random suffix). The dev-only
// `/seed-all` route supplies it so re-running the seed produces a
// byte-identical localStorage snapshot. When supplied it must be a
// non-empty string.
export function createSignal(
  input: CreateSignalInput,
  opts?: { readonly id?: string },
): PolicySignal {
  if (!SIGNAL_CATEGORIES_SET.has(input.signalCategory)) {
    throw new Error(`Unknown signalCategory "${input.signalCategory}".`);
  }
  assertAllowedEvidenceInput(input.evidenceSummary);
  if (input.interpretationGuidance.length === 0) {
    throw new Error("interpretationGuidance must contain at least one question.");
  }
  for (const q of input.interpretationGuidance) {
    if (!endsWithQuestionMark(q)) {
      throw new Error(
        `Interpretation guidance entries must be phrased as questions ending with "?". Rejected: "${q}".`,
      );
    }
  }
  let signalId: string;
  if (opts?.id !== undefined) {
    if (typeof opts.id !== "string" || opts.id.length === 0) {
      throw new Error(
        `Caller-supplied signal id must be a non-empty string.`,
      );
    }
    signalId = opts.id;
  } else {
    signalId = newSignalId();
  }
  const now = new Date().toISOString();
  const signal: PolicySignal = {
    signalId,
    signalCategory: input.signalCategory,
    signalTitle: input.signalTitle,
    signalDescription: input.signalDescription,
    evidenceSummary: {
      observationWindow: input.evidenceSummary.observationWindow,
      relatedDecisionCount: input.evidenceSummary.relatedDecisionCount,
      qualitativePattern: input.evidenceSummary.qualitativePattern,
      ...(input.evidenceSummary.relatedEntries &&
      input.evidenceSummary.relatedEntries.length > 0
        ? {
            relatedEntries: input.evidenceSummary.relatedEntries.map((r) => ({
              adsId: r.adsId,
              adsVersion: r.adsVersion,
            })),
          }
        : {}),
    },
    interpretationGuidance: [...input.interpretationGuidance],
    ...(input.regulatoryContext && input.regulatoryContext.length > 0
      ? { regulatoryContext: input.regulatoryContext }
      : {}),
    reviewingBody: input.reviewingBody,
    status: "Observed",
    createdAt: now,
    lastReviewedAt: now,
  };
  assertAllowedTopLevel(signal);
  const all = readAll();
  all.push(signal);
  writeAll(all);
  return signal;
}

// Forward-only lifecycle transition. Throws when called on Acknowledged.
// Stamps lastReviewedAt with the current instant.
export function advanceSignal(signalId: string): PolicySignal {
  const all = readAll();
  const idx = all.findIndex((s) => s.signalId === signalId);
  if (idx < 0) throw new Error(`Policy signal "${signalId}" not found.`);
  const current = all[idx];
  const next = nextStatus(current.status);
  if (next === null) {
    throw new Error(
      `Policy signal "${signalId}" is at terminal status "${current.status}" and cannot advance.`,
    );
  }
  const nowIso = new Date().toISOString();
  const updated: PolicySignal = {
    ...current,
    status: next,
    lastReviewedAt: nowIso,
  };
  assertAllowedTopLevel(updated);
  all[idx] = updated;
  writeAll(all);
  return updated;
}

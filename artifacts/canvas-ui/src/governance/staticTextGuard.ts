// Governance language guards.
//
// Step 5 (HC6) and Step 6 (S6-HC8) each declare a forbidden vocabulary.
// They are intentionally separate so each layer can extend its own
// guarantees without breaking the other layer's permitted phrasing.
// For example, Step 5 must be able to say "does not imply priority"
// while Step 6 must reject the bare word "priority" in any static
// signals label.

const PORTFOLIO_FORBIDDEN = [
  "should",
  "recommended",
  "recommend",
  "optimal",
  "best practice",
  "best-practice",
  "preferred",
  "ideal",
  "ought to",
];

const SIGNALS_FORBIDDEN = [
  ...PORTFOLIO_FORBIDDEN,
  "priority",
  "fix",
  "resolve",
  "escalate",
  "mitigate",
];

// Step 7 (S7-HC5) extends the SIGNALS vocabulary with terms that would
// imply optimisation, urgency, or normative targets. The Reflective
// Governance View is descriptive only and must reject any wording that
// could be read as guidance or judgement. REFLECTIVE_FORBIDDEN is a
// strict superset of SIGNALS_FORBIDDEN (which is itself a strict
// superset of PORTFOLIO_FORBIDDEN).
export const REFLECTIVE_FORBIDDEN = [
  ...SIGNALS_FORBIDDEN,
  "optimise",
  "optimize",
  "improve",
  "reduce",
  "urgent",
  "critical",
  "hotspot",
  "hot-spot",
  "attention required",
  "target",
  "norm",
];

export class GovernanceLanguageError extends Error {
  constructor(term: string, sample: string) {
    super(
      `Static governance text contains forbidden term "${term}" (sample: "${sample}"). ` +
        `Governance views must use descriptive, non-prescriptive language.`,
    );
    this.name = "GovernanceLanguageError";
  }
}

function checkAgainst(text: string, vocabulary: string[]): void {
  const lower = text.toLowerCase();
  for (const term of vocabulary) {
    if (lower.indexOf(term) !== -1) {
      throw new GovernanceLanguageError(term, text);
    }
  }
}

export function assertGovernanceLanguage(text: string): void {
  checkAgainst(text, PORTFOLIO_FORBIDDEN);
}

export function assertAllGovernanceLanguage(texts: string[]): void {
  for (const t of texts) assertGovernanceLanguage(t);
}

export function assertSignalsLanguage(text: string): void {
  checkAgainst(text, SIGNALS_FORBIDDEN);
}

export function assertAllSignalsLanguage(texts: string[]): void {
  for (const t of texts) assertSignalsLanguage(t);
}

export function assertReflectiveLanguage(text: string): void {
  checkAgainst(text, REFLECTIVE_FORBIDDEN);
}

export function assertAllReflectiveLanguage(texts: string[]): void {
  for (const t of texts) assertReflectiveLanguage(t);
}

// Phase 2 (PH2-HC4) extends the SIGNALS vocabulary with a narrative-
// specific tier for the "Why this exposure exists" disclosures rendered
// inside the Decision Exposure View. The narrative composer must reject
// any wording that could be read as judgement, prescription, or
// urgency. EXPOSURE_NARRATIVE_FORBIDDEN is a strict superset of
// SIGNALS_FORBIDDEN. It is a separate sibling tier from
// REFLECTIVE_FORBIDDEN: the two layers extend SIGNALS in their own
// directions (Reflection forbids "norm"/"target" framing; Narratives
// forbid "must"/"high risk"/"severe"/"critical" framing). Neither is a
// strict superset of the other and they are not interchangeable.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ EXPOSURE_NARRATIVE
//           PORTFOLIO ⊂ SIGNALS ⊂ REFLECTIVE
export const EXPOSURE_NARRATIVE_FORBIDDEN = [
  ...SIGNALS_FORBIDDEN,
  "must",
  "improve",
  "reduce",
  "optimise",
  "optimize",
  "high risk",
  "severe",
  "critical",
];

export function assertExposureNarrativeLanguage(text: string): void {
  checkAgainst(text, EXPOSURE_NARRATIVE_FORBIDDEN);
}

export function assertAllExposureNarrativeLanguage(texts: string[]): void {
  for (const t of texts) assertExposureNarrativeLanguage(t);
}

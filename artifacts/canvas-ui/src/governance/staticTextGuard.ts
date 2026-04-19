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
// could be read as guidance or judgement.
//
// One deliberate carve-out: the inherited tokens "recommend" and
// "recommended" are intentionally OMITTED. This mirrors the existing
// PORTFOLIO -> SIGNALS layering, where PORTFOLIO forbids "priority"
// only at the SIGNALS layer so the Portfolio interpretation panel can
// still say "does not imply priority". In the same way, the Reflection
// interpretation panel must be able to declare that the view "does not
// assess, rank, recommend, or require action" — using the word inside
// an explicit negation of system behaviour. Any prescriptive use of
// "recommend" in actual guidance text remains rejected by the SIGNALS
// guard at the layer below.
const SIGNALS_FORBIDDEN_FOR_REFLECTIVE = SIGNALS_FORBIDDEN.filter(
  (t) => t !== "recommend" && t !== "recommended",
);
export const REFLECTIVE_FORBIDDEN = [
  ...SIGNALS_FORBIDDEN_FOR_REFLECTIVE,
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

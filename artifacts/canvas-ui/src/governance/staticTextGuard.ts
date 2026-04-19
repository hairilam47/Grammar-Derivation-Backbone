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

// HC6: governance language. The portfolio view is descriptive, not
// prescriptive. The vocabulary below would imply judgement or recommendation
// and must never appear in any static portfolio string.
const FORBIDDEN_VOCABULARY = [
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

export class GovernanceLanguageError extends Error {
  constructor(term: string, sample: string) {
    super(
      `Static governance text contains forbidden term "${term}" (sample: "${sample}"). ` +
        `Portfolio view must use descriptive, non-prescriptive language (HC6).`,
    );
    this.name = "GovernanceLanguageError";
  }
}

export function assertGovernanceLanguage(text: string, label = "text"): void {
  const lower = text.toLowerCase();
  for (const term of FORBIDDEN_VOCABULARY) {
    const idx = lower.indexOf(term);
    if (idx !== -1) {
      throw new GovernanceLanguageError(term, `${label}: "${text}"`);
    }
  }
}

export function assertAllGovernanceLanguage(texts: string[]): void {
  for (const t of texts) assertGovernanceLanguage(t);
}

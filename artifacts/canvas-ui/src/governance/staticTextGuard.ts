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

// Phase 3 (PH3-HC4 / PH3-HC5 / PH3-HC6) extends the SIGNALS vocabulary
// with a responsibility-lens-specific tier for the Cross-Functional
// Responsibility Lens rendered inside the Decision Exposure View. The
// lens describes where responsibility pressure resides; it must reject
// every wording that could be read as ownership assignment, obligation,
// severity, priority, or remediation framing.
//
// RESPONSIBILITY_LENS_FORBIDDEN is a strict superset of SIGNALS_FORBIDDEN.
// It is a SIBLING tier of EXPOSURE_NARRATIVE_FORBIDDEN and of
// REFLECTIVE_FORBIDDEN: each layers its own additional bans on top of
// the shared SIGNALS base, and none is a strict superset of either of
// the others.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ RESPONSIBILITY_LENS
//           PORTFOLIO ⊂ SIGNALS ⊂ EXPOSURE_NARRATIVE
//           PORTFOLIO ⊂ SIGNALS ⊂ REFLECTIVE
//
// Carve-out notes for substring matching:
//   - "lead": would also match "leadership". The Phase 3 surface
//     intentionally never uses leadership language, so this is fine
//     for our texts. If an upstream label ever contains "leadership",
//     it must be renamed at the source rather than carved out here.
//   - "low": would also match "below" and "follow"/"following". Phase 3
//     texts intentionally avoid both. Same renaming rule applies if a
//     consumer label ever introduces those words.
//   - "high": would match "highest" and "highlight". Phase 3 texts
//     intentionally avoid both. Same renaming rule.
//   - "owner": would match "ownership". The Phase 3 prefix sentence
//     deliberately uses the negated phrase "does not assign ownership",
//     so it cannot pass the substring scan and is instead checked by
//     spec-equality at module load (mirroring the Phase 1 banner and
//     Phase 2 framing-boundary exemption pattern). Every other Phase 3
//     string passes this guard normally.
export const RESPONSIBILITY_LENS_FORBIDDEN = [
  ...SIGNALS_FORBIDDEN,
  "owner",
  "responsible",
  "accountable",
  "ensure",
  "must",
  "required",
  "primary",
  "secondary",
  "lead",
  "escalation",
  "address",
  "high",
  "low",
  "critical",
  "significant",
  "major",
  "minor",
  "urgent",
];

export function assertResponsibilityLensLanguage(text: string): void {
  checkAgainst(text, RESPONSIBILITY_LENS_FORBIDDEN);
}

export function assertAllResponsibilityLensLanguage(texts: string[]): void {
  for (const t of texts) assertResponsibilityLensLanguage(t);
}

// Phase 4 (PH4-HC5 / PH4-HC6) extends the SIGNALS vocabulary with the
// strictest tier in the system. Phase 4 — Scenario-Conditioned Reading
// renders contextual qualifier phrases ("persists", "broadens",
// "becomes more continuous", etc.) attached to existing Phase 1/2/3
// elements; under no lens may any qualifier, selector label, helper
// sentence, or empty-state sentence imply prediction, probability,
// severity, comparison, urgency, or remediation.
//
// SCENARIO_READING_FORBIDDEN is a STRICT SUPERSET of all three sibling
// upper tiers (RESPONSIBILITY_LENS_FORBIDDEN, EXPOSURE_NARRATIVE_FORBIDDEN,
// REFLECTIVE_FORBIDDEN), unioned with the Phase 4-specific bans
// (predict / forecast / probability / likelihood / worst / best /
// severe / escalate / urgent). Because every higher tier is a strict
// superset of SIGNALS_FORBIDDEN, taking the union of the three sibling
// tiers also covers SIGNALS_FORBIDDEN and PORTFOLIO_FORBIDDEN
// transitively.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ {REFLECTIVE, EXPOSURE_NARRATIVE,
//                                  RESPONSIBILITY_LENS} ⊂ SCENARIO_READING
//
// Carve-out notes for substring matching (Phase 4 surface):
//   - "best" matches "bestow", "asbestos". Phase 4 surface
//     intentionally avoids both. Same renaming rule as the other
//     tiers if a consumer label ever introduces those words.
//   - "worst" has no common embedding in neutral English; safe.
//   - "lead" / "high" / "low" / "owner" / "address" carve-outs from
//     RESPONSIBILITY_LENS_FORBIDDEN apply transitively. Phase 4
//     qualifier phrases ("persists", "broadens", "concentrates",
//     "becomes more continuous", "remains episodic", "becomes more
//     distributed") deliberately avoid every embedding above.
//   - "must" carve-out from EXPOSURE_NARRATIVE_FORBIDDEN applies
//     transitively. Phase 4 surface contains no "must"-bearing word.
function dedup(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
export const SCENARIO_READING_FORBIDDEN = dedup([
  ...RESPONSIBILITY_LENS_FORBIDDEN,
  ...EXPOSURE_NARRATIVE_FORBIDDEN,
  ...REFLECTIVE_FORBIDDEN,
  "predict",
  "forecast",
  "probability",
  "likelihood",
  "worst",
  "best",
  "severe",
  "escalate",
  "urgent",
]);

export function assertScenarioReadingLanguage(text: string): void {
  checkAgainst(text, SCENARIO_READING_FORBIDDEN);
}

export function assertAllScenarioReadingLanguage(texts: string[]): void {
  for (const t of texts) assertScenarioReadingLanguage(t);
}

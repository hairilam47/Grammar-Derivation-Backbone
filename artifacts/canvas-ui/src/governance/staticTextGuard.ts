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

// Phase 5 (PH5-HC4 / PH5-HC5 / PH5-HC6) extends SCENARIO_READING with
// the strictest tier in the system. Phase 5 — Decision Re-Entry Lens
// signals when reconsideration of a decision becomes procedurally
// legitimate, and must reject every wording that could be read as
// recommending change, prescribing action, asserting urgency, or
// judging correctness.
//
// DECISION_REENTRY_FORBIDDEN is a STRICT SUPERSET of
// SCENARIO_READING_FORBIDDEN (which is itself a strict superset of
// every preceding tier), unioned with the Phase 5-specific bans
// (fix, change, update, revise, rework, should, must, need, urgent,
// critical, failed, overdue). Several of these are already present
// in lower tiers (should, must, urgent, critical, fix); the union
// is taken anyway for documentary clarity and to make the dedup
// behaviour explicit.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ {REFLECTIVE, EXPOSURE_NARRATIVE,
//                                  RESPONSIBILITY_LENS} ⊂
//           SCENARIO_READING ⊂ DECISION_REENTRY
//
// Carve-out notes for substring matching (Phase 5 surface):
//   - "change" matches "exchange", "unchanged", "changes". Phase 5
//     surface intentionally avoids every embedding above. The
//     interpretive prefix sentence DOES contain the bare word
//     "change" (in the negated phrase "does not recommend or
//     initiate change") and DOES contain "recommend" (already in
//     PORTFOLIO_FORBIDDEN). The prefix is therefore exempted from
//     the substring scan and verified by spec-equality at module
//     load (mirroring the Phase 1 banner / Phase 2 framing-boundary /
//     Phase 3 prefix exemption pattern).
//   - "update" matches "updated", "outdated". Phase 5 surface
//     intentionally avoids both.
//   - "need" matches "needed", "needs", "needless". Phase 5 surface
//     intentionally avoids all three.
//   - "fix" matches "prefix", "suffix", "fixture". Phase 5 surface
//     intentionally avoids all three. (Carve-out also applies
//     transitively from SIGNALS_FORBIDDEN.)
//   - "revise", "rework", "overdue", "failed" have no common
//     embedding in neutral English; safe.
//   - All transitive carve-outs from lower tiers (lead/high/low/
//     owner/address/best/must) apply unchanged.
export const DECISION_REENTRY_FORBIDDEN = dedup([
  ...SCENARIO_READING_FORBIDDEN,
  "fix",
  "change",
  "update",
  "revise",
  "rework",
  "should",
  "must",
  "need",
  "urgent",
  "critical",
  "failed",
  "overdue",
]);

export function assertDecisionReentryLanguage(text: string): void {
  checkAgainst(text, DECISION_REENTRY_FORBIDDEN);
}

export function assertAllDecisionReentryLanguage(texts: string[]): void {
  for (const t of texts) assertDecisionReentryLanguage(t);
}

// Phase 6 (PH6-HC4) extends SCENARIO_READING with a constitutional /
// containment-specific tier for the TOGAF / ArchiMate Constitutional
// Layer. Phase 6 surface text describes only what ADC artefacts must
// NOT do (mandate, justify, trigger, score/rank, sequence/prioritise,
// evaluate, enforce). Every label, helper sentence, table rationale,
// and re-anchoring sentence is checked against this tier at module
// load.
//
// TOGAF_CONTAINMENT_FORBIDDEN is a STRICT SUPERSET of
// SCENARIO_READING_FORBIDDEN. It is a SIBLING of
// DECISION_REENTRY_FORBIDDEN: each layer extends SCENARIO_READING in
// its own direction. Phase 5 forbids change-vocabulary
// (fix/change/update/revise/rework, etc.); Phase 6 forbids
// authority-vocabulary (mandate/justify/trigger/score/rank/sequence/
// prioritise/evaluate/enforce). Neither is a superset of the other
// and they are not interchangeable. Phase 6's surface deliberately
// uses the bare word "change" inside the verbatim mandatory
// non-authority disclaimer (which negates it), so adding "change" to
// Phase 6 would force a second exemption with no governance benefit.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ {REFLECTIVE, EXPOSURE_NARRATIVE,
//                                  RESPONSIBILITY_LENS} ⊂
//           SCENARIO_READING ⊂ {DECISION_REENTRY, TOGAF_CONTAINMENT}
//
// Carve-out notes for substring matching (Phase 6 surface):
//   - "mandate" matches "mandates", "mandated", but NOT "mandatory"
//     (which ends in "-ory" rather than "-e"). Phase 6 surface uses
//     "mandatory" (in the disclaimer label) deliberately and that
//     passes the scan.
//   - "justify" matches "justified", "justifying", but NOT
//     "justifies" (which ends in "-ifies" not "-ify"). Phase 6
//     surface intentionally uses neither.
//   - "trigger" matches "triggered", "triggering", "triggers".
//     Phase 6 surface intentionally avoids all four.
//   - "score" matches "scored", "scoring", "scores", "scoreboard".
//     Phase 6 surface intentionally avoids all five.
//   - "rank" matches "ranked", "ranking", "ranks". Phase 6 surface
//     intentionally avoids all four.
//   - "sequence" matches "sequenced", "sequencing", "sequences".
//     Phase 6 surface intentionally avoids all four.
//   - "prioritise" / "prioritize" match their inflected forms;
//     Phase 6 surface intentionally avoids both.
//   - "evaluate" matches "evaluated", but NOT "evaluation"
//     (which ends in "-ation" rather than retaining the trailing "e")
//     and NOT "evaluating" (same reason). Phase 6 surface
//     intentionally avoids every "evaluate"-rooted word regardless;
//     callers that need to discuss assessment activity should use
//     the verb "assess" or the noun "assessment", neither of which
//     embeds the banned root.
//   - "enforce" matches "enforced", "enforcement". Phase 6 surface
//     intentionally avoids both.
//   - The verbatim mandatory non-authority disclaimer DOES contain
//     the bare words "mandate" and "justify" (in the negated phrase
//     "does not mandate action, justify change"). The disclaimer is
//     therefore exempted from this substring scan and verified by
//     spec-equality at module load inside `togafContainment.ts`,
//     mirroring the Phase 1 banner / Phase 5 prefix exemption pattern.
export const TOGAF_CONTAINMENT_FORBIDDEN = dedup([
  ...SCENARIO_READING_FORBIDDEN,
  "mandate",
  "justify",
  "trigger",
  "score",
  "rank",
  "sequence",
  "prioritise",
  "prioritize",
  "evaluate",
  "enforce",
]);

export function assertTogafContainmentLanguage(text: string): void {
  checkAgainst(text, TOGAF_CONTAINMENT_FORBIDDEN);
}

export function assertAllTogafContainmentLanguage(texts: string[]): void {
  for (const t of texts) assertTogafContainmentLanguage(t);
}

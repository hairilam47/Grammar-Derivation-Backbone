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

// ACW Workspace Builder — placeholder-first vocabulary tier.
//
// The Architecture Composition Workspace (ACW) is an empty
// scaffolding layer (per its brief: "you are building an empty
// architectural workspace, not architecture"). Every static label
// rendered by an ACW view, container, or canvas primitive is asserted
// against this tier at module load.
//
// ACW_PLACEHOLDER_FORBIDDEN is a STRICT SUPERSET of
// TOGAF_CONTAINMENT_FORBIDDEN. The brief names four words that must
// be banned from ACW surface text — `optimise`, `recommend`,
// `target`, `best`. Three of those (`optimise`/`optimize`, `target`,
// `best`) are already present transitively via the
// REFLECTIVE / SCENARIO_READING chain, and `recommend` /
// `recommended` are present from PORTFOLIO_FORBIDDEN; restating them
// explicitly here makes the brief's ban literal at the source level
// and documents the layering for future readers. The dedup() pass
// keeps the surface tier identical to its theoretical union.
//
// Layering: ... ⊂ SCENARIO_READING ⊂ TOGAF_CONTAINMENT ⊂
//           ACW_PLACEHOLDER
//
// Carve-out notes for substring matching (ACW surface):
//   - "best" already carries the same carve-out documented in
//     SCENARIO_READING_FORBIDDEN (matches "bestow", "asbestos");
//     ACW surface text intentionally avoids both.
//   - "target" matches "targeted", "targets". ACW surface text
//     intentionally avoids both. Same renaming rule applies if a
//     consumer label ever introduces those words.
//   - "recommend" matches "recommendation", "recommended",
//     "recommends". ACW surface text intentionally avoids all
//     embeddings.
//   - All transitive carve-outs from lower tiers (mandate / justify /
//     trigger / score / rank / sequence / prioritise / evaluate /
//     enforce / lead / high / low / owner / address / must) apply
//     unchanged. ACW surface text uses generic structural nouns
//     (`Domain`, `System`, `Connection`, `Zone`, `Interface`) and
//     neutral instructional empty-state copy only.
export const ACW_PLACEHOLDER_FORBIDDEN = dedup([
  ...TOGAF_CONTAINMENT_FORBIDDEN,
  "optimise",
  "optimize",
  "recommend",
  "recommended",
  "target",
  "best",
]);

export function assertAcwPlaceholderLanguage(text: string): void {
  checkAgainst(text, ACW_PLACEHOLDER_FORBIDDEN);
}

export function assertAllAcwPlaceholderLanguage(texts: string[]): void {
  for (const t of texts) assertAcwPlaceholderLanguage(t);
}

// CTAD — Conceptual Technology Architecture Design module.
//
// CTAD is an interpretive, reversible technology exploration plane.
// It must never frame any selection as approval, recommendation,
// scoring, ranking, or finality. Every static label, helper
// sentence, parameter name, and option string rendered by a CTAD
// module file is asserted against this tier at module load.
//
// CTAD_FORBIDDEN is a STANDALONE sibling tier — it is not derived
// from PORTFOLIO/SIGNALS/REFLECTIVE/etc. because CTAD's surface
// concern is non-authoritative exploration, not the
// descriptive-only governance reading of the other tiers. The
// token list is taken verbatim from the CTAD brief.
//
// Carve-out notes for substring matching (CTAD surface):
//   - "approve" matches "approval", "approving". The CTAD entry
//     page intentionally renders the binding-prerequisite message
//     "CTAD requires an approved architectural decision." verbatim
//     from the brief. That single string is exempted from the
//     substring scan and verified by spec-equality at module load
//     in the entry page (mirroring the Phase 1 banner / Phase 5
//     prefix exemption pattern). Every other CTAD string passes
//     this guard normally and uses the neutral label "Decision
//     authority" rather than "Approving authority".
//   - "best" matches "bestow", "asbestos". CTAD surface
//     intentionally avoids both.
//   - "must" matches "mustard". CTAD surface intentionally
//     avoids both.
//   - "score" matches "underscore", "scoreboard". CTAD surface
//     intentionally avoids both.
//   - "final" matches "finally", "finalise". CTAD surface
//     intentionally avoids both.
//   - "rank" matches "ranking", "ranked". CTAD surface
//     intentionally avoids both.
export const CTAD_FORBIDDEN = [
  "approve",
  "approved",
  "confirm",
  "recommend",
  "recommended",
  "best",
  "optimal",
  "optimise",
  "optimize",
  "final",
  "score",
  "ranked",
  "ranking",
  "mandate",
  "justify",
  "enforce",
  "must",
];

export function assertCtadLanguage(text: string): void {
  checkAgainst(text, CTAD_FORBIDDEN);
}

export function assertAllCtadLanguage(texts: string[]): void {
  for (const t of texts) assertCtadLanguage(t);
}

// ACW Track 3 — Derived Structural Visualisation vocabulary tier.
//
// Track 3 mechanically derives a structural diagram from a CTAD
// binding's CTAD_STATE plus a small projection of ADC bounds. It
// must never frame any element as judgement, recommendation,
// scoring, ranking, urgency, or workflow. Every static label,
// hint, control caption, and label-registry string rendered by a
// Track 3 module file is asserted against this tier at module load.
//
// ACW_TRACK3_FORBIDDEN is a STANDALONE sibling tier — it is not
// derived from the ACW placeholder tier or the CTAD tier. Track 3
// surface concerns are: never imply judgement (priority/risk/
// severity/score/weight/urgency/importance/health/maturity/
// correctness), never imply traffic-light health (warning/danger/
// critical), never imply recommendation or finality (recommend/
// best/optimal/optimise/optimize/validated/approved/final), never
// imply prescription (must/should/submit), never imply ranking
// (rank/ranked/ranking).
//
// Carve-out notes for substring matching (Track 3 surface):
//   - "approve" matches "approval"/"approved"/"approving". Track 3
//     surface text intentionally avoids every embedding.
//   - "recommend" matches "recommendation"/"recommended"/
//     "recommends". Track 3 surface intentionally avoids all.
//   - "best" matches "bestow"/"asbestos". Track 3 surface
//     intentionally avoids both.
//   - "must" matches "mustard". Track 3 surface intentionally
//     avoids it.
//   - "score" matches "underscore"/"scoreboard". Track 3 surface
//     intentionally avoids both.
//   - "rank" matches "ranking"/"ranked"/"ranks". Track 3 surface
//     intentionally avoids all.
//   - "final" matches "finally"/"finalise". Track 3 surface
//     intentionally avoids both.
//   - "weight" matches "weighted"/"weighting"/"weights". Track 3
//     surface intentionally avoids all.
//   - "warning"/"danger"/"critical" — Track 3 surface uses neutral
//     hex palette only and never says "danger"/"warning"/"critical".
export const ACW_TRACK3_FORBIDDEN = [
  "approve",
  "recommend",
  "best",
  "optimal",
  "optimise",
  "optimize",
  "optimised",
  "optimized",
  "validated",
  "validate",
  "priority",
  "risk",
  "severity",
  "score",
  "weight",
  "urgency",
  "importance",
  "health",
  "maturity",
  "correctness",
  "warning",
  "danger",
  "critical",
  "must",
  "should",
  "submit",
  "rank",
  "final",
];

export function assertAcwTrack3Language(text: string): void {
  checkAgainst(text, ACW_TRACK3_FORBIDDEN);
}

export function assertAllAcwTrack3Language(texts: string[]): void {
  for (const t of texts) assertAcwTrack3Language(t);
}

// Stage A (ADC Wizard Retrofit) — Urgency-vocabulary tier.
//
// The ADC Wizard's Requirements Capture surface uses an Urgency-
// centric vocabulary instead of the conventional Severity / Priority
// framing common in issue trackers. The internal urgency enum
// (`'low' | 'medium' | 'high' | 'critical'`) is never user-visible;
// the UI displays the Urgency labels Routine / Standard / Elevated /
// Acute. Every static label rendered by the Modules screen, the
// Requirements Capture screen, and the Freeze screen is asserted
// against this tier at module load.
//
// URGENCY_FORBIDDEN is a SIBLING tier of REFLECTIVE / EXPOSURE_NARRATIVE
// / RESPONSIBILITY_LENS — it extends SIGNALS with the additional bans
// that protect the Urgency-centric framing. SIGNALS already bans
// "priority"; this tier additionally bans "severity", "criticality",
// "asap", and "blocker" — phrasings that would creep the surface
// back toward the rejected Severity / Priority vocabulary.
//
// Layering: PORTFOLIO ⊂ SIGNALS ⊂ URGENCY
//
// Carve-out notes for substring matching (Urgency surface):
//   - "urgent" is INTENTIONALLY NOT banned in this tier. Banning the
//     bare word "urgent" would also reject the noun "Urgency" itself
//     (which contains "urgen" + "cy"), making the Urgency tier
//     unable to validate the very label it exists to protect. Higher
//     tiers (SCENARIO_READING, REFLECTIVE, DECISION_REENTRY) ban
//     "urgent" via their own rules; the Urgency tier is a
//     deliberately shorter sibling that only bans the alternative-
//     framing terms.
//   - "critical" is INTENTIONALLY NOT banned in this tier for the
//     same reason — the internal enum value `'critical'` is never
//     rendered (the UI shows "Acute"), but a future label like
//     "Critical-path requirement" would otherwise be rejected.
//     Higher tiers continue to ban "critical" wherever it would
//     appear in user-facing copy outside the Urgency surface.
//   - "blocker" / "asap" have no common embedding in neutral English
//     and are safe to ban literally.
//   - "severity" and "criticality" similarly have no common
//     embedding in neutral English; safe.
export const URGENCY_FORBIDDEN = dedup([
  ...SIGNALS_FORBIDDEN,
  "severity",
  "criticality",
  "asap",
  "blocker",
]);

export function assertUrgencyLanguage(text: string): void {
  checkAgainst(text, URGENCY_FORBIDDEN);
}

export function assertAllUrgencyLanguage(texts: readonly string[]): void {
  for (const t of texts) assertUrgencyLanguage(t);
}

// Phase 2 (SaaS Onboarding) — Onboarding-vocabulary tier.
//
// The onboarding surface (OrgSelector, NewOrgDialog, WorkItemDashboard,
// NewWorkItemDialog, WorkspaceHub, and the AppShell scope switcher)
// is META — it lets an architect pick which Organisation and Work
// Item they will then operate inside. It does not author any
// architectural artefact, render a governance reading, or imply
// ranking, judgement, or recommendation about the orgs or work
// items it lists. Every static label rendered by the new
// onboarding modules is asserted against this tier at module load.
//
// ONBOARDING_FORBIDDEN is a SIBLING tier of REFLECTIVE /
// EXPOSURE_NARRATIVE / RESPONSIBILITY_LENS / URGENCY — it extends
// SIGNALS with the additional bans that protect the descriptive,
// non-prescriptive posture of the onboarding surface. The tier is
// extended from TOGAF_CONTAINMENT (which itself extends
// SCENARIO_READING) so onboarding text inherits every authority
// vocabulary ban already enforced inside the constitutional layer.
//
// Layering: ... ⊂ SCENARIO_READING ⊂ TOGAF_CONTAINMENT ⊂
//           ONBOARDING
//
// Carve-out notes for substring matching (Onboarding surface):
//   - All transitive carve-outs from lower tiers (best/must/lead/
//     low/high/owner/address/recommend/optimise/target) apply
//     unchanged. Onboarding labels deliberately use neutral nouns
//     (Organisation, Sector, Nature of business, Work Item, EA
//     Blueprint, Project, Enhancement, Change Request) and neutral
//     verbs (Create, Open, Switch, Continue) only.
//   - The literal label "Change Request" contains the bare word
//     "change", which is NOT banned in TOGAF_CONTAINMENT (the
//     constitutional layer chose to keep "change" available so the
//     mandatory non-authority disclaimer can negate it). The
//     onboarding tier preserves that decision so the Work-Item
//     type label "Change Request" passes the substring scan.
export const ONBOARDING_FORBIDDEN = dedup([
  ...TOGAF_CONTAINMENT_FORBIDDEN,
]);

export function assertOnboardingLanguage(text: string): void {
  checkAgainst(text, ONBOARDING_FORBIDDEN);
}

export function assertAllOnboardingLanguage(texts: readonly string[]): void {
  for (const t of texts) assertOnboardingLanguage(t);
}

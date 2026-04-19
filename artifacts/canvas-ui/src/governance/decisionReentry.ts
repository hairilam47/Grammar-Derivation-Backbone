import type { PortfolioEntry } from "./portfolioStore";
import type { ExposurePayload } from "./exposureDerive";
import type { ExposureNarratives } from "./exposureNarratives";
import type { ResponsibilityLens } from "./responsibilityLens";
import {
  assertAllDecisionReentryLanguage,
  assertDecisionReentryLanguage,
} from "./staticTextGuard";

// Phase 5 — Decision Re-Entry Lens.
//
// Pure derivation. Signals when reconsideration of an approved
// decision becomes procedurally legitimate. The lens makes no
// statement about correctness, urgency, or the architectural quality
// of the underlying decision; it only describes whether the lifecycle
// markers carried by the decision itself, plus the divergence between
// approval-time-frozen markers and the current live derivation, have
// crossed thresholds at which re-entering the decision is procedurally
// appropriate.
//
// Hard constraints:
//   PH5-HC1  Read-only. The deriver returns a value; it never writes
//            to localStorage, network, or any side-effecting surface.
//   PH5-HC2  Single-decision. The deriver accepts one PortfolioEntry
//            and one set of derived phase outputs. It never accepts
//            a list of decisions and never compares decisions to
//            each other.
//   PH5-HC3  Derived only from durable inputs. Inputs are limited to
//            the entry, the live Phase 1 ExposurePayload, the live
//            Phase 2 ExposureNarratives, the live Phase 3
//            ResponsibilityLens, and a "now" Date. The deriver does
//            NOT consume the Phase 4 scenario lens state, runtime
//            telemetry, viewing history, incident data, or external
//            feeds.
//   PH5-HC4  Closed sentence set. Output strings are drawn EXACTLY
//            from REENTRY_SIGNAL; the deriver never templates a
//            sentence at runtime.
//   PH5-HC5  No prescription. Vocabulary is gated by the strictest
//            tier in the system (DECISION_REENTRY_FORBIDDEN) at
//            module load AND at every emission boundary.
//   PH5-HC6  Strictly removable. Removing this module and the
//            DecisionReentrySection in pages/Exposure.tsx restores
//            exact Phase 4 behaviour with no other change.
//   PH5-HC7  Human-initiated. Phase 5 produces no automatic
//            transitions and no calls to the freeze flow, the
//            wizard, or the signals store. Whether to act on a
//            signal is left entirely to the reader.

// ---------------------------------------------------------------------------
// Spec-locked surface strings
// ---------------------------------------------------------------------------

// Section heading (UI label).
export const REENTRY_HEADING = "Legitimate Re-Entry";

// Interpretive prefix sentence. Verbatim per the Phase 5 spec.
//
// EXEMPTION: this sentence intentionally contains the bare words
// "change" and "recommend" inside a NEGATING phrase ("does not
// recommend or initiate change"). The substring guard cannot
// distinguish negated usage from a leak, so the prefix is verified
// by spec-equality below instead of being scanned. This mirrors the
// Phase 1 banner / Phase 2 framing-boundary / Phase 3 prefix
// exemption pattern.
export const REENTRY_PREFIX =
  "This section indicates when reconsideration of a decision may be procedurally legitimate. It does not recommend or initiate change.";

const REENTRY_PREFIX_SPEC =
  "This section indicates when reconsideration of a decision may be procedurally legitimate. It does not recommend or initiate change.";
if (REENTRY_PREFIX !== REENTRY_PREFIX_SPEC) {
  throw new Error(
    "Decision Re-Entry prefix sentence has drifted from the Phase 5 spec wording.",
  );
}

// Empty-state sentence. Verbatim per the Phase 5 spec. Passes the
// substring guard cleanly (no exempt vocabulary).
export const REENTRY_EMPTY =
  "No procedural conditions for reconsideration are currently evident.";

// Closed signal sentence set. Each member is a present-indicative
// observation. No verbs of recommendation, urgency, prescription,
// or correctness appear in any sentence (PH5-HC4 / PH5-HC5).
export const REENTRY_SIGNAL = {
  PLANNED_LIFESPAN_REACHED:
    "The elapsed time since approval has reached the decision's originally expected lifespan.",
  PLANNED_LIFESPAN_MIDPOINT:
    "The elapsed time since approval has crossed the midpoint of the decision's originally expected lifespan.",
  RESPONSIBILITY_PRESSURE_SHIFT:
    "Responsibility pressure now appears in organisational functions that were not part of the approval-time profile.",
  EXPOSURE_SCOPE_BREADTH:
    "Currently-derived exposure spans organisational functions beyond the approval-time profile.",
} as const;

export type ReEntrySignalId = keyof typeof REENTRY_SIGNAL;

// Fixed render order. Lifespan signals first (mutually exclusive
// pair), then responsibility-shift, then scope-breadth. Stable
// order is part of the rendered surface contract.
const REENTRY_SIGNAL_ORDER: readonly ReEntrySignalId[] = [
  "PLANNED_LIFESPAN_REACHED",
  "PLANNED_LIFESPAN_MIDPOINT",
  "RESPONSIBILITY_PRESSURE_SHIFT",
  "EXPOSURE_SCOPE_BREADTH",
];

const REENTRY_SIGNAL_SENTENCES: readonly string[] = Object.values(
  REENTRY_SIGNAL,
);

// Module-load guard: every closed-set sentence and every UI label
// owned by this module passes the strictest tier. The interpretive
// prefix is verified by spec-equality above and intentionally NOT
// scanned here.
assertAllDecisionReentryLanguage([
  REENTRY_HEADING,
  REENTRY_EMPTY,
  ...REENTRY_SIGNAL_SENTENCES,
]);

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

function elapsedYears(decisionDate: string, now: Date): number {
  const then = new Date(decisionDate).getTime();
  if (Number.isNaN(then)) return 0;
  const ms = now.getTime() - then;
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 3600 * 1000);
}

// Set difference helper: items in `current` not present in `approval`.
// Both inputs are read-only string arrays; case-sensitive comparison
// is correct because every name is drawn from a fixed lookup table
// (see exposureDerive.ts and responsibilityLens.ts).
function hasNovelMembers(
  current: readonly string[],
  approval: readonly string[],
): boolean {
  if (current.length === 0) return false;
  const known = new Set(approval);
  for (const name of current) {
    if (!known.has(name)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public deriver
// ---------------------------------------------------------------------------

// Inputs cover every available durable Phase 1–3 output, even where a
// given rule does not consume an input today. The signature is part
// of the Phase 5 contract: extensions must have access to the full
// approval-time-vs-current evidence set, and the explicit shape
// keeps callers honest about what Phase 5 is allowed to read.
//
// `narratives` is presently unused by any rule because the Phase 2
// narrative paragraphs are assembled FROM the Phase 1 payload using
// the entry's frozen inputs — they cannot diverge from `payload` on
// their own. The parameter is kept in the signature so a future
// rule that examines, e.g., a structural narrative-clause activation
// shift will be able to consume it without a downstream API change.
export function deriveReEntrySignals(
  entry: PortfolioEntry,
  payload: ExposurePayload,
  narratives: ExposureNarratives | null,
  responsibilityLens: ResponsibilityLens,
  now: Date,
): readonly string[] {
  // Touch `narratives` to keep TypeScript / linters from flagging it
  // as unused. Phase 5 rules consume it once the relevant signals
  // are added.
  void narratives;

  const fired = new Set<ReEntrySignalId>();

  // ---------------------------------------------------------------
  // Lifespan rules (mutually exclusive). Defensive: if the lifespan
  // field is missing, malformed, or non-positive, no age-based
  // signal can fire. Same applies to a malformed decisionDate.
  // ---------------------------------------------------------------
  const expected = entry.organisationContext.expectedLifespanYears;
  if (
    typeof expected === "number" &&
    Number.isFinite(expected) &&
    expected > 0
  ) {
    const elapsed = elapsedYears(entry.decisionDate, now);
    if (elapsed >= expected) {
      fired.add("PLANNED_LIFESPAN_REACHED");
    } else if (elapsed >= expected / 2) {
      fired.add("PLANNED_LIFESPAN_MIDPOINT");
    }
  }

  // ---------------------------------------------------------------
  // Responsibility-pressure-shift rule. Compares the live
  // responsibility lens row set against the approval-time snapshot
  // frozen onto the entry. A novel function name in the live lens
  // means responsibility pressure has materialised in functions
  // that were not part of the approval-time profile — a
  // procedurally legitimate ground for re-entry.
  //
  // For decisions frozen before Phase 5 shipped, the snapshot is an
  // empty array (see withDefaults). To avoid retroactively flagging
  // every legacy decision, the rule is suppressed when the snapshot
  // is empty AND the live lens is non-empty (the empty snapshot is
  // the absence of evidence, not evidence of shift).
  // ---------------------------------------------------------------
  const liveDominantFunctions = responsibilityLens.map((r) => r.functionName);
  if (
    entry.approvalDominantFunctions.length > 0 &&
    hasNovelMembers(liveDominantFunctions, entry.approvalDominantFunctions)
  ) {
    fired.add("RESPONSIBILITY_PRESSURE_SHIFT");
  }

  // ---------------------------------------------------------------
  // Exposure-scope-breadth rule. Compares the live Phase 1
  // functionsAffected list against the approval-time snapshot. A
  // novel function in the live payload means current derivation
  // identifies organisational functions outside the approval-time
  // profile. Same legacy-suppression rule as above.
  // ---------------------------------------------------------------
  if (
    entry.approvalFunctionsAffected.length > 0 &&
    hasNovelMembers(payload.functionsAffected, entry.approvalFunctionsAffected)
  ) {
    fired.add("EXPOSURE_SCOPE_BREADTH");
  }

  // ---------------------------------------------------------------
  // Emit in fixed order with emission-boundary re-assertion.
  // ---------------------------------------------------------------
  const out: string[] = [];
  for (const id of REENTRY_SIGNAL_ORDER) {
    if (!fired.has(id)) continue;
    const sentence = REENTRY_SIGNAL[id];
    assertDecisionReentryLanguage(sentence);
    out.push(sentence);
  }
  return out;
}

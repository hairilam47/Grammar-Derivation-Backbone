import type { PortfolioEntry } from "./portfolioStore";
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
// markers carried by the decision itself have crossed thresholds at
// which re-entering the decision is procedurally appropriate.
//
// Hard constraints:
//   PH5-HC1  Read-only. The deriver returns a value; it never writes
//            to localStorage, network, or any side-effecting surface.
//   PH5-HC2  Single-decision. The deriver accepts one PortfolioEntry
//            and a "now" timestamp. It never accepts a list of
//            decisions and never compares decisions.
//   PH5-HC3  Derived only. Inputs are limited to durable fields on
//            the entry (decisionDate, organisationContext) plus a
//            "now" parameter. The deriver does NOT consume Phase 4
//            scenario lens state, runtime telemetry, viewing
//            history, incident data, or external feeds. The
//            available Phase 1/2/3 outputs are deliberately not
//            consumed by current rules — see "Dormant rules" below.
//   PH5-HC4  Closed sentence set. Output strings are drawn EXACTLY
//            from REENTRY_SIGNAL_SENTENCES; the deriver never
//            templates a sentence at runtime.
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

// Spec-locked surface strings owned by this module.

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
// observation about the decision's lifecycle markers. No verbs of
// recommendation, urgency, prescription, or correctness appear in
// any sentence (PH5-HC4 / PH5-HC5).
export const REENTRY_SIGNAL = {
  PLANNED_LIFESPAN_REACHED:
    "The elapsed time since approval has reached the decision's originally expected lifespan.",
  PLANNED_LIFESPAN_MIDPOINT:
    "The elapsed time since approval has crossed the midpoint of the decision's originally expected lifespan.",
} as const;

export type ReEntrySignalId = keyof typeof REENTRY_SIGNAL;

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
// Derivation
// ---------------------------------------------------------------------------

// One signal type fires at most. The two thresholds are mutually
// exclusive in render order: the more inclusive observation
// (PLANNED_LIFESPAN_REACHED) subsumes the midpoint observation, so
// we emit the strongest single sentence rather than both. Doing so
// keeps the signal set small (PH5-HC4) and preserves the lens's
// single-statement reading discipline.
//
// Dormant rules (documented for parity with the Phase 1 / Phase 4
// dormant-rule pattern):
//
//   - "Responsibility pressure now appears in functions that were
//     not approval-time dominant" — would require an approval-time
//     dominant-function field on the PortfolioEntry. The current
//     allow-list (15 fields, see portfolioStore.ts) does not carry
//     one, and inventing a heuristic proxy at read time would
//     violate PH5-HC3 (derived-only from durable inputs).
//
//   - "Currently-derived exposure spans contexts beyond the original
//     approval scope" — would require a delta between approval-time
//     and current-time exposure. The PortfolioEntry IS the
//     freeze-time snapshot; deriving the current ExposurePayload
//     from that same snapshot can never produce a delta. Recording
//     a runtime use-context separately would also violate PH5-HC3.
//
//   - "The decision is repeatedly viewed under non-baseline Phase 4
//     lenses" — would require viewing telemetry, which is forbidden
//     by PH5-HC3 (no runtime metrics).
//
// These rules will become implementable when the upstream schema
// records the necessary lifecycle metadata. Until then they are
// deliberately silent — the lens stays empty rather than fabricate
// signals from data the system does not have.

function elapsedYears(decisionDate: string, now: Date): number {
  const then = new Date(decisionDate).getTime();
  if (Number.isNaN(then)) return 0;
  const ms = now.getTime() - then;
  if (ms <= 0) return 0;
  return ms / (365.25 * 24 * 3600 * 1000);
}

export function deriveReEntrySignals(
  entry: PortfolioEntry,
  now: Date,
): readonly string[] {
  const expected = entry.organisationContext.expectedLifespanYears;
  // Defensive: if the lifespan field is missing, malformed, or
  // non-positive, no age-based signal can fire.
  if (typeof expected !== "number" || !Number.isFinite(expected) || expected <= 0) {
    return [];
  }
  const elapsed = elapsedYears(entry.decisionDate, now);

  let signal: string | null = null;
  if (elapsed >= expected) {
    signal = REENTRY_SIGNAL.PLANNED_LIFESPAN_REACHED;
  } else if (elapsed >= expected / 2) {
    signal = REENTRY_SIGNAL.PLANNED_LIFESPAN_MIDPOINT;
  }

  if (signal === null) return [];

  // PH5-HC5: re-assert at the emission boundary so any future
  // accidental edit to the closed sentence set is caught even if a
  // module-load guard somehow drifts.
  assertDecisionReentryLanguage(signal);
  return [signal];
}

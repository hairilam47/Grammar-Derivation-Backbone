// Phase 6B — Misuse Playbooks (advisory only).
//
// This module recognises five misuse intents using simple keyword
// substring matching, and exposes a frozen registry of one approved
// re-anchoring sentence per intent. Detection is ADVISORY: callers
// may render the matching correction sentence as a hint, but they
// MUST NOT block, escalate, invalidate input, or persist a violation
// record (PH6-HC5).
//
// The module exposes no `block`, `throw`, `escalate`, `report`, or
// `invalidate` primitive. Removing the page that consumes it and the
// Wizard advisory hint restores Phase 5 behaviour with no other code
// change (PH6-HC7).
import { assertAllTogafContainmentLanguage } from "./staticTextGuard";

export const MISUSE_INTENTS = [
  "MANDATING",
  "JUSTIFYING",
  "EVALUATING",
  "TRIGGERING",
  "NORMALISING",
] as const;
export type MisuseIntent = (typeof MISUSE_INTENTS)[number];

// Detection keywords. Substring (case-insensitive) match is the only
// signal. No scoring, no weighting, no probabilistic interpretation.
// First-match wins in the canonical order above so output is
// deterministic for any given input.
//
// These keywords are detection-side only — they are never rendered to
// the user — and so are not subject to the static-text guard.
const DETECTION_KEYWORDS: Record<MisuseIntent, string[]> = {
  MANDATING: [
    "must ",
    "shall ",
    "have to ",
    "required to",
    "mandatory",
    "compulsory",
    "obliged to",
    "obligated to",
  ],
  JUSTIFYING: [
    "justifies",
    "justify",
    "rationale for",
    "warrants",
    "because of adc",
    "per adc",
    "as per adc",
    "grounds for",
  ],
  EVALUATING: [
    "rate ",
    "rated ",
    "rank ",
    "ranks ",
    "ranked ",
    "score ",
    "scored ",
    "best option",
    "preferred option",
  ],
  TRIGGERING: [
    "trigger ",
    "triggered",
    "kick off",
    "initiate workflow",
    "launch workflow",
    "auto-start",
    "automatically start",
  ],
  NORMALISING: [
    "the standard",
    "as standard",
    "the norm",
    "the default",
    "the baseline for",
    "always the",
    "this is how we",
  ],
};

// Pure, advisory-only classifier. Returns the first matching intent
// in canonical order, or null if none match. Lowercases its input
// once and never throws.
export function detectMisuseIntent(text: string): MisuseIntent | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const lower = text.toLowerCase();
  for (const intent of MISUSE_INTENTS) {
    for (const kw of DETECTION_KEYWORDS[intent]) {
      if (lower.indexOf(kw) !== -1) return intent;
    }
  }
  return null;
}

// Re-anchoring registry. One sentence per intent, frozen at module
// load. Each sentence describes what ADC artefacts do NOT do — it
// never instructs the user to take any specific action.
//
// Wording carefully avoids every token in TOGAF_CONTAINMENT_FORBIDDEN
// (mandate / justify / trigger / score / rank / sequence /
// prioritise / evaluate / enforce, plus the inherited tiers) so the
// load-time guard below succeeds.
export const CORRECTION_LANGUAGE: Readonly<Record<MisuseIntent, string>> =
  Object.freeze({
    MANDATING:
      "This artefact records institutional context; it does not direct what people are obliged to do.",
    JUSTIFYING:
      "This artefact does not provide the basis for funding decisions or delivery ordering.",
    EVALUATING:
      "This artefact does not assess, compare, or judge options.",
    TRIGGERING:
      "This artefact does not initiate processes or set off downstream activity.",
    NORMALISING:
      "This artefact does not establish baselines or institutional defaults to be matched.",
  });

// Module-load guard against the strictest tier. Any future drift in
// a correction sentence that re-introduces a banned token fails the
// build immediately.
assertAllTogafContainmentLanguage(
  MISUSE_INTENTS.map((i) => CORRECTION_LANGUAGE[i]),
);

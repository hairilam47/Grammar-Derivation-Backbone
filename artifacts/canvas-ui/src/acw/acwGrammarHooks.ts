// ACW Workspace Builder — grammar / constraint hook stubs.
//
// Per the brief (section 6 "Grammar & Constraint Hooks"), the
// workspace must expose hooks for:
//   - the ACW canonical structure schema,
//   - forbidden-element checks, and
//   - Phase 6 authority constraints,
// but must NOT implement enforcement logic yet — only placeholders
// and extension points.
//
// This module satisfies that requirement. Each export is a named
// extension-point stub: an empty registry, a no-op predicate, or an
// inert hook function. None of them can be wired into a decision
// pipeline because none of them carries any logic. They exist solely
// so that future ACW phases can attach implementations against a
// stable interface without changing the call sites.
//
// Constitutional guarantees this module preserves:
//   - PH6-HC1: nothing here recommends, mandates, or scores.
//   - PH6-HC2: nothing here serialises ADC data.
//   - PH6-HC6: no override / bypass / force / escalate symbol.
//   - Task #44: empty by default; lens, not step; generic
//     placeholders only.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";

// Canonical structure schema slot. The shape is intentionally an
// empty object so any future canonical schema attaches by replacing
// the value, not by mutating it. Frozen so accidental writes throw.
export const ACW_CANONICAL_STRUCTURE_SCHEMA = Object.freeze({
  slotName: "ACW_CANONICAL_STRUCTURE_SCHEMA",
  status: "placeholder",
  fields: Object.freeze([] as readonly string[]),
});

// Forbidden-element check slot. The empty array is the canonical
// "no checks registered" sentinel. Future ACW phases append rule
// objects; today it returns no findings for any input.
export const ACW_FORBIDDEN_ELEMENT_CHECKS: ReadonlyArray<{
  readonly id: string;
  readonly description: string;
}> = Object.freeze([]);

export function runForbiddenElementChecks(
  _element: unknown,
): ReadonlyArray<string> {
  // No checks registered. Returns the empty list of findings.
  return [];
}

// Phase 6 authority constraint hook slot. The function is a no-op
// pass-through that returns the input unchanged. Future ACW phases
// may attach interpretive helpers here, but the hook itself never
// derives, scores, or refuses; refusals remain the responsibility
// of the Phase 6 constitutional layer (`togafContainment.ts`).
export function applyPhase6AuthorityHook<T>(input: T): T {
  return input;
}

// Static labels exposed by this module. Empty today; the slot exists
// so future hook implementations can register their own labels and
// have them asserted against the strictest tier at module load.
const HOOK_STATIC_LABELS: readonly string[] = [
  "ACW_CANONICAL_STRUCTURE_SCHEMA",
  "placeholder",
];

assertAllAcwPlaceholderLanguage([...HOOK_STATIC_LABELS]);

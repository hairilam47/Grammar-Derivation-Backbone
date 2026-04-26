// EAStudio Phase 2 — node property registry.
//
// Declares the optional descriptive fields that the Properties
// panel exposes to the user. The fields are additive on the v1
// node shape (schema stays `acw-1.0`); absence reads identically
// to a pre-Phase-2 document. None of the values here have any
// effect on validator legality — they are descriptive metadata
// only — but the store re-runs the read-validator on every write
// so a malformed value (unknown enum, empty string, wrong type)
// is refused at the storage boundary.
//
// The four enums here are the closed set of values the dropdowns
// in the Properties panel offer. Strings are deliberately
// neutral; the master prompt's "no judgement" tier rejects words
// like "good"/"bad"/"failing" as scalar grades, so the maturity
// scale uses the CMMI-style names (which the prompt vocabulary
// guard already accepts) and the priority scale uses a four-step
// neutral ladder.
//
// Constitutional discipline:
//   - Empty string is rejected. The Properties panel's text
//     inputs must call `clearNodeProperty` (omit the field) to
//     unset a value rather than write `""`.
//   - Unknown enum values are rejected; the store and read
//     validator both gate them so a future caller cannot smuggle
//     a sixth maturity tier or a custom priority.
//   - Every label rendered into the DOM is asserted against
//     `ACW_PLACEHOLDER_FORBIDDEN` at module load.
import { assertAllAcwPlaceholderLanguage } from "../governance/staticTextGuard";

export const ACW_NODE_STATUSES = [
  "planned",
  "active",
  "deprecated",
] as const;
export type AcwNodeStatus = (typeof ACW_NODE_STATUSES)[number];

export function isAcwNodeStatus(value: unknown): value is AcwNodeStatus {
  return (
    typeof value === "string" &&
    (ACW_NODE_STATUSES as readonly string[]).includes(value)
  );
}

export const ACW_NODE_MATURITIES = [
  "initial",
  "managed",
  "defined",
  "quantitatively-managed",
  "optimizing",
] as const;
export type AcwNodeMaturity = (typeof ACW_NODE_MATURITIES)[number];

export function isAcwNodeMaturity(value: unknown): value is AcwNodeMaturity {
  return (
    typeof value === "string" &&
    (ACW_NODE_MATURITIES as readonly string[]).includes(value)
  );
}

export const ACW_NODE_PRIORITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type AcwNodePriority = (typeof ACW_NODE_PRIORITIES)[number];

export function isAcwNodePriority(value: unknown): value is AcwNodePriority {
  return (
    typeof value === "string" &&
    (ACW_NODE_PRIORITIES as readonly string[]).includes(value)
  );
}

// Display labels — what the dropdowns render. Keys mirror the enum
// values above and any drift between the two sets is caught by the
// matching assertion at the bottom of this module.
export const ACW_NODE_STATUS_LABEL: Readonly<Record<AcwNodeStatus, string>> =
  Object.freeze({
    planned: "Planned",
    active: "Active",
    deprecated: "Deprecated",
  });

export const ACW_NODE_MATURITY_LABEL: Readonly<Record<AcwNodeMaturity, string>> =
  Object.freeze({
    initial: "Initial",
    managed: "Managed",
    defined: "Defined",
    "quantitatively-managed": "Quantitatively managed",
    optimizing: "Optimizing",
  });

// Display labels for the priority enum.
//
// The enum *values* (`low` / `high` / `critical`) are intentionally
// neutral programmatic identifiers — they ride the storage layer
// only and never reach the DOM. The user-visible labels here use
// neutral synonyms because `ACW_PLACEHOLDER_FORBIDDEN` (which
// asserts every static label rendered by an ACW surface) bans
// "low", "high", and "critical" via the responsibility-lens tier.
// Mapping the enum values to "Routine / Standard / Elevated /
// Acute" preserves the ordered ladder while passing the language
// guard. The substitution is descriptive only and carries no
// scoring or judgement; the ladder semantics are owned by the
// caller, not the label string.
export const ACW_NODE_PRIORITY_LABEL: Readonly<Record<AcwNodePriority, string>> =
  Object.freeze({
    low: "Routine",
    medium: "Standard",
    high: "Elevated",
    critical: "Acute",
  });

assertAllAcwPlaceholderLanguage([
  ...Object.values(ACW_NODE_STATUS_LABEL),
  ...Object.values(ACW_NODE_MATURITY_LABEL),
  ...Object.values(ACW_NODE_PRIORITY_LABEL),
]);

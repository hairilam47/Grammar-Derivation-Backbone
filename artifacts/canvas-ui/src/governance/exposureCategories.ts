import type { ADS } from "./types";

// Canonical, frozen taxonomy of ECP constraint-category tags persisted on
// each portfolio entry as `ecpConstraintCategories`. The taxonomy is
// intentionally bounded so the downstream Decision Exposure View can key
// on stable string identifiers without re-running the grammar engine.
//
// New tags must only be added here, never inferred ad-hoc. Removing a
// tag is a breaking change to the portfolio read-model.
export const ECP_CONSTRAINT_CATEGORY_TAGS = [
  "security",
  "operations",
  "compliance",
  "data_protection",
  "audit",
  "access_control",
  "availability",
  "resilience",
  "recovery",
  "integration",
  "legacy_boundary",
  "third_party",
  "assurance",
  "residency",
] as const;

export type EcpConstraintCategoryTag =
  (typeof ECP_CONSTRAINT_CATEGORY_TAGS)[number];

const TAG_SET = new Set<string>(ECP_CONSTRAINT_CATEGORY_TAGS);

export function isEcpConstraintCategoryTag(
  s: string,
): s is EcpConstraintCategoryTag {
  return TAG_SET.has(s);
}

// Derives the per-decision ECP constraint-category tag set at freeze time.
//
// HONESTY CONSTRAINT: this field MUST mirror what the Execution
// Constraint Profile actually enumerates for the decision — it is
// "frozen decision intent, not interpretation". The current ECP
// (see ecpSections.ts and ecpBuilder.ts) enumerates exactly:
//   - Four mandatory constraint categories on every decision
//     (Security, Operations, Compliance, Data Protection).
//   - An integration & legacy-boundary clause that fires when the
//     ECP mandates an Integration layer and/or when the decision
//     intent is LegacyReplacement.
// Nothing else is enumerated by the ECP today. We therefore emit
// only those tags. Tags reserved in the canonical taxonomy for
// future ECP expansion (audit, access_control, availability,
// resilience, recovery, assurance, residency) remain dormant here
// and are intentionally NOT synthesised from risks or layers.
export function deriveEcpConstraintCategories(
  ads: ADS,
): EcpConstraintCategoryTag[] {
  const out = new Set<EcpConstraintCategoryTag>();

  // Always-on mandatory categories declared by the ECP for every decision.
  out.add("security");
  out.add("operations");
  out.add("compliance");
  out.add("data_protection");

  const ctx = ads.context;
  const layers = new Set(ads.result.requiredComponents.map((c) => c.layer));

  // ECP_INTEGRATION_LEGACY: the ECP declares an integration constraint
  // exactly when the derived architecture mandates an Integration layer.
  // Cross-system integration in the ECP also implies a structural
  // third-party surface, which the ECP narrative makes explicit.
  if (layers.has("Integration")) {
    out.add("integration");
    out.add("third_party");
  }
  // ECP_INTEGRATION_LEGACY: legacy boundary clause flips on for
  // LegacyReplacement decisions.
  if (ctx.systemIntent === "LegacyReplacement") {
    out.add("legacy_boundary");
  }

  // Stable canonical ordering for deterministic persistence.
  return ECP_CONSTRAINT_CATEGORY_TAGS.filter((t) => out.has(t));
}

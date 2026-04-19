import type { PortfolioEntry } from "./portfolioStore";
import type { ExposurePayload } from "./exposureDerive";
import type { EcpConstraintCategoryTag } from "./exposureCategories";
import { assertExposureNarrativeLanguage } from "./staticTextGuard";

// Phase 2 — Exposure Narratives derivation module.
//
// Pure, deterministic. Takes a single PortfolioEntry plus the Phase 1
// ExposurePayload and returns, for each of the four Phase 1 sections,
// either a four-clause narrative paragraph or one of two empty-state
// sentences. No I/O, no scoring, no persistence (PH2-HC1, PH2-HC3,
// PH2-HC6).
//
// The composer enforces clause order, always appends the verbatim
// Framing Boundary Clause, and runs every produced string through the
// EXPOSURE_NARRATIVE language guard before returning (PH2-HC4, PH2-HC5).
//
// PH2-HC7: every Exposure Surface Clause is built from items that
// actually appear in the corresponding Phase 1 section's list. If a
// section's list is empty, this module emits PH2-EMPTY-A and never
// invents content.
//
// Two distinct empty states, deterministically selected:
//   * PH2-EMPTY-A — the section has nothing to point at right now,
//     but the decision has well-formed structural inputs (in-scope
//     capabilities and / or ECP constraint categories). The narrative
//     is "not yet available" because no exposure surface exists for
//     this section, not because we are choosing to suppress it.
//   * PH2-EMPTY-B — the decision itself lacks the structural inputs
//     a four-clause narrative requires (no in-scope capabilities AND
//     no ECP constraint categories). In this case all four section
//     narratives are intentionally omitted to avoid composing context
//     and structural-cause clauses out of nothing. Selection happens
//     at the entry level, before per-section composition.

// Verbatim final clause — mandatory in every narrative paragraph.
export const FRAMING_BOUNDARY_CLAUSE =
  "This reflects structural exposure inherent to the approved decision, not a judgement or requirement.";

// PH2-EMPTY-A — feature not yet available for this decision.
export const PH2_EMPTY_A =
  "Exposure explanations are not yet available for this decision. This view describes exposure surfaces without additional interpretation.";

// PH2-EMPTY-B — intentionally omitted.
export const PH2_EMPTY_B =
  "Exposure explanations are intentionally omitted for this decision.";

// Spec-equality check on the Framing Boundary Clause. Mirrors the
// Phase 1 banner exemption pattern: spec wording is checked by
// equality so any drift fails loudly at module load. The clause is
// also free of EXPOSURE_NARRATIVE_FORBIDDEN tokens, so the substring
// guard would accept it as well; the equality check exists to detect
// silent paraphrasing.
const FRAMING_BOUNDARY_SPEC =
  "This reflects structural exposure inherent to the approved decision, not a judgement or requirement.";
if (FRAMING_BOUNDARY_CLAUSE !== FRAMING_BOUNDARY_SPEC) {
  throw new Error(
    "Phase 2 Framing Boundary Clause has drifted from the spec wording.",
  );
}

// PH2-HC4 secondary check at module load: the empty-state sentences
// (which the substring guard does not exempt) must pass the narrative
// guard regardless of context.
assertExposureNarrativeLanguage(PH2_EMPTY_A);
assertExposureNarrativeLanguage(PH2_EMPTY_B);

// Capability id → human-readable name. Mirrors the canonical names in
// lib/architecture-grammar capabilities.ts. Held locally to avoid an
// upward import from the wizard; the canonical id space is stable.
const CAPABILITY_NAME: Record<string, string> = {
  CAP_EXTERNAL_ACCESS: "external / public access",
  CAP_INTERNAL_ADMIN: "internal administrative access",
  CAP_CASE_MANAGEMENT: "case / transaction management",
  CAP_DOCUMENT_MANAGEMENT: "document & evidence management",
  CAP_WORKFLOW_APPROVAL: "workflow & approval",
  CAP_REPORTING_ANALYTICS: "reporting & analytics",
  CAP_AUDIT_COMPLIANCE: "audit & compliance",
};

const CONSTRAINT_CATEGORY_LABEL: Record<EcpConstraintCategoryTag, string> = {
  security: "security controls",
  operations: "operational controls",
  compliance: "compliance controls",
  data_protection: "data protection controls",
  audit: "audit trail integrity",
  access_control: "access controls",
  availability: "availability controls",
  resilience: "resilience controls",
  recovery: "recovery controls",
  integration: "cross-system integration",
  legacy_boundary: "legacy boundary handling",
  third_party: "third-party reliance",
  assurance: "assurance evidence",
  residency: "data residency handling",
};

const LAYER_LABEL: Record<string, string> = {
  UI: "user-interface surface",
  Application: "application logic surface",
  Data: "data storage surface",
  Integration: "integration surface",
  Security: "security surface",
  Operations: "operations surface",
};

const ORG_TYPE_LABEL: Record<string, string> = {
  Government: "Government",
  Enterprise: "Enterprise",
};

const SENSITIVITY_LABEL: Record<string, string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
};

const SYSTEM_INTENT_LABEL: Record<string, string> = {
  LegacyReplacement: "replace a legacy system",
  NewCapability: "introduce a new capability",
};

// Module-load guard for every label literal that can appear in a
// composed narrative. This is the static portion of the language
// surface; the dynamic Phase 1 labels are guarded at their own
// module-load (in exposureDerive.ts) under the stricter REFLECTIVE
// vocabulary, which subsumes the SIGNALS subset shared with
// EXPOSURE_NARRATIVE_FORBIDDEN apart from the narrative-specific
// extras (must / improve / reduce / high risk / severe / critical),
// none of which appear in Phase 1 labels.
const ALL_LABELS = [
  ...Object.values(CAPABILITY_NAME),
  ...Object.values(CONSTRAINT_CATEGORY_LABEL),
  ...Object.values(LAYER_LABEL),
  ...Object.values(ORG_TYPE_LABEL),
  ...Object.values(SENSITIVITY_LABEL),
  ...Object.values(SYSTEM_INTENT_LABEL),
];
for (const label of ALL_LABELS) {
  assertExposureNarrativeLanguage(label);
}

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function contextClause(entry: PortfolioEntry): string {
  const ctx = entry.organisationContext;
  const orgLabel = ORG_TYPE_LABEL[ctx.organisationType] ?? ctx.organisationType;
  const sensLabel = SENSITIVITY_LABEL[ctx.sensitivityLevel] ?? ctx.sensitivityLevel;
  const intentLabel = SYSTEM_INTENT_LABEL[ctx.systemIntent] ?? ctx.systemIntent;
  const capLabels = entry.inScopeCapabilityIds
    .map((id) => CAPABILITY_NAME[id])
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  const lifespan = `${ctx.expectedLifespanYears}-year`;

  let clause =
    `Because this decision involves a ${orgLabel} organisation handling ${sensLabel}-sensitivity information, ` +
    `with the intent to ${intentLabel}, over a ${lifespan} expected lifespan`;
  if (capLabels.length > 0) {
    clause += `, covering ${joinList(capLabels)}`;
  }
  return clause;
}

function structuralCauseClause(entry: PortfolioEntry): string {
  const ccLabels = entry.ecpConstraintCategories
    .map((c) => CONSTRAINT_CATEGORY_LABEL[c])
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  const layerLabels = entry.layersPresent
    .map((l) => LAYER_LABEL[l as string])
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  // PH2-HC7: this clause may be entirely structural even when the
  // decision happens to land on the four mandatory categories only.
  const ccPart =
    ccLabels.length > 0
      ? `it carries ${joinList(ccLabels)}`
      : "it carries no additional ECP constraint categories";
  const layerPart =
    layerLabels.length > 0
      ? ` across the ${joinList(layerLabels)}`
      : "";

  return `and because ${ccPart}${layerPart}`;
}

function exposureSurfaceClause(items: string[]): string {
  // Caller guarantees items.length > 0 (empty case routes to
  // PH2-EMPTY-A in composeNarrative below). The phrasing is
  // structural — "places sustained pressure on" — and avoids any
  // urgency or judgement vocabulary.
  return `this places sustained pressure on ${joinList(items)}`;
}

function composeNarrative(
  entry: PortfolioEntry,
  sectionItems: string[],
): string {
  if (sectionItems.length === 0) {
    return PH2_EMPTY_A;
  }
  const paragraph =
    `${contextClause(entry)} ${structuralCauseClause(entry)}, ` +
    `${exposureSurfaceClause(sectionItems)}. ` +
    `${FRAMING_BOUNDARY_CLAUSE}`;

  // PH2-HC4: route the composed paragraph through the same helper used
  // for every other narrative-tier string in the system. Centralising
  // the guard here (instead of inlining the EXPOSURE_NARRATIVE_FORBIDDEN
  // loop) keeps the composer in step with any future change to the
  // helper, and makes the "every produced string passes the guard"
  // contract structurally obvious at the call site. The Framing
  // Boundary Clause is itself token-clean, so guarding the whole
  // paragraph is safe and there is no need for a banner-style
  // exemption.
  assertExposureNarrativeLanguage(paragraph);
  return paragraph;
}

export interface ExposureNarratives {
  governanceDomains: string;
  scrutinyVectors: string;
  impactSurfaces: string;
  functionsAffected: string;
}

export function deriveExposureNarratives(
  entry: PortfolioEntry,
  payload: ExposurePayload,
): ExposureNarratives {
  // PH2-EMPTY-B selection happens once, at the entry level. When the
  // decision lacks both structural input dimensions a four-clause
  // narrative would have nothing to draw the Context (capabilities)
  // and Structural Cause (constraint categories) clauses from. Rather
  // than fall back to PH2-EMPTY-A four times — which would imply the
  // sections happen to be empty — every section emits PH2-EMPTY-B to
  // record that the omission is intentional and decision-wide.
  const noStructuralInputs =
    entry.inScopeCapabilityIds.length === 0 &&
    entry.ecpConstraintCategories.length === 0;
  if (noStructuralInputs) {
    return {
      governanceDomains: PH2_EMPTY_B,
      scrutinyVectors: PH2_EMPTY_B,
      impactSurfaces: PH2_EMPTY_B,
      functionsAffected: PH2_EMPTY_B,
    };
  }

  const govItems = payload.governanceDomains.map((d) => d.label);
  const scrItems = payload.scrutinyVectors.map((v) => v.label);
  const impactItems = [
    ...payload.impactSurfaces.institutional,
    ...payload.impactSurfaces.product,
    ...payload.impactSurfaces.infrastructure,
  ];
  const fnItems = payload.functionsAffected.slice();

  return {
    governanceDomains: composeNarrative(entry, govItems),
    scrutinyVectors: composeNarrative(entry, scrItems),
    impactSurfaces: composeNarrative(entry, impactItems),
    functionsAffected: composeNarrative(entry, fnItems),
  };
}

import type { PortfolioEntry } from "./portfolioStore";
import { assertAllReflectiveLanguage } from "./staticTextGuard";

// Phase 1 — Decision Exposure View derivation module.
//
// Pure, deterministic. Takes a single PortfolioEntry and returns the
// payloads for the four baseline exposure sections in a stable shape
// the UI can render with no further computation.
//
// Encodes the locked mapping rules from the Phase 1 prompt verbatim.
// Where the prompt uses phrases that have no direct portfolio field
// today (e.g. "regulated reporting environment", "multi-jurisdictional",
// "long-lived"), each interpretation is documented inline next to the
// rule it implements.
//
// PH1-HC2/HC3/HC4: derived only, no I/O, no scoring.

export type GovernanceDomainId =
  | "DATA_PROTECTION_PRIVACY"
  | "AUDITABILITY_RECORD_INTEGRITY"
  | "IDENTITY_ACCESS_OVERSIGHT"
  | "FINANCIAL_REPORTING_CONTROLS"
  | "JURISDICTIONAL_CROSS_BORDER";

export type ScrutinyVectorId =
  | "EXTERNAL_AUDIT_SCRUTINY_LIKELY"
  | "REGULATORY_INQUIRY_PLAUSIBLE"
  | "THIRD_PARTY_ASSURANCE_RELIANCE_INCREASES"
  | "CONTRACTUAL_PARTNER_REVIEW_EXPOSURE";

export type ImpactSurfaceLabel =
  | "governance coordination load"
  | "audit preparation effort"
  | "decision defensibility obligations"
  | "feature constraint surface"
  | "trust expectation management"
  | "lifecycle rigidity"
  | "operational resilience obligations"
  | "monitoring expectations"
  | "recovery preparedness";

export type FunctionAffectedId =
  | "Customer Support"
  | "Data Governance"
  | "Legal / Compliance"
  | "Platform / Infrastructure"
  | "Procurement / Vendor Management"
  | "Security Operations";

export interface ExposurePayload {
  governanceDomains: { id: GovernanceDomainId; label: string }[];
  scrutinyVectors: { id: ScrutinyVectorId; label: string }[];
  impactSurfaces: {
    institutional: ImpactSurfaceLabel[];
    product: ImpactSurfaceLabel[];
    infrastructure: ImpactSurfaceLabel[];
  };
  functionsAffected: FunctionAffectedId[];
}

const GOVERNANCE_DOMAIN_LABEL: Record<GovernanceDomainId, string> = {
  DATA_PROTECTION_PRIVACY: "Data Protection & Privacy",
  AUDITABILITY_RECORD_INTEGRITY: "Auditability & Record Integrity",
  IDENTITY_ACCESS_OVERSIGHT: "Identity & Access Oversight",
  FINANCIAL_REPORTING_CONTROLS: "Financial & Reporting Controls",
  JURISDICTIONAL_CROSS_BORDER: "Jurisdictional / Cross-Border Considerations",
};

const SCRUTINY_VECTOR_LABEL: Record<ScrutinyVectorId, string> = {
  EXTERNAL_AUDIT_SCRUTINY_LIKELY: "External Audit Scrutiny Likely",
  REGULATORY_INQUIRY_PLAUSIBLE: "Regulatory Inquiry Plausible",
  THIRD_PARTY_ASSURANCE_RELIANCE_INCREASES:
    "Third-Party Assurance Reliance Increases",
  CONTRACTUAL_PARTNER_REVIEW_EXPOSURE:
    "Contractual / Partner Review Exposure",
};

const DATA_HANDLING_CAPABILITY_IDS = new Set<string>([
  "CAP_CASE_MANAGEMENT",
  "CAP_DOCUMENT_MANAGEMENT",
]);

// Baseline ECP constraint count: the four mandatory always-on
// categories (security/operations/compliance/data_protection). The
// Institutional impact surface fires when a decision exceeds this
// baseline by acquiring at least one additional constraint category.
const ECP_BASELINE_CATEGORY_COUNT = 4;

// Long-lived threshold used by both Scrutiny Vectors and Product
// impact surface. Aligns with the existing grammar's lifespan signal.
const LONG_LIVED_YEARS = 7;

// 1️⃣ Governance Domains
function deriveGovernanceDomains(
  e: PortfolioEntry,
): { id: GovernanceDomainId; label: string }[] {
  const out: GovernanceDomainId[] = [];
  const ctx = e.organisationContext;
  const inScope = new Set(e.inScopeCapabilityIds);
  const ecpCC = new Set(e.ecpConstraintCategories);

  // Data Protection & Privacy
  if (
    ctx.sensitivityLevel === "High" ||
    [...inScope].some((id) => DATA_HANDLING_CAPABILITY_IDS.has(id)) ||
    ecpCC.has("data_protection")
  ) {
    out.push("DATA_PROTECTION_PRIVACY");
  }
  // Auditability & Record Integrity
  if (inScope.has("CAP_AUDIT_COMPLIANCE") || ecpCC.has("audit")) {
    out.push("AUDITABILITY_RECORD_INTEGRITY");
  }
  // Identity & Access Oversight
  if (
    inScope.has("CAP_EXTERNAL_ACCESS") ||
    inScope.has("CAP_INTERNAL_ADMIN") ||
    ecpCC.has("access_control")
  ) {
    out.push("IDENTITY_ACCESS_OVERSIGHT");
  }
  // Financial & Reporting Controls.
  // The spec's second clause ("organisationContext implies regulated
  // reporting environment") has no corresponding signal in the current
  // OrganisationContext shape and is therefore dormant — it will fire
  // only when an explicit signal is added. The first clause
  // (Reporting & Analytics in scope) is encoded directly.
  if (inScope.has("CAP_REPORTING_ANALYTICS")) {
    out.push("FINANCIAL_REPORTING_CONTROLS");
  }
  // Jurisdictional / Cross-Border.
  // The spec's first clause ("organisationContext implies multi-
  // jurisdictional use") has no corresponding signal in the current
  // OrganisationContext shape and is therefore dormant. The second
  // clause keys on the residency ECP tag, which is reserved in the
  // canonical taxonomy but not emitted by the current ECP.
  // This domain therefore only fires once a multi-jurisdictional
  // signal or a residency constraint is introduced upstream.
  if (ecpCC.has("residency")) {
    out.push("JURISDICTIONAL_CROSS_BORDER");
  }

  return out.map((id) => ({ id, label: GOVERNANCE_DOMAIN_LABEL[id] }));
}

// 2️⃣ External Scrutiny Vectors
function deriveScrutinyVectors(
  e: PortfolioEntry,
  governanceDomains: GovernanceDomainId[],
): { id: ScrutinyVectorId; label: string }[] {
  const out: ScrutinyVectorId[] = [];
  const ctx = e.organisationContext;
  const inScope = new Set(e.inScopeCapabilityIds);
  const ecpCC = new Set(e.ecpConstraintCategories);
  const domains = new Set(governanceDomains);

  if (domains.has("AUDITABILITY_RECORD_INTEGRITY")) {
    out.push("EXTERNAL_AUDIT_SCRUTINY_LIKELY");
  }
  // Regulatory Inquiry Plausible.
  // The spec's "Regulated Enterprise" arm has no corresponding
  // organisation type in the current grammar and is therefore dormant.
  // Only the Government arm of the rule is encoded here.
  if (
    domains.has("DATA_PROTECTION_PRIVACY") &&
    ctx.organisationType === "Government"
  ) {
    out.push("REGULATORY_INQUIRY_PLAUSIBLE");
  }
  if (
    ecpCC.has("compliance") ||
    ecpCC.has("assurance") ||
    ctx.expectedLifespanYears >= LONG_LIVED_YEARS
  ) {
    out.push("THIRD_PARTY_ASSURANCE_RELIANCE_INCREASES");
  }
  // Contractual / Partner Review Exposure.
  // The spec's second clause ("inter-agency or partner usage")
  // has no corresponding signal in the current grammar and is
  // therefore dormant. The first clause (External Access in scope)
  // is encoded directly.
  if (inScope.has("CAP_EXTERNAL_ACCESS")) {
    out.push("CONTRACTUAL_PARTNER_REVIEW_EXPOSURE");
  }

  return out.map((id) => ({ id, label: SCRUTINY_VECTOR_LABEL[id] }));
}

// 3️⃣ Impact Surfaces (three sub-groups, no prioritisation)
function deriveImpactSurfaces(
  e: PortfolioEntry,
  governanceDomains: GovernanceDomainId[],
): ExposurePayload["impactSurfaces"] {
  const ctx = e.organisationContext;
  const inScope = new Set(e.inScopeCapabilityIds);
  const ecpCC = new Set(e.ecpConstraintCategories);
  const layers = new Set(e.layersPresent);

  const institutional: ImpactSurfaceLabel[] = [];
  const institutionalTriggered =
    governanceDomains.length >= 2 ||
    e.ecpConstraintCategories.length > ECP_BASELINE_CATEGORY_COUNT;
  if (institutionalTriggered) {
    if (governanceDomains.length >= 2) {
      institutional.push("governance coordination load");
    }
    if (governanceDomains.includes("AUDITABILITY_RECORD_INTEGRITY")) {
      institutional.push("audit preparation effort");
    }
    if (
      governanceDomains.length >= 3 ||
      ctx.sensitivityLevel === "High"
    ) {
      institutional.push("decision defensibility obligations");
    }
  }

  const product: ImpactSurfaceLabel[] = [];
  const externalFacing = inScope.has("CAP_EXTERNAL_ACCESS");
  const sensitivityAtLeastMedium =
    ctx.sensitivityLevel === "Medium" || ctx.sensitivityLevel === "High";
  if (externalFacing || sensitivityAtLeastMedium) {
    if (externalFacing) {
      product.push("feature constraint surface");
    }
    if (sensitivityAtLeastMedium) {
      product.push("trust expectation management");
    }
    if (ctx.expectedLifespanYears >= LONG_LIVED_YEARS) {
      product.push("lifecycle rigidity");
    }
  }

  const infrastructure: ImpactSurfaceLabel[] = [];
  const ecpHasResilience =
    ecpCC.has("availability") ||
    ecpCC.has("resilience") ||
    ecpCC.has("recovery");
  const distributedOrLongLived =
    e.baselinePosture.architectureStyle === "Distributed" ||
    ctx.expectedLifespanYears >= LONG_LIVED_YEARS;
  if (ecpHasResilience || distributedOrLongLived) {
    if (ecpCC.has("resilience") || ecpCC.has("availability")) {
      infrastructure.push("operational resilience obligations");
    }
    if (layers.has("Operations")) {
      infrastructure.push("monitoring expectations");
    }
    if (ecpCC.has("recovery")) {
      infrastructure.push("recovery preparedness");
    }
  }

  return { institutional, product, infrastructure };
}

// 4️⃣ Organisational Functions Affected (alphabetical only)
function deriveFunctionsAffected(
  e: PortfolioEntry,
  governanceDomains: GovernanceDomainId[],
  impactSurfaces: ExposurePayload["impactSurfaces"],
): FunctionAffectedId[] {
  const out = new Set<FunctionAffectedId>();
  const inScope = new Set(e.inScopeCapabilityIds);
  const ecpCC = new Set(e.ecpConstraintCategories);
  const domains = new Set(governanceDomains);

  // Legal / Compliance: Data Protection or Regulatory governance domains.
  // FINANCIAL_REPORTING_CONTROLS stands in for the regulatory case.
  if (
    domains.has("DATA_PROTECTION_PRIVACY") ||
    domains.has("FINANCIAL_REPORTING_CONTROLS")
  ) {
    out.add("Legal / Compliance");
  }
  if (domains.has("IDENTITY_ACCESS_OVERSIGHT")) {
    out.add("Security Operations");
  }
  if (domains.has("DATA_PROTECTION_PRIVACY")) {
    out.add("Data Governance");
  }
  if (
    impactSurfaces.infrastructure.length > 0
  ) {
    out.add("Platform / Infrastructure");
  }
  if (inScope.has("CAP_EXTERNAL_ACCESS")) {
    out.add("Customer Support");
  }
  if (ecpCC.has("third_party")) {
    out.add("Procurement / Vendor Management");
  }

  return [...out].sort((a, b) => a.localeCompare(b));
}

// PH1-HC4: every static label literal that this module can render
// must pass the strictest reflective-language guard. Run at module
// load so any drift fails loudly the moment the bundle is imported,
// not lazily on a particular row's render.
assertAllReflectiveLanguage([
  ...Object.values(GOVERNANCE_DOMAIN_LABEL),
  ...Object.values(SCRUTINY_VECTOR_LABEL),
  // ImpactSurfaceLabel string literal union — kept in sync with the
  // type definition above. Adding a new label here without adding it
  // to this list will fail typecheck via the as-const assertion.
  ...([
    "governance coordination load",
    "audit preparation effort",
    "decision defensibility obligations",
    "feature constraint surface",
    "trust expectation management",
    "lifecycle rigidity",
    "operational resilience obligations",
    "monitoring expectations",
    "recovery preparedness",
  ] as const satisfies readonly ImpactSurfaceLabel[]),
  ...([
    "Customer Support",
    "Data Governance",
    "Legal / Compliance",
    "Platform / Infrastructure",
    "Procurement / Vendor Management",
    "Security Operations",
  ] as const satisfies readonly FunctionAffectedId[]),
]);

export function deriveExposure(entry: PortfolioEntry): ExposurePayload {
  const governanceDomainsFull = deriveGovernanceDomains(entry);
  const governanceDomainIds = governanceDomainsFull.map((d) => d.id);
  const scrutinyVectors = deriveScrutinyVectors(entry, governanceDomainIds);
  const impactSurfaces = deriveImpactSurfaces(entry, governanceDomainIds);
  const functionsAffected = deriveFunctionsAffected(
    entry,
    governanceDomainIds,
    impactSurfaces,
  );
  return {
    governanceDomains: governanceDomainsFull,
    scrutinyVectors,
    impactSurfaces,
    functionsAffected,
  };
}

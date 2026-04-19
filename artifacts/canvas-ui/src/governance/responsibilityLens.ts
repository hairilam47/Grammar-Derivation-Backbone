import type { PortfolioEntry } from "./portfolioStore";
import type { ExposurePayload } from "./exposureDerive";
import { assertResponsibilityLensLanguage } from "./staticTextGuard";

// Phase 3 — Cross-Functional Responsibility Lens derivation module.
//
// Pure, deterministic. Takes a single PortfolioEntry plus the Phase 1
// ExposurePayload and returns an alphabetically-sorted list of
// {functionName, pressureTypes[]} entries. No I/O, no scoring, no
// persistence (PH3-HC1, PH3-HC3, PH3-HC6).
//
// PH3-HC3 (derived-only): reads only the entry's organisationContext,
// layersPresent, inScopeCapabilityIds, ecpConstraintCategories, and the
// Phase 1 ExposurePayload. Phase 2 narratives are NOT parsed.
//
// PH3-HC2 (noun-phrase only): every produced pressure-type string is
// pulled from a fixed lookup table — never templated at runtime — so
// the rendered surface cannot acquire imperative or judgmental phrasing
// by accident. The lookup table is asserted against
// RESPONSIBILITY_LENS_FORBIDDEN at module load.
//
// PH3-HC5 (alphabetical): both the function ordering and the
// pressure-type ordering within each function are alphabetical via
// localeCompare. The lens makes no statement about precedence.

export type ResponsibilityFunctionName =
  | "Customer Support"
  | "Data Governance"
  | "Legal / Compliance"
  | "Platform / Infrastructure"
  | "Procurement / Vendor Management"
  | "Security Operations";

// Canonical noun-phrase pressure-type literals. Held in one place so
// the language guard can be applied to every literal at module load.
type PressureType =
  | "access monitoring obligation"
  | "assurance defensibility consideration"
  | "incident communication expectation"
  | "incident response preparedness"
  | "operational resilience obligation"
  | "personal data stewardship obligation"
  | "recovery preparedness expectation"
  | "regulatory interpretation load"
  | "user inquiry handling obligation"
  | "vendor assurance coordination expectation";

const PRESSURE_TYPES: readonly PressureType[] = [
  "access monitoring obligation",
  "assurance defensibility consideration",
  "incident communication expectation",
  "incident response preparedness",
  "operational resilience obligation",
  "personal data stewardship obligation",
  "recovery preparedness expectation",
  "regulatory interpretation load",
  "user inquiry handling obligation",
  "vendor assurance coordination expectation",
] as const;

const FUNCTION_NAMES: readonly ResponsibilityFunctionName[] = [
  "Customer Support",
  "Data Governance",
  "Legal / Compliance",
  "Platform / Infrastructure",
  "Procurement / Vendor Management",
  "Security Operations",
] as const;

// PH3-HC4: every static literal that this module can render must pass
// the responsibility-lens language guard. Run at module load so any
// drift fails loudly the moment the bundle is imported.
for (const literal of [...PRESSURE_TYPES, ...FUNCTION_NAMES]) {
  assertResponsibilityLensLanguage(literal);
}

export interface ResponsibilityLensRow {
  functionName: ResponsibilityFunctionName;
  pressureTypes: PressureType[];
}

export type ResponsibilityLens = ResponsibilityLensRow[];

// Single-rule shape: a function + a pressure type + a predicate over
// the deterministic inputs. The deriver simply evaluates each rule
// and groups truthy rules under their function name. Adding or
// removing a rule is a one-line change here.
interface PressureRule {
  functionName: ResponsibilityFunctionName;
  pressureType: PressureType;
  applies: (
    entry: PortfolioEntry,
    payload: ExposurePayload,
  ) => boolean;
}

// Predicate helpers built from the locked Phase 1 payload + entry
// structural inputs. Each is named after the spec phrase it encodes
// so the rule table below reads as a direct transcription of the
// spec's canonical mapping.

function dataProtectionPresent(payload: ExposurePayload): boolean {
  return payload.governanceDomains.some(
    (d) => d.id === "DATA_PROTECTION_PRIVACY",
  );
}

function identityAccessPresent(payload: ExposurePayload): boolean {
  return payload.governanceDomains.some(
    (d) => d.id === "IDENTITY_ACCESS_OVERSIGHT",
  );
}

// "Regulatory scrutiny vector present" — interpreted strictly as
// REGULATORY_INQUIRY_PLAUSIBLE. EXTERNAL_AUDIT_SCRUTINY_LIKELY is a
// distinct vector keyed on auditability rather than regulatory
// inquiry, so it is not folded into this predicate.
function regulatoryScrutinyPresent(payload: ExposurePayload): boolean {
  return payload.scrutinyVectors.some(
    (v) => v.id === "REGULATORY_INQUIRY_PLAUSIBLE",
  );
}

function infrastructureSurfacePresent(payload: ExposurePayload): boolean {
  return payload.impactSurfaces.infrastructure.length > 0;
}

// "Infrastructure impact surface includes monitoring / resilience"
// per the spec — the two specific Phase 1 labels named.
function infrastructureCoversMonitoringOrResilience(
  payload: ExposurePayload,
): boolean {
  const infra = payload.impactSurfaces.infrastructure;
  return (
    infra.includes("monitoring expectations") ||
    infra.includes("operational resilience obligations")
  );
}

function productSurfacePresent(payload: ExposurePayload): boolean {
  return payload.impactSurfaces.product.length > 0;
}

function externalAccessInScope(entry: PortfolioEntry): boolean {
  return entry.inScopeCapabilityIds.includes("CAP_EXTERNAL_ACCESS");
}

function ecpHasAvailabilityOrRecovery(entry: PortfolioEntry): boolean {
  const ccs = new Set(entry.ecpConstraintCategories);
  return ccs.has("availability") || ccs.has("recovery");
}

function ecpHasThirdPartyOrIntegration(entry: PortfolioEntry): boolean {
  const ccs = new Set(entry.ecpConstraintCategories);
  return ccs.has("third_party") || ccs.has("integration");
}

// Canonical mapping table — one entry per (function, pressure type).
// The function appears in the lens iff at least one of its pressure
// rules fires. Pressure-type ordering inside each row is determined by
// alphabetical sort below, NOT by the order of declaration here.
const RULES: readonly PressureRule[] = [
  // Legal / Compliance — Data Protection AND Regulatory scrutiny.
  {
    functionName: "Legal / Compliance",
    pressureType: "regulatory interpretation load",
    applies: (_e, p) =>
      dataProtectionPresent(p) && regulatoryScrutinyPresent(p),
  },
  {
    functionName: "Legal / Compliance",
    pressureType: "assurance defensibility consideration",
    applies: (_e, p) =>
      dataProtectionPresent(p) && regulatoryScrutinyPresent(p),
  },

  // Security Operations — Identity & Access AND infra covers
  // monitoring or resilience.
  {
    functionName: "Security Operations",
    pressureType: "access monitoring obligation",
    applies: (_e, p) =>
      identityAccessPresent(p) &&
      infrastructureCoversMonitoringOrResilience(p),
  },
  {
    functionName: "Security Operations",
    pressureType: "incident response preparedness",
    applies: (_e, p) =>
      identityAccessPresent(p) &&
      infrastructureCoversMonitoringOrResilience(p),
  },

  // Data Governance — Data Protection present.
  {
    functionName: "Data Governance",
    pressureType: "personal data stewardship obligation",
    applies: (_e, p) => dataProtectionPresent(p),
  },

  // Platform / Infrastructure — infra surface AND ECP availability/recovery.
  {
    functionName: "Platform / Infrastructure",
    pressureType: "operational resilience obligation",
    applies: (e, p) =>
      infrastructureSurfacePresent(p) && ecpHasAvailabilityOrRecovery(e),
  },
  {
    functionName: "Platform / Infrastructure",
    pressureType: "recovery preparedness expectation",
    applies: (e, p) =>
      infrastructureSurfacePresent(p) && ecpHasAvailabilityOrRecovery(e),
  },

  // Customer Support — External Access in scope AND product surface present.
  {
    functionName: "Customer Support",
    pressureType: "user inquiry handling obligation",
    applies: (e, p) =>
      externalAccessInScope(e) && productSurfacePresent(p),
  },
  {
    functionName: "Customer Support",
    pressureType: "incident communication expectation",
    applies: (e, p) =>
      externalAccessInScope(e) && productSurfacePresent(p),
  },

  // Procurement / Vendor Management — ECP third-party or integration.
  {
    functionName: "Procurement / Vendor Management",
    pressureType: "vendor assurance coordination expectation",
    applies: (e, _p) => ecpHasThirdPartyOrIntegration(e),
  },
];

export function deriveResponsibilityLens(
  entry: PortfolioEntry,
  payload: ExposurePayload,
): ResponsibilityLens {
  // Group fired rules by function.
  const grouped = new Map<ResponsibilityFunctionName, Set<PressureType>>();
  for (const rule of RULES) {
    if (rule.applies(entry, payload)) {
      let bucket = grouped.get(rule.functionName);
      if (!bucket) {
        bucket = new Set<PressureType>();
        grouped.set(rule.functionName, bucket);
      }
      bucket.add(rule.pressureType);
    }
  }

  // PH3-HC5: alphabetical at both levels. Function ordering uses
  // localeCompare; pressure-type ordering inside each row likewise.
  const rows: ResponsibilityLensRow[] = [];
  for (const functionName of [...grouped.keys()].sort((a, b) =>
    a.localeCompare(b),
  )) {
    const pressureTypes = [...(grouped.get(functionName) ?? [])].sort(
      (a, b) => a.localeCompare(b),
    );
    rows.push({ functionName, pressureTypes });
  }
  return rows;
}

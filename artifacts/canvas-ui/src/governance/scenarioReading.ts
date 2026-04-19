import type { PortfolioEntry } from "./portfolioStore";
import type {
  ExposurePayload,
  GovernanceDomainId,
  ScrutinyVectorId,
  ImpactSurfaceLabel,
  FunctionAffectedId,
} from "./exposureDerive";
import { assertScenarioReadingLanguage } from "./staticTextGuard";

// Phase 4 — Scenario-Conditioned Reading derivation module.
//
// Pure, deterministic. Produces, for one approved decision and one
// selected scenario lens, a structured set of contextual qualifier
// phrases that annotate existing Phase 1 / Phase 2 / Phase 3 elements.
// Phase 4 changes context, not content (PH4-HC1, PH4-HC4).
//
// PH4-HC1 (read-only) / PH4-HC2 (single-decision) / PH4-HC3 (derived-only):
// inputs are limited to a single PortfolioEntry and the Phase 1
// ExposurePayload. Phase 2 narratives are produced separately and the
// page passes the keyed narrative qualifier slot for whichever
// section the qualifier targets — this module never parses narrative
// strings.
//
// PH4-HC4 (no new content) / PH4-HC5 (no severity / priority language)
// / PH4-HC6 (no prescription): every qualifier phrase is drawn from a
// fixed table of allowed noun-phrase qualifiers and routed through
// SCENARIO_READING_FORBIDDEN at module load. Baseline always returns
// an empty annotations object (no qualifiers at all). When a non-
// baseline lens fires no qualifiers for the current decision the page
// renders the spec-locked empty-state sentence.
//
// PH4-HC7 (removable): this module has zero callers in Phases 1–3.
// Deleting it and the selector slot in pages/Exposure.tsx restores the
// page byte-for-byte.

// --- Lens enum ---------------------------------------------------------------

export type ScenarioLens =
  | "BASELINE"
  | "LIMITED"
  | "WIDE"
  | "EXTERNAL"
  | "EXTENDED";

// Spec-locked display labels. Order is the spec's order and must be
// preserved (Baseline first; the four alternates follow). The page
// renders these directly in a single-select control.
export const SCENARIO_LENS_ORDER: readonly ScenarioLens[] = [
  "BASELINE",
  "LIMITED",
  "WIDE",
  "EXTERNAL",
  "EXTENDED",
] as const;

export const SCENARIO_LENS_LABEL: Record<ScenarioLens, string> = {
  BASELINE: "Baseline (Approved Context)",
  LIMITED: "Limited-Scale Use",
  WIDE: "Organisation-Wide Use",
  EXTERNAL: "External Partner Exposure",
  EXTENDED: "Extended Lifespan",
};

// --- Spec-locked surface strings owned by this module -----------------------

// Section heading rendered above the lens selector card. Contextual,
// not analytical.
export const SCENARIO_HEADING = "Scenario-Conditioned Reading";

// Helper sentence framing the selector as a re-reading aid, never as
// a forecasting or comparison tool.
export const SCENARIO_HELPER =
  "Switch the reading lens to re-read the same exposure under a different usage context. The underlying exposure does not change.";

// Selector control label. Single-select, no compare affordance.
export const SCENARIO_SELECTOR_LABEL = "Reading lens";

// Spec-locked empty-state sentence emitted when a non-baseline lens
// fires no qualifiers for the current decision.
export const SCENARIO_EMPTY =
  "This scenario does not change how the existing exposure reads.";

// --- Allowed qualifier phrases ----------------------------------------------

// Fixed list of allowed noun-phrase qualifiers. The deriver never
// templates a qualifier at runtime — every annotation must be one of
// these literals. Each is intentionally non-comparative,
// non-evaluative, and non-prescriptive.
const QUALIFIERS = {
  PERSISTS: "persists",
  BROADENS: "broadens",
  CONCENTRATES: "concentrates",
  CONTINUOUS: "becomes more continuous",
  EPISODIC: "remains episodic",
  DISTRIBUTED: "becomes more distributed",
} as const;

type Qualifier = (typeof QUALIFIERS)[keyof typeof QUALIFIERS];

const ALL_QUALIFIERS: readonly Qualifier[] = Object.values(QUALIFIERS);

// PH4-HC5 / PH4-HC6: every static literal this module can render is
// asserted against SCENARIO_READING_FORBIDDEN at module load. Drift in
// either the lens labels or the qualifier set fails loudly the moment
// the bundle is imported.
for (const literal of [
  ...ALL_QUALIFIERS,
  ...Object.values(SCENARIO_LENS_LABEL),
  SCENARIO_HEADING,
  SCENARIO_HELPER,
  SCENARIO_SELECTOR_LABEL,
  SCENARIO_EMPTY,
]) {
  assertScenarioReadingLanguage(literal);
}

// --- Annotation shape -------------------------------------------------------

export type NarrativeSectionKey =
  | "governanceDomains"
  | "scrutinyVectors"
  | "impactSurfaces"
  | "functionsAffected";

export interface ScenarioAnnotations {
  // Keyed by the visible label string. The task plan specifies
  // structured keys (Phase 1 section + item, Phase 3 (function,
  // pressure) tuple). The flat-key shape is a deliberate, behaviour-
  // equivalent simplification: every rendered Phase 1 label across
  // all four sections is globally unique (governance/scrutiny ids
  // map to unique display labels; impact-surface labels and function
  // names are unique union types), and every Phase 3 pressure-type
  // belongs to exactly one function in the canonical mapping (see
  // RULES table in responsibilityLens.ts). The page therefore can
  // resolve any rendered label by a single lookup with no risk of
  // collision. If a future change ever introduces a collision (e.g.
  // a pressure-type literal reused across functions, or a Phase 1
  // label colliding with a Phase 3 label), this shape MUST be
  // tightened to structured keys before that change lands.
  itemQualifiers: Record<string, string>;
  // One optional qualifier per Phase 2 narrative section. Only emitted
  // when the section's narrative is the four-clause paragraph (i.e.
  // the section's Phase 1 list has at least one item); never emitted
  // for an empty-state narrative sentence.
  narrativeQualifiers: Partial<Record<NarrativeSectionKey, string>>;
}

// --- Lens × element qualifier rules -----------------------------------------

// Each rule says: "under <lens>, attach <qualifier> to <element>" —
// but only if <element> is actually present on the page for this
// decision. Presence is checked against the Phase 1 payload before
// the qualifier is emitted. The rule list is the single source of
// truth; the deriver never invents pairs at runtime.
//
// Element kind discriminates which slot of ExposurePayload to look in
// (and, for narratives, which Phase 2 section the qualifier targets).
type ElementRef =
  | { kind: "governance"; id: GovernanceDomainId }
  | { kind: "scrutiny"; id: ScrutinyVectorId }
  | { kind: "impact"; label: ImpactSurfaceLabel }
  | { kind: "function"; id: FunctionAffectedId }
  | { kind: "pressure"; pressureLabel: string }
  | { kind: "narrative"; section: NarrativeSectionKey };

interface QualifierRule {
  lens: Exclude<ScenarioLens, "BASELINE">;
  element: ElementRef;
  qualifier: Qualifier;
}

// The rule table — deliberately small and readable. Inline comments
// document the contextual reading each pair encodes (NOT a prediction
// or evaluation; just how the same exposure reads under that context).
const RULES: readonly QualifierRule[] = [
  // Limited-Scale Use — narrow deployment, restricted audience.
  // Audit / monitoring / access pressures still exist but read as
  // episodic rather than continuous; product feature surface
  // concentrates onto the narrower deployment.
  { lens: "LIMITED", element: { kind: "scrutiny", id: "EXTERNAL_AUDIT_SCRUTINY_LIKELY" }, qualifier: QUALIFIERS.EPISODIC },
  { lens: "LIMITED", element: { kind: "governance", id: "IDENTITY_ACCESS_OVERSIGHT" }, qualifier: QUALIFIERS.EPISODIC },
  { lens: "LIMITED", element: { kind: "pressure", pressureLabel: "access monitoring obligation" }, qualifier: QUALIFIERS.EPISODIC },
  { lens: "LIMITED", element: { kind: "impact", label: "feature constraint surface" }, qualifier: QUALIFIERS.CONCENTRATES },
  { lens: "LIMITED", element: { kind: "narrative", section: "scrutinyVectors" }, qualifier: QUALIFIERS.EPISODIC },

  // Organisation-Wide Use — broad internal adoption.
  // Identity oversight and governance coordination broaden across the
  // organisation; monitoring obligations read as more continuous;
  // user-facing functions also broaden.
  { lens: "WIDE", element: { kind: "governance", id: "IDENTITY_ACCESS_OVERSIGHT" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "WIDE", element: { kind: "impact", label: "governance coordination load" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "WIDE", element: { kind: "impact", label: "monitoring expectations" }, qualifier: QUALIFIERS.CONTINUOUS },
  { lens: "WIDE", element: { kind: "pressure", pressureLabel: "access monitoring obligation" }, qualifier: QUALIFIERS.CONTINUOUS },
  { lens: "WIDE", element: { kind: "pressure", pressureLabel: "user inquiry handling obligation" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "WIDE", element: { kind: "function", id: "Customer Support" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "WIDE", element: { kind: "function", id: "Security Operations" }, qualifier: QUALIFIERS.CONTINUOUS },
  { lens: "WIDE", element: { kind: "narrative", section: "functionsAffected" }, qualifier: QUALIFIERS.BROADENS },

  // External Partner Exposure — use beyond the organisational
  // boundary. Partner / third-party scrutiny and trust expectations
  // broaden; communication and vendor-coordination pressures broaden;
  // the exposure becomes more distributed across organisational
  // boundaries.
  { lens: "EXTERNAL", element: { kind: "scrutiny", id: "CONTRACTUAL_PARTNER_REVIEW_EXPOSURE" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "EXTERNAL", element: { kind: "scrutiny", id: "THIRD_PARTY_ASSURANCE_RELIANCE_INCREASES" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "EXTERNAL", element: { kind: "function", id: "Procurement / Vendor Management" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "EXTERNAL", element: { kind: "pressure", pressureLabel: "vendor assurance coordination expectation" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "EXTERNAL", element: { kind: "impact", label: "trust expectation management" }, qualifier: QUALIFIERS.BROADENS },
  { lens: "EXTERNAL", element: { kind: "pressure", pressureLabel: "incident communication expectation" }, qualifier: QUALIFIERS.DISTRIBUTED },
  { lens: "EXTERNAL", element: { kind: "narrative", section: "impactSurfaces" }, qualifier: QUALIFIERS.DISTRIBUTED },

  // Extended Lifespan — use significantly longer than initially
  // planned. Defensibility, audit preparation, resilience, and
  // recovery obligations persist; lifecycle rigidity persists; legal
  // / compliance reading and regulatory interpretation persist.
  { lens: "EXTENDED", element: { kind: "impact", label: "lifecycle rigidity" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "impact", label: "audit preparation effort" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "impact", label: "decision defensibility obligations" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "impact", label: "operational resilience obligations" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "impact", label: "recovery preparedness" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "function", id: "Legal / Compliance" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "pressure", pressureLabel: "regulatory interpretation load" }, qualifier: QUALIFIERS.PERSISTS },
  { lens: "EXTENDED", element: { kind: "narrative", section: "governanceDomains" }, qualifier: QUALIFIERS.PERSISTS },
];

// --- Presence checks --------------------------------------------------------

function governancePresent(payload: ExposurePayload, id: GovernanceDomainId): boolean {
  return payload.governanceDomains.some((d) => d.id === id);
}

function scrutinyPresent(payload: ExposurePayload, id: ScrutinyVectorId): boolean {
  return payload.scrutinyVectors.some((v) => v.id === id);
}

function impactPresent(
  payload: ExposurePayload,
  label: ImpactSurfaceLabel,
): boolean {
  return (
    payload.impactSurfaces.institutional.includes(label) ||
    payload.impactSurfaces.product.includes(label) ||
    payload.impactSurfaces.infrastructure.includes(label)
  );
}

function functionPresent(payload: ExposurePayload, id: FunctionAffectedId): boolean {
  return payload.functionsAffected.includes(id);
}

// A pressure label is "present" iff it appears in the rendered
// responsibility lens for this decision. The lens deriver is the
// authority on that, but recomputing it here would couple Phase 4 to
// Phase 3 internals. We instead conservatively gate pressure-label
// rules on the same upstream payload conditions the Phase 3 deriver
// uses, encoded inline below. This keeps the Phase 4 module from
// claiming a qualifier on a pressure that Phase 3 chose not to render.
function pressurePresent(
  entry: PortfolioEntry,
  payload: ExposurePayload,
  pressureLabel: string,
): boolean {
  const inScope = new Set(entry.inScopeCapabilityIds);
  switch (pressureLabel) {
    case "access monitoring obligation":
    case "incident response preparedness": {
      const identity = governancePresent(payload, "IDENTITY_ACCESS_OVERSIGHT");
      const infra =
        payload.impactSurfaces.infrastructure.includes("monitoring expectations") ||
        payload.impactSurfaces.infrastructure.includes("operational resilience obligations");
      return identity && infra;
    }
    case "user inquiry handling obligation":
    case "incident communication expectation":
      return inScope.has("CAP_EXTERNAL_ACCESS") && payload.impactSurfaces.product.length > 0;
    case "vendor assurance coordination expectation": {
      const ccs = new Set(entry.ecpConstraintCategories);
      return ccs.has("third_party") || ccs.has("integration");
    }
    case "regulatory interpretation load":
    case "assurance defensibility consideration":
      return (
        governancePresent(payload, "DATA_PROTECTION_PRIVACY") &&
        scrutinyPresent(payload, "REGULATORY_INQUIRY_PLAUSIBLE")
      );
    default:
      return false;
  }
}

// A narrative section is "present as a four-clause paragraph" iff the
// section's Phase 1 item list is non-empty AND the entry has at least
// one structural input (in-scope capabilities or ECP constraint
// categories) — i.e. the entry didn't route to PH2-EMPTY-B and the
// section didn't route to PH2-EMPTY-A. We check the same conditions
// here so a qualifier never lands on an empty-state sentence.
function narrativeSectionPresent(
  entry: PortfolioEntry,
  payload: ExposurePayload,
  section: NarrativeSectionKey,
): boolean {
  if (
    entry.inScopeCapabilityIds.length === 0 &&
    entry.ecpConstraintCategories.length === 0
  ) {
    return false;
  }
  switch (section) {
    case "governanceDomains":
      return payload.governanceDomains.length > 0;
    case "scrutinyVectors":
      return payload.scrutinyVectors.length > 0;
    case "impactSurfaces":
      return (
        payload.impactSurfaces.institutional.length +
          payload.impactSurfaces.product.length +
          payload.impactSurfaces.infrastructure.length >
        0
      );
    case "functionsAffected":
      return payload.functionsAffected.length > 0;
  }
}

// --- Element key resolution -------------------------------------------------

// Resolve an ElementRef to the visible label string the page uses as
// its render key. Centralised here so the page never has to know
// which Phase 1 id maps to which displayed label.
function visibleLabelFor(
  payload: ExposurePayload,
  ref: Extract<ElementRef, { kind: "governance" | "scrutiny" | "impact" | "function" | "pressure" }>,
): string | null {
  switch (ref.kind) {
    case "governance": {
      const found = payload.governanceDomains.find((d) => d.id === ref.id);
      return found ? found.label : null;
    }
    case "scrutiny": {
      const found = payload.scrutinyVectors.find((v) => v.id === ref.id);
      return found ? found.label : null;
    }
    case "impact":
      return ref.label;
    case "function":
      return ref.id;
    case "pressure":
      return ref.pressureLabel;
  }
}

// --- Public deriver ---------------------------------------------------------

export function deriveScenarioAnnotations(
  entry: PortfolioEntry,
  payload: ExposurePayload,
  lens: ScenarioLens,
): ScenarioAnnotations {
  const empty: ScenarioAnnotations = {
    itemQualifiers: {},
    narrativeQualifiers: {},
  };
  // PH4 — Baseline always returns an empty annotations object.
  if (lens === "BASELINE") return empty;

  const itemQualifiers: Record<string, string> = {};
  const narrativeQualifiers: Partial<Record<NarrativeSectionKey, string>> = {};

  for (const rule of RULES) {
    if (rule.lens !== lens) continue;

    if (rule.element.kind === "narrative") {
      if (narrativeSectionPresent(entry, payload, rule.element.section)) {
        // Per-emission re-assertion. Drift would already fail at
        // module load via ALL_QUALIFIERS, but pinning the contract at
        // the actual emission boundary mirrors the Phase 3 pattern.
        assertScenarioReadingLanguage(rule.qualifier);
        narrativeQualifiers[rule.element.section] = rule.qualifier;
      }
      continue;
    }

    let present = false;
    switch (rule.element.kind) {
      case "governance":
        present = governancePresent(payload, rule.element.id);
        break;
      case "scrutiny":
        present = scrutinyPresent(payload, rule.element.id);
        break;
      case "impact":
        present = impactPresent(payload, rule.element.label);
        break;
      case "function":
        present = functionPresent(payload, rule.element.id);
        break;
      case "pressure":
        present = pressurePresent(entry, payload, rule.element.pressureLabel);
        break;
    }
    if (!present) continue;

    const label = visibleLabelFor(payload, rule.element);
    if (label === null) continue;
    assertScenarioReadingLanguage(rule.qualifier);
    itemQualifiers[label] = rule.qualifier;
  }

  return { itemQualifiers, narrativeQualifiers };
}

// Convenience helper for the page: true iff the annotations object
// contains nothing to render. Used to decide whether to show the
// spec-locked empty-state sentence under a non-baseline lens.
export function annotationsAreEmpty(a: ScenarioAnnotations): boolean {
  return (
    Object.keys(a.itemQualifiers).length === 0 &&
    Object.keys(a.narrativeQualifiers).length === 0
  );
}

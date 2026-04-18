import type { ECPSectionDefinition } from "./types";

export const ECP_SECTION_DEFINITIONS: readonly ECPSectionDefinition[] = Object.freeze([
  {
    sectionId: "ECP_DECISION_REFERENCE",
    sectionOrder: 1,
    title: "Decision Reference & Authority",
    description:
      "Identifies the approved Architecture Decision Snapshot and the authority under which it was endorsed.",
    source: "ADS",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_APPROVED_SCOPE",
    sectionOrder: 2,
    title: "Approved Scope & Mandate",
    description:
      "Restates the capability scope sanctioned by the decision. Capabilities not listed as in-scope are not authorised under this profile.",
    source: "ADS",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_MANDATORY_LAYERS",
    sectionOrder: 3,
    title: "Mandatory Architectural Layers",
    description:
      "Lists the architectural layers that must be present. Implementations must address every layer below; omission is not permitted.",
    source: "GRAMMAR",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_CONSTRAINT_CATEGORIES",
    sectionOrder: 4,
    title: "Mandatory Constraint Categories",
    description:
      "Defines the categories of non-negotiable constraints that any implementation must satisfy. Specific control mechanisms, tools, and vendors are out of scope of this profile and remain delivery decisions.",
    source: "STATIC_TEXT",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_INTEGRATION_LEGACY",
    sectionOrder: 5,
    title: "Integration & Legacy Constraints",
    description:
      "Captures integration obligations and legacy boundary conditions that flow from the decision context.",
    source: "ADS",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_ACKNOWLEDGED_RISKS",
    sectionOrder: 6,
    title: "Acknowledged Architectural Risks",
    description:
      "Risks acknowledged at the time of decision approval. Implementation teams must operate with awareness of these risks.",
    source: "ADS",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_TRADEOFF_BOUNDARY",
    sectionOrder: 7,
    title: "Trade-Off Boundary Declaration",
    description:
      "Declares the locked trade-off posture under which the decision was approved. Departures from this posture are not authorised under this profile.",
    source: "ADS",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_CHANGE_CONTROL",
    sectionOrder: 8,
    title: "Change Control Clause",
    description:
      "Defines the only sanctioned route for revising this profile.",
    source: "STATIC_TEXT",
    placeholderPolicy: "REQUIRED",
  },
  {
    sectionId: "ECP_DISCLAIMER",
    sectionOrder: 9,
    title: "Disclaimer",
    description: "Limits of this artefact.",
    source: "STATIC_TEXT",
    placeholderPolicy: "REQUIRED",
  },
]);

export function validateSectionDefinitions(
  defs: readonly ECPSectionDefinition[],
): void {
  const orders = defs.map((d) => d.sectionOrder).sort((a, b) => a - b);
  const unique = new Set(orders);
  if (unique.size !== orders.length) {
    throw new Error("ECP section orders must be unique");
  }
  for (let i = 0; i < orders.length; i++) {
    if (orders[i] !== i + 1) {
      throw new Error(
        `ECP section orders must be contiguous starting at 1; got ${orders.join(",")}`,
      );
    }
  }
}

export const STATIC_TEXT = {
  constraintCategoriesIntro:
    "Implementations conducted under this profile must satisfy obligations in each of the constraint categories listed below. This profile names the categories only; the selection of specific mechanisms, practices, technologies, products, or vendors required to discharge those obligations is a delivery decision and is intentionally not constrained here.",
  constraintCategories: [
    "Security obligations are mandatory.",
    "Operations obligations are mandatory.",
    "Compliance obligations are mandatory.",
    "Data Protection obligations are mandatory.",
  ],
  changeControlClause:
    "This profile is immutable once issued. The only sanctioned route to revise it is to restart the decision process from Step 1 and re-approve a new Architecture Decision Snapshot. Any deviation from this profile that occurs without such re-approval is unsanctioned.",
  disclaimer:
    "This document is a system-generated governance artefact. It records the architectural envelope sanctioned by the named approving authority on the date shown. It does not name technologies, products, vendors, or practices, and it does not substitute for delivery planning or assurance activities.",
};

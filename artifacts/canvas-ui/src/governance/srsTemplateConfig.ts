// IEEE-830 SRS template configuration.
//
// Phase 1B (Task #144). Declarative description of the SRS document
// outline. The exporter (`ieeeSrsExporter.ts`) walks this config in
// declaration order and calls the generator named in
// `contentGenerator` for each subsection. Editing this file —
// reordering sections, adding subsections, swapping a generator key
// — is the only way to change the document shape. The exporter
// itself never hard-codes a section title or ordering.
//
// Vocabulary guard: every section title and subsection title in the
// default template is asserted against `assertAllGovernanceLanguage`
// at module load. A future template author who introduces a
// forbidden term ("recommended", "preferred", etc.) into a heading
// will fail the app-bundle load rather than producing a polluted
// document.
//
// The `metadata.standard` string is verbatim from the IEEE 830-1998
// standard name and is also asserted; it carries no forbidden term.

import { assertAllGovernanceLanguage } from "./staticTextGuard";

export type SrsGeneratorKey =
  | "purpose"
  | "scope"
  | "definitions"
  | "references"
  | "overview"
  | "productPerspective"
  | "productFunctions"
  | "userCharacteristics"
  | "constraints"
  | "assumptionsAndDependencies"
  | "externalInterfaces"
  | "systemFeatures"
  | "performanceRequirements"
  | "designConstraints"
  | "softwareSystemAttributes"
  | "otherRequirements"
  | "hardwareInterfaces"
  | "nonFunctional"
  | "glossary"
  | "tbdList";

export interface SrsSubsection {
  readonly title: string;
  readonly contentGenerator: SrsGeneratorKey;
  readonly fields?: readonly string[];
}

export interface SrsSection {
  readonly title: string;
  readonly subsections: readonly SrsSubsection[];
}

export interface SrsTemplateMetadata {
  readonly standard: string;
  readonly version: string;
  readonly lastUpdated: string;
}

// Title-page block. All labels rendered on the SRS title page —
// document title, field captions, status text, and revision-history
// table — are declared here so a template author can reorder, rename,
// or translate them without touching the exporter. The exporter is
// not allowed to hard-code any title-page label that is not derived
// from this block. Every string in this block is asserted against
// `assertAllGovernanceLanguage` at module load.
export interface SrsTitlePageConfig {
  readonly documentTitle: string;
  readonly fieldLabels: {
    readonly project: string;
    readonly standard: string;
    readonly templateVersion: string;
    readonly templateLastUpdated: string;
    readonly documentDate: string;
    readonly approvingAuthority: string;
    readonly status: string;
  };
  readonly statusLabels: {
    readonly draft: string;
    readonly frozen: string;
  };
  readonly pendingFreezeLabel: string;
  readonly revisionHistory: {
    readonly heading: string;
    readonly columns: readonly [string, string, string, string];
  };
}

export interface SrsTemplateConfig {
  readonly metadata: SrsTemplateMetadata;
  readonly titlePage: SrsTitlePageConfig;
  readonly sections: readonly SrsSection[];
}

export const DEFAULT_SRS_TEMPLATE: SrsTemplateConfig = Object.freeze({
  metadata: Object.freeze({
    standard: "IEEE 830-1998",
    version: "1.0.0",
    lastUpdated: "2026-04-29",
  }),
  titlePage: Object.freeze({
    documentTitle: "Software Requirements Specification",
    fieldLabels: Object.freeze({
      project: "Project",
      standard: "Standard",
      templateVersion: "Template Version",
      templateLastUpdated: "Template Last Updated",
      documentDate: "Document Date",
      approvingAuthority: "Approving Authority",
      status: "Status",
    }),
    statusLabels: Object.freeze({
      draft: "DRAFT",
      frozen: "FROZEN",
    }),
    pendingFreezeLabel: "Pending freeze",
    revisionHistory: Object.freeze({
      heading: "Revision History",
      columns: Object.freeze([
        "Version",
        "Date",
        "Frozen By",
        "Requirements",
      ]) as readonly [string, string, string, string],
    }),
  }),
  sections: Object.freeze([
    {
      title: "Introduction",
      subsections: Object.freeze([
        { title: "Purpose", contentGenerator: "purpose" },
        { title: "Scope", contentGenerator: "scope" },
        {
          title: "Definitions, Acronyms and Abbreviations",
          contentGenerator: "definitions",
        },
        { title: "References", contentGenerator: "references" },
        { title: "Overview", contentGenerator: "overview" },
      ]),
    },
    {
      title: "Overall Description",
      subsections: Object.freeze([
        {
          title: "Product Perspective",
          contentGenerator: "productPerspective",
        },
        { title: "Product Functions", contentGenerator: "productFunctions" },
        {
          title: "User Characteristics",
          contentGenerator: "userCharacteristics",
        },
        { title: "Constraints", contentGenerator: "constraints" },
        {
          title: "Assumptions and Dependencies",
          contentGenerator: "assumptionsAndDependencies",
        },
      ]),
    },
    {
      title: "Specific Requirements",
      subsections: Object.freeze([
        {
          title: "External Interface Requirements",
          contentGenerator: "externalInterfaces",
        },
        { title: "System Features", contentGenerator: "systemFeatures" },
        {
          title: "Performance Requirements",
          contentGenerator: "performanceRequirements",
        },
        { title: "Design Constraints", contentGenerator: "designConstraints" },
        {
          title: "Software System Attributes",
          contentGenerator: "softwareSystemAttributes",
        },
        {
          title: "Other Requirements",
          contentGenerator: "otherRequirements",
        },
        {
          title: "Hardware Interfaces",
          contentGenerator: "hardwareInterfaces",
        },
        {
          title: "Non-Functional Requirements",
          contentGenerator: "nonFunctional",
        },
      ]),
    },
    {
      title: "Appendices",
      subsections: Object.freeze([
        { title: "Glossary", contentGenerator: "glossary" },
        { title: "Outstanding Items (TBD)", contentGenerator: "tbdList" },
      ]),
    },
  ]) as readonly SrsSection[],
});

// --- Module-load vocabulary guard --------------------------------------------
//
// Every fixed string a template author can place in the config —
// section titles, subsection titles, and every title-page label —
// is asserted at module load. A future template author who introduces
// a forbidden term anywhere in the config fails the bundle load
// rather than producing a polluted document.
function collectStaticTitles(cfg: SrsTemplateConfig): string[] {
  const out: string[] = [cfg.metadata.standard];
  for (const section of cfg.sections) {
    out.push(section.title);
    for (const sub of section.subsections) {
      out.push(sub.title);
    }
  }
  const tp = cfg.titlePage;
  out.push(
    tp.documentTitle,
    tp.fieldLabels.project,
    tp.fieldLabels.standard,
    tp.fieldLabels.templateVersion,
    tp.fieldLabels.templateLastUpdated,
    tp.fieldLabels.documentDate,
    tp.fieldLabels.approvingAuthority,
    tp.fieldLabels.status,
    tp.statusLabels.draft,
    tp.statusLabels.frozen,
    tp.pendingFreezeLabel,
    tp.revisionHistory.heading,
    ...tp.revisionHistory.columns,
  );
  return out;
}

assertAllGovernanceLanguage(collectStaticTitles(DEFAULT_SRS_TEMPLATE));

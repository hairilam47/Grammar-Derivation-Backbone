import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
  ArchitectureResult,
  Component,
  Risk,
} from "@workspace/architecture-grammar";

export interface ProjectMetadata {
  projectName: string;
  approvingAuthority: string;
}

export type ADSSectionId =
  | "ADS_DECISION_CONTEXT"
  | "ADS_CAPABILITY_SCOPE"
  | "ADS_DERIVED_ARCHITECTURE"
  | "ADS_RISK_ACKNOWLEDGEMENT"
  | "ADS_TRADEOFF_SUMMARY"
  | "ADS_DECISION_RECORD";

export interface ADSContextSection {
  sectionId: "ADS_DECISION_CONTEXT";
  sectionOrder: 1;
  title: "Decision Context";
  context: OrganisationContext;
}

export interface ADSCapabilityScopeSection {
  sectionId: "ADS_CAPABILITY_SCOPE";
  sectionOrder: 2;
  title: "Capability Scope Declaration";
  inScope: { id: string; name: string }[];
  deferred: { id: string; name: string }[];
  outOfScope: { id: string; name: string }[];
}

export interface ADSDerivedArchitectureSection {
  sectionId: "ADS_DERIVED_ARCHITECTURE";
  sectionOrder: 3;
  title: "Derived Architecture";
  layers: { layer: string; components: Component[] }[];
}

export interface ADSRiskSection {
  sectionId: "ADS_RISK_ACKNOWLEDGEMENT";
  sectionOrder: 4;
  title: "Risk Acknowledgement";
  risks: Risk[];
}

export interface ADSTradeOffSection {
  sectionId: "ADS_TRADEOFF_SUMMARY";
  sectionOrder: 5;
  title: "Trade-Off Exploration Summary";
  baseline: TradeOffSettings;
}

export interface ADSDecisionRecordSection {
  sectionId: "ADS_DECISION_RECORD";
  sectionOrder: 6;
  title: "Decision Record";
  projectName: string;
  approvingAuthority: string;
  date: string;
  version: string;
  adsId: string;
}

export type ADSSection =
  | ADSContextSection
  | ADSCapabilityScopeSection
  | ADSDerivedArchitectureSection
  | ADSRiskSection
  | ADSTradeOffSection
  | ADSDecisionRecordSection;

export interface ADS {
  adsId: string;
  version: string;
  date: string;
  projectName: string;
  approvingAuthority: string;
  sections: ADSSection[];
  context: OrganisationContext;
  selections: CapabilitySelection[];
  baselineTradeOffs: TradeOffSettings;
  result: ArchitectureResult;
}

export type ECPSourceKind = "ADS" | "GRAMMAR" | "STATIC_TEXT";

export interface ECPSectionDefinition {
  sectionId: string;
  sectionOrder: number;
  title: string;
  description?: string;
  source: ECPSourceKind;
  placeholderPolicy: "REQUIRED" | "OPTIONAL";
}

export interface ECPResolvedSection extends ECPSectionDefinition {
  paragraphs: string[];
  bullets?: string[];
}

export interface ECP {
  adsId: string;
  version: string;
  date: string;
  projectName: string;
  approvingAuthority: string;
  sections: ECPResolvedSection[];
}

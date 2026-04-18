export type OrganisationType = "Government" | "Enterprise";
export type SensitivityLevel = "Low" | "Medium" | "High";
export type SystemIntent = "LegacyReplacement" | "NewCapability";

export interface OrganisationContext {
  organisationType: OrganisationType;
  sensitivityLevel: SensitivityLevel;
  systemIntent: SystemIntent;
  expectedLifespanYears: number;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
}

export type ComponentLayer =
  | "UI"
  | "Application"
  | "Data"
  | "Integration"
  | "Security"
  | "Operations";

export interface Component {
  id: string;
  name: string;
  layer: ComponentLayer;
  complexityWeight: number;
  operationalImpact: number;
}

export type CapabilityStatus = "IN_SCOPE" | "DEFERRED" | "OUT_OF_SCOPE";

export interface CapabilitySelection {
  capabilityId: string;
  status: CapabilityStatus;
}

export type ArchitectureStyle = "Simple" | "Distributed";
export type DeploymentModel = "OnPrem" | "Cloud";
export type ScopeLevel = "Minimal" | "Full";

export interface TradeOffSettings {
  architectureStyle: ArchitectureStyle;
  deploymentModel: DeploymentModel;
  scopeLevel: ScopeLevel;
}

export type RiskCategory = "Security" | "Compliance" | "Operational" | "Complexity";
export type RiskLevel = "GREEN" | "AMBER" | "RED";

export interface Risk {
  category: RiskCategory;
  level: RiskLevel;
  reason: string;
}

export interface Indicators {
  complexityScore: number;
  operationalOverheadScore: number;
  changeCostLaterScore: number;
}

export interface ArchitectureResult {
  requiredComponents: Component[];
  risks: Risk[];
  indicators: Indicators;
}

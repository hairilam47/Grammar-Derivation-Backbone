export type {
  OrganisationContext,
  OrganisationType,
  SensitivityLevel,
  SystemIntent,
  Capability,
  Component,
  ComponentLayer,
  CapabilitySelection,
  CapabilityStatus,
  TradeOffSettings,
  ArchitectureStyle,
  DeploymentModel,
  ScopeLevel,
  Risk,
  RiskCategory,
  RiskLevel,
  Indicators,
  ArchitectureResult,
} from "./types.js";

export { CAPABILITIES, getCapabilityById } from "./capabilities.js";
export { COMPONENTS, getComponentById } from "./components.js";
export { deriveArchitecture } from "./derive.js";

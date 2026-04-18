import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
  ArchitectureResult,
} from "./types.js";
import { getComponentById } from "./components.js";
import {
  applyRuleA,
  applyRuleB,
  applyRuleC,
  applyRuleD,
  detectRisks,
} from "./rules.js";

export function deriveArchitecture(
  context: OrganisationContext,
  capabilitySelections: CapabilitySelection[],
  tradeOffs: TradeOffSettings,
): ArchitectureResult {
  const afterRuleA = applyRuleA(capabilitySelections);
  const afterRuleB = applyRuleB(afterRuleA);
  const afterRuleC = applyRuleC(context, afterRuleB);

  const afterFinalRuleB = applyRuleB(afterRuleC);

  const resolvedComponents = Array.from(afterFinalRuleB)
    .map((id) => getComponentById(id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const risks = detectRisks(context, afterFinalRuleB);
  const indicators = applyRuleD(resolvedComponents, tradeOffs);

  return {
    requiredComponents: resolvedComponents,
    risks,
    indicators,
  };
}

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
  // Step 1 — Declared intent: what the capability selections require
  const afterRuleA = applyRuleA(capabilitySelections);

  // Step 2 — Risk detection snapshot: evaluate gaps BEFORE enforcement fills them
  const risks = detectRisks(context, afterRuleA);

  // Step 3 — Dependency closure on declared set
  const afterRuleB = applyRuleB(afterRuleA);

  // Step 4 — Context enforcement: mandatory components regardless of selections
  const afterRuleC = applyRuleC(context, afterRuleB);

  // Step 5 — Dependency closure again after enforcement may have added components
  const afterFinalRuleB = applyRuleB(afterRuleC);

  // Step 6 — Trade-off indicators computed from the fully resolved component set
  const resolvedComponents = Array.from(afterFinalRuleB)
    .map((id) => getComponentById(id))
    .sort((a, b) => a.id.localeCompare(b.id));

  const indicators = applyRuleD(resolvedComponents, tradeOffs);

  return {
    requiredComponents: resolvedComponents,
    risks,
    indicators,
  };
}

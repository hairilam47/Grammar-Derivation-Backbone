import {
  deriveArchitecture,
  CAPABILITIES,
  COMPONENTS,
} from "@workspace/architecture-grammar";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
} from "@workspace/architecture-grammar";

console.log("=== Architecture Grammar Engine — Example Invocations ===\n");
console.log(`Capabilities (${CAPABILITIES.length} total):`);
for (const cap of CAPABILITIES) {
  console.log(`  ${cap.id}: ${cap.name}`);
}
console.log(`\nComponents (${COMPONENTS.length} total):`);
for (const comp of COMPONENTS) {
  console.log(`  ${comp.id}: ${comp.name} [${comp.layer}]`);
}
console.log("\n---\n");

const SCENARIO_1_CONTEXT: OrganisationContext = {
  organisationType: "Government",
  sensitivityLevel: "High",
  systemIntent: "LegacyReplacement",
  expectedLifespanYears: 10,
};

const SCENARIO_1_SELECTIONS: CapabilitySelection[] = [
  { capabilityId: "CAP_EXTERNAL_ACCESS", status: "IN_SCOPE" },
  { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
  { capabilityId: "CAP_CASE_MANAGEMENT", status: "IN_SCOPE" },
  { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
  { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "DEFERRED" },
  { capabilityId: "CAP_REPORTING_ANALYTICS", status: "OUT_OF_SCOPE" },
  { capabilityId: "CAP_AUDIT_COMPLIANCE", status: "IN_SCOPE" },
];

const SCENARIO_1_TRADEOFFS: TradeOffSettings = {
  architectureStyle: "Distributed",
  deploymentModel: "OnPrem",
  scopeLevel: "Full",
};

console.log("=== Scenario 1: Government / High Sensitivity / Legacy Replacement ===");
console.log("Exercises: Rule A (External/Admin/Case/Document/Audit), Rule B (dependencies),");
console.log("           Rule C (Gov+High context), Rule D (Distributed+OnPrem+Full)");
const result1 = deriveArchitecture(
  SCENARIO_1_CONTEXT,
  SCENARIO_1_SELECTIONS,
  SCENARIO_1_TRADEOFFS,
);
console.log(JSON.stringify(result1, null, 2));

console.log("\n---\n");

const SCENARIO_2_CONTEXT: OrganisationContext = {
  organisationType: "Enterprise",
  sensitivityLevel: "Medium",
  systemIntent: "NewCapability",
  expectedLifespanYears: 3,
};

const SCENARIO_2_SELECTIONS: CapabilitySelection[] = [
  { capabilityId: "CAP_EXTERNAL_ACCESS", status: "IN_SCOPE" },
  { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
  { capabilityId: "CAP_CASE_MANAGEMENT", status: "OUT_OF_SCOPE" },
  { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "OUT_OF_SCOPE" },
  { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "OUT_OF_SCOPE" },
  { capabilityId: "CAP_REPORTING_ANALYTICS", status: "IN_SCOPE" },
  { capabilityId: "CAP_AUDIT_COMPLIANCE", status: "DEFERRED" },
];

const SCENARIO_2_TRADEOFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

console.log("=== Scenario 2: Enterprise / Medium Sensitivity / New Capability ===");
console.log("Exercises: Rule A (External/Admin/Reporting), Rule B (component deps),");
console.log("           Rule C (Medium sensitivity context), Rule D (Simple+Cloud+Minimal)");
const result2 = deriveArchitecture(
  SCENARIO_2_CONTEXT,
  SCENARIO_2_SELECTIONS,
  SCENARIO_2_TRADEOFFS,
);
console.log(JSON.stringify(result2, null, 2));

console.log("\n---\n");

const SCENARIO_3_CONTEXT: OrganisationContext = {
  organisationType: "Government",
  sensitivityLevel: "Low",
  systemIntent: "NewCapability",
  expectedLifespanYears: 7,
};

const SCENARIO_3_SELECTIONS: CapabilitySelection[] = [
  { capabilityId: "CAP_EXTERNAL_ACCESS", status: "OUT_OF_SCOPE" },
  { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
  { capabilityId: "CAP_CASE_MANAGEMENT", status: "IN_SCOPE" },
  { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
  { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "IN_SCOPE" },
  { capabilityId: "CAP_REPORTING_ANALYTICS", status: "IN_SCOPE" },
  { capabilityId: "CAP_AUDIT_COMPLIANCE", status: "DEFERRED" },
];

const SCENARIO_3_TRADEOFFS: TradeOffSettings = {
  architectureStyle: "Distributed",
  deploymentModel: "Cloud",
  scopeLevel: "Full",
};

console.log("=== Scenario 3: Government / Low Sensitivity / Long-lived Internal System ===");
console.log("Exercises: Rule A (broad internal capability set), Rule B (transitive deps),");
console.log("           Rule C (Gov context + long lifespan), Rule D (Distributed+Cloud+Full)");
const result3 = deriveArchitecture(
  SCENARIO_3_CONTEXT,
  SCENARIO_3_SELECTIONS,
  SCENARIO_3_TRADEOFFS,
);
console.log(JSON.stringify(result3, null, 2));

console.log("\n=== Determinism check: running Scenario 1 twice and comparing outputs ===");
const result1b = deriveArchitecture(
  SCENARIO_1_CONTEXT,
  SCENARIO_1_SELECTIONS,
  SCENARIO_1_TRADEOFFS,
);
const match = JSON.stringify(result1) === JSON.stringify(result1b);
console.log(`Same input → same output: ${match ? "PASS ✓" : "FAIL ✗"}`);

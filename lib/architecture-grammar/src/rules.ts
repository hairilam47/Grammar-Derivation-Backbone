import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
  Component,
  Risk,
  Indicators,
} from "./types.js";
import { getComponentById } from "./components.js";

type ComponentId = string;

const DATA_STORE_IDS: readonly ComponentId[] = [
  "COMP_RELATIONAL_STORE",
  "COMP_DOCUMENT_REPO",
  "COMP_AUDIT_STORE",
];

const RULE_A: Record<string, ComponentId[]> = {
  CAP_EXTERNAL_ACCESS: [
    "COMP_EXTERNAL_PORTAL",
    "COMP_AUTH_SERVICE",
    "COMP_API_GATEWAY",
    "COMP_AUDIT_LOGGING",
  ],
  CAP_INTERNAL_ADMIN: [
    "COMP_INTERNAL_PORTAL",
    "COMP_AUTH_SERVICE",
    "COMP_AUTHZ_ACCESS",
    "COMP_AUDIT_LOGGING",
  ],
  CAP_CASE_MANAGEMENT: [
    "COMP_APP_SERVICE",
    "COMP_RELATIONAL_STORE",
    "COMP_AUDIT_LOGGING",
  ],
  CAP_DOCUMENT_MANAGEMENT: [
    "COMP_DOCUMENT_REPO",
    "COMP_APP_SERVICE",
  ],
  CAP_WORKFLOW_APPROVAL: [
    "COMP_WORKFLOW_ENGINE",
    "COMP_APP_SERVICE",
  ],
  CAP_REPORTING_ANALYTICS: [
    "COMP_APP_SERVICE",
    "COMP_RELATIONAL_STORE",
  ],
  CAP_AUDIT_COMPLIANCE: [
    "COMP_AUDIT_STORE",
    "COMP_AUDIT_LOGGING",
    "COMP_ENCRYPTION",
  ],
};

const RULE_B: Record<ComponentId, ComponentId[]> = {
  COMP_EXTERNAL_PORTAL: ["COMP_AUTH_SERVICE", "COMP_AUTHZ_ACCESS"],
  COMP_INTERNAL_PORTAL: ["COMP_AUTH_SERVICE", "COMP_AUTHZ_ACCESS"],
  COMP_APP_SERVICE: ["COMP_API_INTERFACE"],
  COMP_API_INTERFACE: ["COMP_API_GATEWAY"],
  COMP_WORKFLOW_ENGINE: ["COMP_RULES_ENGINE"],
  COMP_RELATIONAL_STORE: ["COMP_BACKUP_DR"],
  COMP_DOCUMENT_REPO: ["COMP_BACKUP_DR"],
  COMP_AUDIT_STORE: ["COMP_BACKUP_DR"],
};

export function applyRuleA(selections: CapabilitySelection[]): Set<ComponentId> {
  const required = new Set<ComponentId>();
  for (const sel of selections) {
    if (sel.status !== "IN_SCOPE") {
      continue;
    }
    const componentIds = RULE_A[sel.capabilityId];
    if (componentIds) {
      for (const id of componentIds) {
        required.add(id);
      }
    }
  }
  return required;
}

export function applyRuleB(initial: Set<ComponentId>): Set<ComponentId> {
  const resolved = new Set<ComponentId>(initial);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(resolved)) {
      const deps = RULE_B[id];
      if (deps) {
        for (const dep of deps) {
          if (!resolved.has(dep)) {
            resolved.add(dep);
            changed = true;
          }
        }
      }
    }
  }
  return resolved;
}

export function applyRuleC(
  context: OrganisationContext,
  current: Set<ComponentId>,
): Set<ComponentId> {
  const result = new Set<ComponentId>(current);

  if (context.organisationType === "Government" && context.sensitivityLevel === "High") {
    result.add("COMP_AUDIT_STORE");
    result.add("COMP_ENCRYPTION");
    result.add("COMP_AUDIT_LOGGING");
  }

  if (context.sensitivityLevel === "High") {
    result.add("COMP_ENCRYPTION");
    result.add("COMP_AUDIT_LOGGING");
  }

  if (context.sensitivityLevel === "Medium" || context.sensitivityLevel === "High") {
    result.add("COMP_AUTHZ_ACCESS");
  }

  if (context.organisationType === "Government") {
    result.add("COMP_MONITORING");
    result.add("COMP_AUDIT_LOGGING");
  }

  if (context.expectedLifespanYears >= 5) {
    result.add("COMP_MONITORING");
    result.add("COMP_BACKUP_DR");
  }

  return result;
}

const TRADE_OFF_MODIFIERS: {
  architectureStyle: Record<string, { complexity: number; operational: number; changeCost: number }>;
  deploymentModel: Record<string, { complexity: number; operational: number; changeCost: number }>;
  scopeLevel: Record<string, { complexity: number; operational: number; changeCost: number }>;
} = {
  architectureStyle: {
    Simple: { complexity: 0, operational: 0, changeCost: 2 },
    Distributed: { complexity: 3, operational: 2, changeCost: -1 },
  },
  deploymentModel: {
    OnPrem: { complexity: 1, operational: 2, changeCost: 2 },
    Cloud: { complexity: 0, operational: 0, changeCost: 0 },
  },
  scopeLevel: {
    Minimal: { complexity: 0, operational: 0, changeCost: 1 },
    Full: { complexity: 2, operational: 1, changeCost: 0 },
  },
};

export function applyRuleD(
  resolvedComponents: Component[],
  tradeOffs: TradeOffSettings,
): Indicators {
  const baseComplexity = resolvedComponents.reduce(
    (sum, c) => sum + c.complexityWeight,
    0,
  );
  const baseOperational = resolvedComponents.reduce(
    (sum, c) => sum + c.operationalImpact,
    0,
  );

  const styleModifier = TRADE_OFF_MODIFIERS.architectureStyle[tradeOffs.architectureStyle];
  const deployModifier = TRADE_OFF_MODIFIERS.deploymentModel[tradeOffs.deploymentModel];
  const scopeModifier = TRADE_OFF_MODIFIERS.scopeLevel[tradeOffs.scopeLevel];

  const complexityScore =
    baseComplexity +
    styleModifier.complexity +
    deployModifier.complexity +
    scopeModifier.complexity;

  const operationalOverheadScore =
    baseOperational +
    styleModifier.operational +
    deployModifier.operational +
    scopeModifier.operational;

  const changeCostLaterScore =
    styleModifier.changeCost +
    deployModifier.changeCost +
    scopeModifier.changeCost;

  return {
    complexityScore,
    operationalOverheadScore,
    changeCostLaterScore,
  };
}

export function detectRisks(
  context: OrganisationContext,
  resolvedIds: Set<ComponentId>,
): Risk[] {
  const risks: Risk[] = [];

  if (
    context.sensitivityLevel === "High" &&
    !resolvedIds.has("COMP_AUDIT_LOGGING")
  ) {
    risks.push({
      category: "Security",
      level: "RED",
      reason:
        "High-sensitivity system is missing Audit Logging Service. All access and changes must be logged for regulatory accountability.",
    });
  }

  if (
    resolvedIds.has("COMP_EXTERNAL_PORTAL") &&
    !resolvedIds.has("COMP_AUTH_SERVICE")
  ) {
    risks.push({
      category: "Security",
      level: "RED",
      reason:
        "External User Portal is present without an Authentication Service. Public-facing interfaces require mandatory identity verification.",
    });
  }

  for (const storeId of DATA_STORE_IDS) {
    if (resolvedIds.has(storeId) && !resolvedIds.has("COMP_BACKUP_DR")) {
      const store = getComponentById(storeId);
      risks.push({
        category: "Operational",
        level: "AMBER",
        reason: `${store.name} is present without Backup & Disaster Recovery. Data loss is a material risk if the store is not protected.`,
      });
    }
  }

  if (
    context.organisationType === "Government" &&
    !resolvedIds.has("COMP_MONITORING")
  ) {
    risks.push({
      category: "Compliance",
      level: "AMBER",
      reason:
        "Government systems are expected to maintain operational visibility. Monitoring & Observability is absent, which may violate service continuity obligations.",
    });
  }

  if (
    context.sensitivityLevel === "High" &&
    !resolvedIds.has("COMP_ENCRYPTION")
  ) {
    risks.push({
      category: "Security",
      level: "RED",
      reason:
        "High-sensitivity system lacks Encryption & Key Management. Data at rest and in transit must be cryptographically protected.",
    });
  }

  if (
    context.organisationType === "Government" &&
    context.sensitivityLevel === "High" &&
    !resolvedIds.has("COMP_AUDIT_STORE")
  ) {
    risks.push({
      category: "Compliance",
      level: "RED",
      reason:
        "Government systems at High sensitivity require an Immutable Audit Store to satisfy legal and regulatory non-repudiation requirements.",
    });
  }

  const componentCount = resolvedIds.size;
  if (componentCount >= 12) {
    risks.push({
      category: "Complexity",
      level: "AMBER",
      reason: `The derived architecture requires ${componentCount} components. High component count increases integration complexity and operational overhead.`,
    });
  }

  return risks;
}

export { DATA_STORE_IDS, RULE_A, RULE_B };

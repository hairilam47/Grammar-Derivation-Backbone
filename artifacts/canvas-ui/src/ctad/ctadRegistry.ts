// CTAD — Conceptual Technology Architecture Design parameter registry.
//
// Pure data: the four section groupings, every parameter listed in
// the CTAD brief, and each parameter's option set. The registry is
// frozen at module load and every label and option string is
// asserted against the CTAD vocabulary tier so a forbidden word
// (approve, recommend, best, score, etc.) cannot be introduced
// without failing the bundle.

import { assertAllCtadLanguage } from "@/governance/staticTextGuard";

export const CTAD_SCHEMA_VERSION = "ctad-1.0" as const;

export type CtadSectionId =
  | "infrastructure"
  | "application"
  | "integration"
  | "crossCutting";

export type CtadParamKind = "single" | "multi";

export interface CtadParameter {
  readonly id: string;
  readonly label: string;
  readonly kind: CtadParamKind;
  readonly options: readonly string[];
}

export interface CtadSection {
  readonly id: CtadSectionId;
  readonly label: string;
  readonly parameters: readonly CtadParameter[];
}

const SECTIONS_RAW: readonly CtadSection[] = [
  {
    id: "infrastructure",
    label: "Infrastructure (Conceptual)",
    parameters: [
      {
        id: "hostingModel",
        label: "Hosting model",
        kind: "single",
        options: ["On-prem", "Private", "Public", "Hybrid"],
      },
      {
        id: "deploymentTopology",
        label: "Deployment topology",
        kind: "single",
        options: ["Single-tier", "Multi-tier", "Distributed"],
      },
      {
        id: "serverScaleClass",
        label: "Server scale class",
        kind: "single",
        options: ["Small", "Medium", "Large", "Elastic"],
      },
      {
        id: "databaseClass",
        label: "Database class",
        kind: "single",
        options: ["Relational", "Document", "Key-Value", "Graph", "Time-series"],
      },
      {
        id: "dataDistribution",
        label: "Data distribution",
        kind: "single",
        options: ["Centralised", "Replicated", "Sharded"],
      },
      {
        id: "networkTopology",
        label: "Network topology",
        kind: "single",
        options: ["Flat", "Segmented", "Zero-trust"],
      },
      {
        id: "networkComponents",
        label: "Network components present",
        kind: "multi",
        options: ["Router", "Switch", "Firewall", "Load Balancer"],
      },
      {
        id: "osClass",
        label: "OS class",
        kind: "single",
        options: ["Linux", "Windows", "Mixed"],
      },
      {
        id: "virtualisationClass",
        label: "Virtualisation class",
        kind: "single",
        options: ["VM", "Container", "Mixed"],
      },
      {
        id: "identityModel",
        label: "Identity model",
        kind: "single",
        options: ["Centralised", "Federated"],
      },
      {
        id: "perimeterModel",
        label: "Perimeter model",
        kind: "single",
        options: ["Perimeter-based", "Zero-trust"],
      },
      {
        id: "cryptographyScope",
        label: "Cryptography scope",
        kind: "single",
        options: ["At-rest", "In-transit", "Both"],
      },
      {
        id: "monitoringClass",
        label: "Monitoring class",
        kind: "single",
        options: ["Basic", "Centralised", "Observability"],
      },
      {
        id: "managementModel",
        label: "Management model",
        kind: "single",
        options: ["Manual", "Automated", "Policy-driven"],
      },
    ],
  },
  {
    id: "application",
    label: "Application & Platform",
    parameters: [
      {
        id: "applicationStyle",
        label: "Application style",
        kind: "single",
        options: ["Monolith", "Modular", "Microservices", "Event-driven"],
      },
      {
        id: "runtimeCategory",
        label: "Runtime category",
        kind: "single",
        options: ["Managed", "Self-hosted"],
      },
      {
        id: "backendFrameworkClass",
        label: "Backend framework class",
        kind: "single",
        options: ["JVM", ".NET", "Node", "Python", "Mixed"],
      },
      {
        id: "frontendArchitecture",
        label: "Frontend architecture",
        kind: "single",
        options: ["Server-rendered", "SPA", "Hybrid"],
      },
      {
        id: "frontendFrameworkClass",
        label: "Frontend framework class",
        kind: "single",
        options: ["React-like", "Vue-like", "Angular-like", "Other"],
      },
    ],
  },
  {
    id: "integration",
    label: "Integration",
    parameters: [
      {
        id: "integrationPattern",
        label: "Integration pattern",
        kind: "single",
        options: ["API", "Event", "Batch", "Hybrid"],
      },
      {
        id: "messageExchange",
        label: "Message exchange",
        kind: "single",
        options: ["Synchronous", "Asynchronous"],
      },
      {
        id: "boundaryScope",
        label: "Boundary scope",
        kind: "single",
        options: ["Internal", "External", "Both"],
      },
    ],
  },
  {
    id: "crossCutting",
    label: "Cross-Cutting",
    parameters: [
      {
        id: "configurationManagement",
        label: "Configuration management",
        kind: "single",
        options: ["Centralised", "Decentralised"],
      },
      {
        id: "secretsHandling",
        label: "Secrets handling",
        kind: "single",
        options: ["Local", "Vault-based", "Managed Service"],
      },
      {
        id: "resiliencePosture",
        label: "Resilience posture",
        kind: "single",
        options: ["Basic", "Redundant", "Multi-region"],
      },
    ],
  },
];

export const NOT_SPECIFIED_LABEL = "Not specified" as const;

// Vocabulary guard at module load: every label and option string
// the registry will render is checked against the CTAD vocabulary
// tier. A forbidden token throws on import, failing the bundle.
const ALL_REGISTRY_TEXT: string[] = [NOT_SPECIFIED_LABEL];
for (const section of SECTIONS_RAW) {
  ALL_REGISTRY_TEXT.push(section.label);
  for (const param of section.parameters) {
    ALL_REGISTRY_TEXT.push(param.label);
    for (const option of param.options) {
      ALL_REGISTRY_TEXT.push(option);
    }
  }
}
assertAllCtadLanguage(ALL_REGISTRY_TEXT);

// Freeze the registry to enforce the constitutional guarantee that
// the CTAD parameter set is a build-time constant.
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export const CTAD_SECTIONS: readonly CtadSection[] = deepFreeze(SECTIONS_RAW);

export const CTAD_REGISTRY = deepFreeze({
  schemaVersion: CTAD_SCHEMA_VERSION,
  sections: CTAD_SECTIONS,
} as const);

// Lookup helpers ---------------------------------------------------

export function findParam(paramId: string): CtadParameter | undefined {
  for (const s of CTAD_SECTIONS) {
    const p = s.parameters.find((q) => q.id === paramId);
    if (p) return p;
  }
  return undefined;
}

export function findSectionForParam(
  paramId: string,
): CtadSectionId | undefined {
  for (const s of CTAD_SECTIONS) {
    if (s.parameters.some((q) => q.id === paramId)) return s.id;
  }
  return undefined;
}

export const ALL_PARAM_IDS: readonly string[] = (() => {
  const ids: string[] = [];
  for (const s of CTAD_SECTIONS) for (const p of s.parameters) ids.push(p.id);
  return Object.freeze(ids);
})();

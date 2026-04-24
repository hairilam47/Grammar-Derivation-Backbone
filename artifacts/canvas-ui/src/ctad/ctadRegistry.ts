// CTAD — Conceptual Technology Architecture Design parameter registry.
//
// Pure data: the four section groupings, every parameter listed in
// the CTAD brief, and each parameter's option set. The registry is
// frozen at module load and every label and option string is
// asserted against the CTAD vocabulary tier so a forbidden word
// (approve, recommend, best, score, etc.) cannot be introduced
// without failing the bundle.

import { assertAllCtadLanguage } from "@/governance/staticTextGuard";

// Bumped to "ctad-1.2" in Phase 1 of the ADC ↔ CTAD decoupling
// effort. The structural change is the addition of an optional
// top-level `architectures` map to the persisted document so a
// CTAD workspace can exist independently of any frozen ADC
// decision. The ctad-1.1 → ctad-1.2 migration is deterministic and
// read-time: a v1.1 document is materialised as v1.2 with
// `architectures: {}` and existing `bindings` untouched. The
// canonical schema lineage so far:
//   ctad-1.0 → ctad-1.1 (Task #77, first-class environments)
//   ctad-1.1 → ctad-1.2 (Task #78, first-class architectures)
//
// Architectural note — environments are an ADJACENT first-class
// concept, NOT a sixth member of CTAD_SECTIONS. This is deliberate:
//   * Sections are categorical PARAMETER groups (each with single /
//     multi-select options drawn from a fixed vocabulary). An
//     environment is a NAMED RECORD `{ id, name, kind, hostingModel }`
//     authored by the user — its shape does not fit the section /
//     parameter / option grammar that section invariants pin.
//   * Keeping environments out of CTAD_SECTIONS avoids breaking the
//     "exactly five canonical sections" grammar invariant and keeps
//     CTAD_STATE serialisation stable for the existing five blocks.
//   * Downstream consumers read environments via the dedicated
//     `environments` field on CtadStateExport (parallel to the five
//     section blocks) and via dedicated store CRUD functions, never
//     through findParam / CTAD_REGISTRY traversal.
export const CTAD_SCHEMA_VERSION = "ctad-1.2" as const;
export const CTAD_PRIOR_SCHEMA_VERSIONS = ["ctad-1.0", "ctad-1.1"] as const;

// First-class environment definition (Task #77). Vendor-neutral by
// construction: `kind` and `hostingModel` use the same generic
// vocabularies that already gate every other CTAD label via the
// CTAD vocabulary tier. The store enforces option membership at
// write time; the compiler treats both fields as opaque labels.
export const ENVIRONMENT_KIND_OPTIONS: readonly string[] = Object.freeze([
  "Production",
  "Staging",
  "Development",
  "Testing",
  "Disaster Recovery",
]);

// Reuses the infrastructure hostingModel options so authored
// environments speak the same hosting vocabulary as the
// infrastructure section. Kept as its own constant so the
// environments concept does not depend on the section registry's
// internal indexing.
export const ENVIRONMENT_HOSTING_MODEL_OPTIONS: readonly string[] = Object.freeze([
  "On-prem",
  "Private",
  "Public",
  "Hybrid",
]);

export interface CtadEnvironmentDef {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly hostingModel: string | null;
}

// Stable identifier pattern for env ids (matches CTAD param ids).
const ENV_ID_PATTERN = /^[a-z][a-zA-Z0-9-]*$/;
export function isValidEnvironmentId(id: string): boolean {
  return ENV_ID_PATTERN.test(id);
}
export function isValidEnvironmentKind(kind: string): boolean {
  return ENVIRONMENT_KIND_OPTIONS.includes(kind);
}
export function isValidEnvironmentHostingModel(hosting: string | null): boolean {
  return hosting === null || ENVIRONMENT_HOSTING_MODEL_OPTIONS.includes(hosting);
}

export type CtadSectionId =
  | "infrastructure"
  | "application"
  | "integration"
  | "crossCutting"
  | "ops";

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
  {
    id: "ops",
    label: "Ops & Lifecycle",
    parameters: [
      {
        id: "containerOrchestration",
        label: "Container orchestration",
        kind: "single",
        options: ["Kubernetes", "Nomad", "Docker Swarm", "Managed runtime", "Self-managed"],
      },
      {
        id: "observabilityStack",
        label: "Observability stack",
        kind: "single",
        options: ["Metrics-only", "Metrics + Logs", "Metrics + Logs + Traces"],
      },
      {
        id: "serviceMesh",
        label: "Service mesh",
        kind: "single",
        options: ["None", "Sidecar-based", "Sidecar-less", "Library-based"],
      },
      {
        id: "cicdModel",
        label: "CI/CD model",
        kind: "single",
        options: ["GitOps", "Imperative", "Push-based", "Pull-based"],
      },
      {
        id: "policyControls",
        label: "Policy controls",
        kind: "single",
        options: ["None", "Admission-time", "Runtime", "Both"],
      },
      {
        id: "backupAndRestore",
        label: "Backup and restore",
        kind: "single",
        options: ["None", "Snapshot-based", "Continuous"],
      },
    ],
  },
];

export const NOT_SPECIFIED_LABEL = "Not specified" as const;

// Vocabulary guard at module load: every label and option string
// the registry will render is checked against the CTAD vocabulary
// tier. A forbidden token throws on import, failing the bundle.
const ALL_REGISTRY_TEXT: string[] = [
  NOT_SPECIFIED_LABEL,
  ...ENVIRONMENT_KIND_OPTIONS,
  ...ENVIRONMENT_HOSTING_MODEL_OPTIONS,
];
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

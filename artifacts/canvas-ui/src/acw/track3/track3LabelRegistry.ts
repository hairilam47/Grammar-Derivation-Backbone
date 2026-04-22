// ACW Track 3 — derived label registry.
//
// The single source of truth for the human-readable labels Track 3
// renders into the DOM. Two assertions run at module load:
//   (1) every label is non-vendor (no PostgreSQL / AWS / Kubernetes
//       / React names), enforced by an explicit denylist.
//   (2) every label passes the ACW_TRACK3_FORBIDDEN vocabulary
//       tier, banning judgement / recommendation / urgency wording.
//
// The registry maps (sectionId, paramId, optionValue) triples to
// generic class labels (e.g. "Relational Database" rather than
// "PostgreSQL"). For layer roots we provide a separate map. For
// parameters that have no per-option label override we fall back
// to the option string verbatim, after asserting it against both
// guards.
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";
import type { Track3Layer } from "./track3Types";

// Layer roots. Generic, non-vendor.
export const TRACK3_LAYER_LABEL: Readonly<Record<Track3Layer, string>> =
  Object.freeze({
    infrastructure: "Infrastructure",
    application: "Application",
    integration: "Integration",
    crossCutting: "Cross-Cutting",
    ops: "Ops & Lifecycle",
  });

// Per-(layer, paramId) parameter labels. These render as the
// caption above each param-value group in the derived shell's
// binding panel and as a tooltip on derived nodes.
export const TRACK3_PARAM_LABEL: Readonly<
  Record<string, string>
> = Object.freeze({
  // Infrastructure
  hostingModel: "Hosting model",
  deploymentTopology: "Deployment topology",
  serverScaleClass: "Server scale class",
  databaseClass: "Database class",
  dataDistribution: "Data distribution",
  networkTopology: "Network topology",
  networkComponents: "Network components",
  osClass: "OS class",
  virtualisationClass: "Virtualisation class",
  identityModel: "Identity model",
  perimeterModel: "Perimeter model",
  cryptographyScope: "Cryptography scope",
  monitoringClass: "Monitoring class",
  managementModel: "Management model",
  // Application
  applicationStyle: "Application style",
  runtimeCategory: "Runtime category",
  backendFrameworkClass: "Backend framework class",
  frontendArchitecture: "Frontend architecture",
  frontendFrameworkClass: "Frontend framework class",
  // Integration
  integrationPattern: "Integration pattern",
  messageExchange: "Message exchange",
  boundaryScope: "Boundary scope",
  // Cross-cutting
  configurationManagement: "Configuration management",
  secretsHandling: "Secrets handling",
  resiliencePosture: "Resilience posture",
  // Ops & Lifecycle
  containerOrchestration: "Container orchestration",
  observabilityStack: "Observability stack",
  serviceMesh: "Service mesh",
  cicdModel: "CI/CD model",
  policyControls: "Policy controls",
  backupAndRestore: "Backup and restore",
});

// Per-(paramId, optionValue) overrides for option strings that
// would otherwise read awkwardly as standalone node labels. The
// CTAD registry already uses generic class names ("Relational",
// "Document", "Container", "Linux") rather than vendor names, so
// most options pass through verbatim. The overrides below add a
// noun ("… database", "… runtime") so the derived node reads as
// a structural element rather than a bare adjective.
const PARAM_OPTION_LABEL_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  databaseClass: Object.freeze({
    Relational: "Relational database",
    Document: "Document database",
    "Key-Value": "Key-value database",
    Graph: "Graph database",
    "Time-series": "Time-series database",
  }),
  virtualisationClass: Object.freeze({
    VM: "Virtual machine",
    Container: "Container runtime",
    Mixed: "Mixed virtualisation",
  }),
  osClass: Object.freeze({
    Linux: "Linux operating system",
    Windows: "Windows operating system",
    Mixed: "Mixed operating systems",
  }),
  hostingModel: Object.freeze({
    "On-prem": "On-premise hosting",
    Private: "Private cloud hosting",
    Public: "Public cloud hosting",
    Hybrid: "Hybrid cloud hosting",
  }),
  applicationStyle: Object.freeze({
    Monolith: "Monolithic application",
    Modular: "Modular application",
    Microservices: "Microservice cluster",
    "Event-driven": "Event-driven application",
  }),
  runtimeCategory: Object.freeze({
    Managed: "Managed runtime",
    "Self-hosted": "Self-hosted runtime",
  }),
  backendFrameworkClass: Object.freeze({
    JVM: "JVM backend",
    ".NET": "Dot-NET backend",
    Node: "Node backend",
    Python: "Python backend",
    Mixed: "Mixed backend",
  }),
  frontendArchitecture: Object.freeze({
    "Server-rendered": "Server-rendered frontend",
    SPA: "Single-page application",
    Hybrid: "Hybrid frontend",
  }),
  frontendFrameworkClass: Object.freeze({
    // Vendor-free neutral re-labels for the CTAD option keys
    // ("React-like" / "Vue-like" / "Angular-like"). Track 3 may
    // never surface a vendor or product name; the override below
    // is what the diagram actually displays.
    "React-like": "Component-tree frontend",
    "Vue-like": "Template-binding frontend",
    "Angular-like": "Opinionated frontend",
    Other: "Other frontend",
  }),
  integrationPattern: Object.freeze({
    API: "API integration",
    Event: "Event integration",
    Batch: "Batch integration",
    Hybrid: "Hybrid integration",
  }),
  messageExchange: Object.freeze({
    Synchronous: "Synchronous exchange",
    Asynchronous: "Asynchronous exchange",
  }),
  boundaryScope: Object.freeze({
    Internal: "Internal boundary",
    External: "External boundary",
    Both: "Internal and external boundary",
  }),
  configurationManagement: Object.freeze({
    Centralised: "Centralised configuration",
    Decentralised: "Decentralised configuration",
  }),
  secretsHandling: Object.freeze({
    Local: "Local secrets",
    "Vault-based": "Vault-based secrets",
    "Managed Service": "Managed secrets service",
  }),
  resiliencePosture: Object.freeze({
    Basic: "Basic resilience",
    Redundant: "Redundant resilience",
    "Multi-region": "Multi-region resilience",
  }),
  networkComponents: Object.freeze({
    Router: "Network router",
    Switch: "Network switch",
    Firewall: "Firewall",
    "Load Balancer": "Load balancer",
  }),
  // Ops & Lifecycle option overrides. The CTAD option strings for
  // `containerOrchestration` include vendor / product names
  // (Kubernetes, Nomad, Docker Swarm) so Track 3 must rewrite
  // them to generic class labels before they reach the DOM. The
  // remaining ops-section parameters (observabilityStack,
  // serviceMesh, cicdModel, policyControls, backupAndRestore)
  // already use vendor-free class strings in the registry and
  // pass through verbatim via the `assertNoVendorNames` fallback.
  containerOrchestration: Object.freeze({
    Kubernetes: "Container orchestrator",
    Nomad: "Container scheduler",
    "Docker Swarm": "Container cluster",
    "Managed runtime": "Managed orchestration",
    "Self-managed": "Self-managed orchestration",
  }),
});

export function labelForOption(paramId: string, option: string): string {
  const overrides = PARAM_OPTION_LABEL_OVERRIDES[paramId];
  if (overrides && overrides[option] !== undefined) return overrides[option];
  // Fallback path: any option string that reaches the DOM without
  // an override must still pass the vendor / language guards so a
  // future CTAD option addition cannot smuggle a vendor name or a
  // judgement word into a derived node label.
  assertNoVendorNames(option);
  assertAllAcwTrack3Language([option]);
  return option;
}

export function labelForParam(paramId: string): string {
  return TRACK3_PARAM_LABEL[paramId] ?? paramId;
}

// Vendor / product-name denylist. Track 3 surface text and the
// derived label registry must contain ONLY generic class names
// (e.g. "Relational database"), never product names. The list is
// conservative: it covers the common database, cloud-provider,
// orchestrator, and framework names a casual contributor might
// reach for. A new entry is one line.
const VENDOR_DENYLIST: readonly string[] = [
  // databases
  "postgres",
  "postgresql",
  "mysql",
  "mariadb",
  "oracle",
  "mongodb",
  "redis",
  "cassandra",
  "dynamodb",
  "neo4j",
  "elasticsearch",
  "snowflake",
  "bigquery",
  // cloud providers
  "aws",
  "amazon web services",
  "azure",
  "gcp",
  "google cloud",
  "alibaba cloud",
  // orchestrators / runtimes
  "kubernetes",
  "k8s",
  "docker",
  "openshift",
  "mesos",
  "nomad",
  // frameworks
  "react",
  "vue",
  "angular",
  "spring",
  "django",
  "rails",
  "express",
  "fastapi",
  "nextjs",
  "next.js",
  // languages (when used as a product name in labels)
  "java",
  "kotlin",
  "csharp",
  "c#",
  "golang",
  "rust",
  "ruby",
  "swift",
];

export function assertNoVendorNames(text: string): void {
  const lower = text.toLowerCase();
  for (const vendor of VENDOR_DENYLIST) {
    // Token-bounded match so generic words containing a vendor
    // substring (e.g. "carriage" containing "rri") would not
    // false-positive. We match on a non-word boundary either side.
    const re = new RegExp(
      `(^|[^a-z0-9])${vendor.replace(/[.+]/g, (c) => "\\" + c)}([^a-z0-9]|$)`,
    );
    if (re.test(lower)) {
      throw new Error(
        `ACW Track 3 vendor-name denylist violation: label "${text}" contains the vendor / product-name token "${vendor}". Track 3 labels must be generic, non-vendor-specific.`,
      );
    }
  }
}

// Module-load assertions: every label in this registry passes the
// vendor denylist and the Track 3 vocabulary tier.
const ALL_REGISTRY_TEXT: string[] = [];
for (const v of Object.values(TRACK3_LAYER_LABEL)) ALL_REGISTRY_TEXT.push(v);
for (const v of Object.values(TRACK3_PARAM_LABEL)) ALL_REGISTRY_TEXT.push(v);
for (const overrides of Object.values(PARAM_OPTION_LABEL_OVERRIDES)) {
  for (const v of Object.values(overrides)) ALL_REGISTRY_TEXT.push(v);
}
for (const text of ALL_REGISTRY_TEXT) assertNoVendorNames(text);
assertAllAcwTrack3Language(ALL_REGISTRY_TEXT);

// Internal export so the build-time invariants can re-run the
// denylist over the full enumerated label table.
export const __track3LabelRegistryInternals = Object.freeze({
  ALL_REGISTRY_TEXT: Object.freeze([...ALL_REGISTRY_TEXT]),
  PARAM_OPTION_LABEL_OVERRIDES,
});

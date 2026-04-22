// CNCF reference catalog — frozen card set.
//
// 30 curated entries spanning Orchestration, Observability,
// Networking, Security, Storage, Database, Messaging, Serverless,
// and Developer Tools. The array is bundled at build time and
// never fetched.
//
// Two module-load validations run on import:
//   (1) Every card id is unique.
//   (2) Every binding hint references a paramId that exists in
//       the live CTAD registry, and every "sets"/"constrains"
//       option string is a permitted option of that paramId.
//
// Card descriptions paraphrase the project's stated purpose. They
// are rendered through `<QuotedSource>` (which bypasses the CTAD
// vocabulary guard) because CNCF's own terminology — "graduated",
// "service mesh", "incubating sandbox project", etc. — would
// otherwise fail the guard. CNCF attribution is part of the card
// surface, not authored CTAD copy.

import { findParam, type CtadParameter } from "@/ctad/ctadRegistry";
import type { BindingHint, CncfCard } from "./cncfTypes";

const CARDS_RAW: readonly CncfCard[] = [
  // --- Orchestration --------------------------------------------------
  {
    id: "cncf:kubernetes",
    name: "Kubernetes",
    category: "Orchestration",
    subcategory: "Scheduling & Orchestration",
    maturity: "graduated",
    description:
      "Production-grade container orchestration platform for automating deployment, scaling, and management of containerised workloads.",
    bindingHints: [
      { kind: "sets", paramId: "containerOrchestration", value: "Kubernetes" },
      { kind: "constrains", paramId: "virtualisationClass", allowedOptions: ["Container", "Mixed"] },
    ],
  },
  {
    id: "cncf:helm",
    name: "Helm",
    category: "Orchestration",
    subcategory: "Application Definition",
    maturity: "graduated",
    description:
      "Package manager for Kubernetes; bundles application manifests as versioned charts.",
    bindingHints: [
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:argo",
    name: "Argo",
    category: "Orchestration",
    subcategory: "Continuous Delivery",
    maturity: "graduated",
    description:
      "Suite of Kubernetes-native workflow, continuous delivery, and event-driven automation tools using a GitOps model.",
    bindingHints: [
      { kind: "sets", paramId: "cicdModel", value: "GitOps" },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:flux",
    name: "Flux",
    category: "Orchestration",
    subcategory: "Continuous Delivery",
    maturity: "graduated",
    description:
      "GitOps toolkit that keeps Kubernetes clusters in sync with declarative configuration in Git.",
    bindingHints: [
      { kind: "sets", paramId: "cicdModel", value: "GitOps" },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:keda",
    name: "KEDA",
    category: "Orchestration",
    subcategory: "Autoscaling",
    maturity: "graduated",
    description:
      "Kubernetes-based event-driven autoscaler that drives workload replicas from external signal sources.",
    bindingHints: [
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:containerd",
    name: "containerd",
    category: "Orchestration",
    subcategory: "Container Runtime",
    maturity: "graduated",
    description:
      "Industry-standard container runtime with an emphasis on simplicity, robustness, and portability.",
    bindingHints: [
      { kind: "constrains", paramId: "virtualisationClass", allowedOptions: ["Container", "Mixed"] },
    ],
  },
  {
    id: "cncf:crossplane",
    name: "Crossplane",
    category: "Orchestration",
    subcategory: "Infrastructure-as-Code",
    maturity: "graduated",
    description:
      "Control-plane framework for composing cloud infrastructure and managed services through Kubernetes APIs.",
    bindingHints: [
      { kind: "sets", paramId: "managementModel", value: "Policy-driven" },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },

  // --- Observability --------------------------------------------------
  {
    id: "cncf:prometheus",
    name: "Prometheus",
    category: "Observability",
    subcategory: "Monitoring",
    maturity: "graduated",
    description:
      "Systems monitoring and alerting toolkit with a multi-dimensional time-series data model and PromQL query language.",
    bindingHints: [
      { kind: "constrains", paramId: "monitoringClass", allowedOptions: ["Centralised", "Observability"] },
    ],
  },
  {
    id: "cncf:fluentd",
    name: "Fluentd",
    category: "Observability",
    subcategory: "Logging",
    maturity: "graduated",
    description:
      "Unified logging layer that decouples log sources from backends through a pluggable input/output model.",
    bindingHints: [
      { kind: "sets", paramId: "observabilityStack", value: "Metrics + Logs" },
    ],
  },
  {
    id: "cncf:jaeger",
    name: "Jaeger",
    category: "Observability",
    subcategory: "Tracing",
    maturity: "graduated",
    description:
      "End-to-end distributed tracing platform for monitoring transactions across microservice architectures.",
    bindingHints: [
      { kind: "sets", paramId: "observabilityStack", value: "Metrics + Logs + Traces" },
    ],
  },
  {
    id: "cncf:opentelemetry",
    name: "OpenTelemetry",
    category: "Observability",
    subcategory: "Instrumentation",
    maturity: "graduated",
    description:
      "Vendor-neutral framework of APIs, SDKs, and tools for collecting metrics, logs, and traces from cloud-native software.",
    bindingHints: [
      { kind: "sets", paramId: "observabilityStack", value: "Metrics + Logs + Traces" },
      { kind: "constrains", paramId: "monitoringClass", allowedOptions: ["Observability"] },
    ],
  },

  // --- Networking -----------------------------------------------------
  {
    id: "cncf:envoy",
    name: "Envoy",
    category: "Networking",
    subcategory: "Service Proxy",
    maturity: "graduated",
    description:
      "High-performance L7 proxy designed for cloud-native applications and used as the data plane in many service meshes.",
    bindingHints: [
      { kind: "constrains", paramId: "serviceMesh", allowedOptions: ["Sidecar-based"] },
    ],
  },
  {
    id: "cncf:istio",
    name: "Istio",
    category: "Networking",
    subcategory: "Service Mesh",
    maturity: "graduated",
    description:
      "Open-source service mesh that layers transparently onto distributed applications to provide traffic management, security, and observability.",
    bindingHints: [
      { kind: "sets", paramId: "serviceMesh", value: "Sidecar-based" },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:linkerd",
    name: "Linkerd",
    category: "Networking",
    subcategory: "Service Mesh",
    maturity: "graduated",
    description:
      "Ultralight, security-focused service mesh for Kubernetes built on a Rust-based micro-proxy.",
    bindingHints: [
      { kind: "sets", paramId: "serviceMesh", value: "Sidecar-based" },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:cilium",
    name: "Cilium",
    category: "Networking",
    subcategory: "Container Network Interface",
    maturity: "graduated",
    description:
      "eBPF-based networking, security, and observability layer for Kubernetes and other cloud-native environments.",
    bindingHints: [
      { kind: "constrains", paramId: "networkTopology", allowedOptions: ["Segmented", "Zero-trust"] },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
    ],
  },
  {
    id: "cncf:coredns",
    name: "CoreDNS",
    category: "Networking",
    subcategory: "DNS",
    maturity: "graduated",
    description:
      "Plugin-based DNS server written in Go; the default cluster DNS for Kubernetes since v1.13.",
    bindingHints: [
      { kind: "justifies", paramId: "networkTopology", rationale: "Cluster DNS resolution capability." },
    ],
  },

  // --- Security -------------------------------------------------------
  {
    id: "cncf:opa",
    name: "Open Policy Agent",
    category: "Security",
    subcategory: "Policy",
    maturity: "graduated",
    description:
      "General-purpose policy engine with a high-level declarative language (Rego) for unified, context-aware policy decisions.",
    bindingHints: [
      { kind: "sets", paramId: "policyControls", value: "Admission-time" },
    ],
  },
  {
    id: "cncf:falco",
    name: "Falco",
    category: "Security",
    subcategory: "Runtime Security",
    maturity: "graduated",
    description:
      "Cloud-native runtime security project that detects unexpected application behaviour through kernel and audit events.",
    bindingHints: [
      { kind: "sets", paramId: "policyControls", value: "Runtime" },
    ],
  },
  {
    id: "cncf:spiffe",
    name: "SPIFFE / SPIRE",
    category: "Security",
    subcategory: "Workload Identity",
    maturity: "graduated",
    description:
      "Specification and reference runtime for issuing cryptographic, federated identities to workloads across heterogeneous environments.",
    bindingHints: [
      { kind: "constrains", paramId: "identityModel", allowedOptions: ["Federated"] },
    ],
  },
  {
    id: "cncf:cert-manager",
    name: "cert-manager",
    category: "Security",
    subcategory: "Certificate Management",
    maturity: "graduated",
    description:
      "Kubernetes add-on that automates the management and issuance of TLS certificates from configured issuers.",
    bindingHints: [
      { kind: "constrains", paramId: "cryptographyScope", allowedOptions: ["In-transit", "Both"] },
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
      { kind: "justifies", paramId: "secretsHandling", rationale: "Issued TLS material is delivered as Kubernetes Secret objects; co-locates well with a vault-backed secret manager." },
    ],
  },
  {
    id: "cncf:harbor",
    name: "Harbor",
    category: "Security",
    subcategory: "Image Registry",
    maturity: "graduated",
    description:
      "Open-source artefact registry for container images with vulnerability scanning, signing, and replication.",
    bindingHints: [
      { kind: "justifies", paramId: "policyControls", rationale: "Artefact provenance and image scanning capability." },
    ],
  },

  // --- Database -------------------------------------------------------
  {
    id: "cncf:etcd",
    name: "etcd",
    category: "Database",
    subcategory: "Key-Value",
    maturity: "graduated",
    description:
      "Strongly consistent, distributed key-value store used as the backing store for cluster configuration, including in Kubernetes.",
    bindingHints: [
      { kind: "constrains", paramId: "databaseClass", allowedOptions: ["Key-Value"] },
      { kind: "justifies", paramId: "configurationManagement", rationale: "Provides a centralised, strongly-consistent backing store for distributed configuration data." },
    ],
  },
  {
    id: "cncf:tikv",
    name: "TiKV",
    category: "Database",
    subcategory: "Distributed Key-Value",
    maturity: "graduated",
    description:
      "Distributed transactional key-value database that supports horizontal scalability, strong consistency, and high availability.",
    bindingHints: [
      { kind: "constrains", paramId: "databaseClass", allowedOptions: ["Key-Value"] },
      { kind: "constrains", paramId: "dataDistribution", allowedOptions: ["Sharded", "Replicated"] },
    ],
  },
  {
    id: "cncf:vitess",
    name: "Vitess",
    category: "Database",
    subcategory: "Relational at Scale",
    maturity: "graduated",
    description:
      "Database clustering system for horizontal scaling of MySQL through transparent sharding.",
    bindingHints: [
      { kind: "constrains", paramId: "databaseClass", allowedOptions: ["Relational"] },
      { kind: "constrains", paramId: "dataDistribution", allowedOptions: ["Sharded"] },
    ],
  },

  // --- Storage --------------------------------------------------------
  {
    id: "cncf:rook",
    name: "Rook",
    category: "Storage",
    subcategory: "Storage Orchestrator",
    maturity: "graduated",
    description:
      "Open-source storage orchestrator that turns distributed storage systems into self-managing cloud-native services.",
    bindingHints: [
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
      { kind: "constrains", paramId: "backupAndRestore", allowedOptions: ["Snapshot-based", "Continuous"] },
    ],
  },

  // --- Messaging ------------------------------------------------------
  {
    id: "cncf:nats",
    name: "NATS",
    category: "Messaging",
    subcategory: "Messaging",
    maturity: "incubating",
    description:
      "Connective technology for digital systems, services, and devices; lightweight pub-sub and request-reply messaging.",
    bindingHints: [
      { kind: "constrains", paramId: "messageExchange", allowedOptions: ["Asynchronous"] },
    ],
  },

  // --- Serverless -----------------------------------------------------
  {
    id: "cncf:knative",
    name: "Knative",
    category: "Serverless",
    subcategory: "Serverless Platform",
    maturity: "incubating",
    description:
      "Kubernetes-based platform for deploying and managing serverless workloads with event-driven autoscaling.",
    bindingHints: [
      { kind: "constrains", paramId: "containerOrchestration", allowedOptions: ["Kubernetes"] },
      { kind: "constrains", paramId: "applicationStyle", allowedOptions: ["Microservices", "Event-driven"] },
    ],
  },
  {
    id: "cncf:dapr",
    name: "Dapr",
    category: "Serverless",
    subcategory: "Application Runtime",
    maturity: "graduated",
    description:
      "Portable, event-driven runtime that simplifies building resilient, distributed applications across cloud and edge.",
    bindingHints: [
      { kind: "constrains", paramId: "messageExchange", allowedOptions: ["Asynchronous", "Synchronous"] },
    ],
  },
  {
    id: "cncf:cloudevents",
    name: "CloudEvents",
    category: "Serverless",
    subcategory: "Event Specification",
    maturity: "graduated",
    description:
      "Specification for describing event data in a common, vendor-neutral way to improve interoperability across services.",
    bindingHints: [
      { kind: "justifies", paramId: "messageExchange", rationale: "Common event envelope for asynchronous integration." },
    ],
  },

  // --- Developer Tools ------------------------------------------------
  {
    id: "cncf:backstage",
    name: "Backstage",
    category: "Developer Tools",
    subcategory: "Internal Developer Portal",
    maturity: "incubating",
    description:
      "Open platform for building developer portals, unifying tooling, services, and documentation in a single experience.",
    bindingHints: [
      { kind: "constrains", paramId: "frontendArchitecture", allowedOptions: ["SPA"] },
      { kind: "constrains", paramId: "frontendFrameworkClass", allowedOptions: ["React-like"] },
      { kind: "justifies", paramId: "applicationStyle", rationale: "Service catalog and software-template hub for internal applications; complements modular and microservice estates." },
    ],
  },
];

// (1) Unique card ids -------------------------------------------------
{
  const seen = new Set<string>();
  for (const card of CARDS_RAW) {
    if (seen.has(card.id)) {
      throw new Error(
        `CNCF catalog: duplicate card id "${card.id}". Card ids must be unique.`,
      );
    }
    seen.add(card.id);
  }
}

// (2) Binding-hint validation against the live CTAD registry ----------
function validateBindingHint(card: CncfCard, hint: BindingHint): void {
  const param: CtadParameter | undefined = findParam(hint.paramId);
  if (!param) {
    throw new Error(
      `CNCF catalog: card "${card.id}" references unknown CTAD parameter id "${hint.paramId}". Every binding hint paramId must exist in ctadRegistry.`,
    );
  }
  if (hint.kind === "sets") {
    if (param.kind !== "single") {
      throw new Error(
        `CNCF catalog: card "${card.id}" uses a "sets" hint on multi-kind parameter "${hint.paramId}". "sets" is only permitted for single-kind parameters.`,
      );
    }
    if (!param.options.includes(hint.value)) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "sets" "${hint.paramId}" to "${hint.value}", which is not a permitted option. Permitted: ${param.options.join(", ")}.`,
      );
    }
  } else if (hint.kind === "constrains") {
    if (hint.allowedOptions.length === 0) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "constrains" "${hint.paramId}" to an empty option set.`,
      );
    }
    for (const opt of hint.allowedOptions) {
      if (!param.options.includes(opt)) {
        throw new Error(
          `CNCF catalog: card "${card.id}" "constrains" "${hint.paramId}" to "${opt}", which is not a permitted option. Permitted: ${param.options.join(", ")}.`,
        );
      }
    }
  } else if (hint.kind === "justifies") {
    if (typeof hint.rationale !== "string" || hint.rationale.length === 0) {
      throw new Error(
        `CNCF catalog: card "${card.id}" "justifies" "${hint.paramId}" with an empty rationale.`,
      );
    }
  } else {
    // Exhaustiveness check.
    const _exhaustive: never = hint;
    void _exhaustive;
  }
}

for (const card of CARDS_RAW) {
  for (const hint of card.bindingHints) validateBindingHint(card, hint);
}

// Deep-freeze and export ---------------------------------------------
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

export const CNCF_CARDS: readonly CncfCard[] = deepFreeze(CARDS_RAW);

export function findCard(id: string): CncfCard | undefined {
  return CNCF_CARDS.find((c) => c.id === id);
}

// Section relevance lookup -------------------------------------------
//
// A card is "relevant" to a CTAD section when one or more of its
// binding hints targets a paramId that belongs to that section.
// Cards with no binding hints are not relevant to any section.

import { findSectionForParam, type CtadSectionId } from "@/ctad/ctadRegistry";

export function cardSections(card: CncfCard): readonly CtadSectionId[] {
  const set = new Set<CtadSectionId>();
  for (const hint of card.bindingHints) {
    const sec = findSectionForParam(hint.paramId);
    if (sec) set.add(sec);
  }
  return Array.from(set);
}

export function cardsForSection(sectionId: CtadSectionId): readonly CncfCard[] {
  return CNCF_CARDS.filter((c) => cardSections(c).includes(sectionId));
}

// (3) Section coverage invariant -------------------------------------
// Every CTAD section must have at least one relevant card so that the
// per-section "Relevant cards" panel is never empty for any section.
{
  const ALL_SECTIONS: readonly CtadSectionId[] = [
    "infrastructure",
    "application",
    "integration",
    "crossCutting",
    "ops",
  ];
  const missing: CtadSectionId[] = [];
  for (const s of ALL_SECTIONS) {
    if (cardsForSection(s).length === 0) missing.push(s);
  }
  if (missing.length > 0) {
    throw new Error(
      `CNCF catalog: no cards are relevant to CTAD section(s) "${missing.join(", ")}". Every CTAD section must have at least one binding-hint reference in the frozen catalog.`,
    );
  }
}

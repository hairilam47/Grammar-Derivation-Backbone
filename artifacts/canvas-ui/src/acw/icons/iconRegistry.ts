// ACW Phase 5 — vendor-neutral icon registry.
//
// Maps a node's `boundTechnologyCategory` (a categorical string the
// CTAD seed assigns from the registry, never a brand name) to a
// presentational icon component. The registry is vendor-neutral by
// construction: every `category` string is asserted against a
// vendor-name denylist at module load via
// `assertNoVendorNamesInIconRegistry`. Adding a new category that
// names a product or vendor (Kubernetes, React, Postgres, AWS, …)
// fails the bundle.
//
// Vocabulary: every `displayName` is asserted against
// ACW_PLACEHOLDER_FORBIDDEN. Categorical names only — no superlatives,
// no recommendations, no judgement.
//
// Icons are sourced from `lucide-react` (already on the ACW
// isolation allowlist as a render-only SVG library); this keeps the
// registry self-contained and free of bundled raster assets.
import type { ComponentType, SVGProps } from "react";
import {
  Box,
  Cloud,
  Container,
  Cpu,
  Database,
  Globe,
  Layers,
  Layout,
  MonitorSmartphone,
  Network,
  Package,
  Server,
  Share2,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "../../governance/staticTextGuard";

export type AcwIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface AcwIconEntry {
  readonly category: string;
  readonly displayName: string;
  readonly Icon: AcwIconComponent;
}

// Vendor / product name denylist. Each entry is a substring; if any
// `category` or `displayName` contains it (case-insensitive), the
// bundle fails at module load. Mirrors the Track 3 label-registry
// guard's intent — keep ACW iconography categorical, never branded.
//
// The list is intentionally conservative: it covers the vendor and
// product names most likely to leak in via well-meaning category
// renames. Add new entries as the ecosystem grows; do NOT remove an
// entry without an explicit constitutional justification.
export const ICON_REGISTRY_VENDOR_DENYLIST: readonly string[] = Object.freeze([
  // Container / orchestration
  "kubernetes",
  "k8s",
  "openshift",
  "rancher",
  "nomad",
  "docker",
  "podman",
  "containerd",
  // Service mesh
  "istio",
  "linkerd",
  "consul",
  "envoy",
  // Cloud providers
  "aws",
  "amazon web",
  "azure",
  "gcp",
  "google cloud",
  "alibaba cloud",
  "oracle cloud",
  // Databases / data stores
  "postgres",
  "postgresql",
  "mysql",
  "mariadb",
  "mongodb",
  "mongo",
  "redis",
  "memcached",
  "cassandra",
  "dynamodb",
  "couchdb",
  "neo4j",
  "elastic",
  "elasticsearch",
  "kafka",
  "rabbitmq",
  "snowflake",
  "databricks",
  "bigquery",
  // Web servers / proxies
  "nginx",
  "apache",
  "haproxy",
  "traefik",
  // Frontend frameworks
  "react",
  "vue",
  "angular",
  "svelte",
  "next.js",
  "nextjs",
  "nuxt",
  "remix",
  "ember",
  "preact",
  // Backend frameworks / runtimes
  "spring",
  "django",
  "flask",
  "rails",
  "laravel",
  "express",
  "fastify",
  "nestjs",
  ".net",
  "dotnet",
  // Observability / CI / IaC products
  "prometheus",
  "grafana",
  "jaeger",
  "opentelemetry",
  "datadog",
  "splunk",
  "newrelic",
  "jenkins",
  "circleci",
  "gitlab",
  "github actions",
  "argo",
  "argocd",
  "flux",
  "terraform",
  "pulumi",
  "ansible",
  "chef",
  "puppet",
  "helm",
  // Identity / secrets
  "okta",
  "auth0",
  "keycloak",
  "vault",
]);

const REGISTRY_RAW: readonly AcwIconEntry[] = [
  // Frontend
  {
    category: "Component-tree frontend",
    displayName: "Component-tree frontend",
    Icon: Layout,
  },
  {
    category: "Server-rendered frontend",
    displayName: "Server-rendered frontend",
    Icon: MonitorSmartphone,
  },
  // Backend / application
  {
    category: "Backend service",
    displayName: "Backend service",
    Icon: Server,
  },
  {
    category: "Generic component",
    displayName: "Generic component",
    Icon: Box,
  },
  {
    category: "Compute host",
    displayName: "Compute host",
    Icon: Cpu,
  },
  // Data plane
  {
    category: "Relational database",
    displayName: "Relational database",
    Icon: Database,
  },
  {
    category: "Document database",
    displayName: "Document database",
    Icon: Database,
  },
  {
    category: "Key-value store",
    displayName: "Key-value store",
    Icon: Database,
  },
  {
    category: "Graph database",
    displayName: "Graph database",
    Icon: Database,
  },
  {
    category: "Time-series database",
    displayName: "Time-series database",
    Icon: Database,
  },
  // Integration
  {
    category: "Message broker",
    displayName: "Message broker",
    Icon: Share2,
  },
  {
    category: "API gateway",
    displayName: "API gateway",
    Icon: Network,
  },
  // Ops
  {
    category: "Container runtime",
    displayName: "Container runtime",
    Icon: Container,
  },
  {
    category: "Container orchestrator",
    displayName: "Container orchestrator",
    Icon: Layers,
  },
  {
    category: "Service-mesh data plane",
    displayName: "Service-mesh data plane",
    Icon: Workflow,
  },
  {
    category: "Managed runtime",
    displayName: "Managed runtime",
    Icon: Cloud,
  },
  {
    category: "Network boundary",
    displayName: "Network boundary",
    Icon: Globe,
  },
  {
    category: "Identity provider",
    displayName: "Identity provider",
    Icon: ShieldCheck,
  },
  {
    category: "Generic package",
    displayName: "Generic package",
    Icon: Package,
  },
];

export function assertNoVendorNamesInIconRegistry(
  entries: readonly AcwIconEntry[],
  denylist: readonly string[] = ICON_REGISTRY_VENDOR_DENYLIST,
): void {
  for (const entry of entries) {
    const haystack = `${entry.category}\n${entry.displayName}`.toLowerCase();
    for (const term of denylist) {
      if (haystack.indexOf(term) !== -1) {
        throw new Error(
          `ACW icon registry vendor-neutrality violation: entry for "${entry.category}" contains forbidden vendor / product name "${term}". Icon-registry categories must be categorical, never branded.`,
        );
      }
    }
  }
}

// Vocabulary tier: every category and display name is asserted
// against the strictest ACW tier at module load.
assertAllAcwPlaceholderLanguage(
  REGISTRY_RAW.flatMap((e) => [e.category, e.displayName]),
);
// Vendor neutrality is a constitutional guarantee of the registry;
// it runs at module load alongside the vocabulary check.
assertNoVendorNamesInIconRegistry(REGISTRY_RAW);

// Frozen registry surface. Same `Object.freeze` discipline as the
// other ACW frozen registries so no caller can mutate the entries
// after module load.
export const ACW_ICON_REGISTRY: readonly AcwIconEntry[] = Object.freeze(
  REGISTRY_RAW.map((e) => Object.freeze({ ...e })),
);

const BY_CATEGORY: ReadonlyMap<string, AcwIconEntry> = new Map(
  ACW_ICON_REGISTRY.map((e) => [e.category, e] as const),
);

export function lookupIconForCategory(
  category: string | undefined,
): AcwIconEntry | undefined {
  if (category === undefined) return undefined;
  return BY_CATEGORY.get(category);
}

export const ACW_ICON_CATEGORIES: readonly string[] = Object.freeze(
  ACW_ICON_REGISTRY.map((e) => e.category),
);

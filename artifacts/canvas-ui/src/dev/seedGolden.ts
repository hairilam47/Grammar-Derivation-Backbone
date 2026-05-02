// Golden-scenario seeder — deterministic test data for
// "Immigration Department of Malaysia – Core Systems Modernisation".
//
// Routes exclusively through validator-gated public store APIs
// (`createOrganisation`, `renameWorkItem`, `createModule`,
// `saveRequirement`, `approveRequirement`, `createOu`,
// `createNode`, `createEdge`, `clearWorkspace`,
// `ensureDomainContainers`, `createSignal`).
// No raw localStorage write is performed.
//
// Determinism: wraps every mutation in `withFrozenClock` so every
// store-internal `new Date()` / `Date.now()` / `Math.random()` call
// resolves to a fixed instant or counter across reruns.
//
// Idempotency: deletes the org (if it exists) and clears the scoped
// storage layer before re-seeding so a second run produces a
// byte-identical snapshot.

import {
  createOrganisation,
  getOrganisation,
  deleteOrganisation,
} from "@/governance/orgStore";
import { renameWorkItem } from "@/governance/workItemStore";
import { createModule } from "@/governance/moduleCatalogStore";
import {
  saveRequirement,
  approveRequirement,
  type RequirementType,
  type RequirementUrgency,
  type HardwareDetails,
} from "@/governance/requirementsStore";
import { createSignal, type CreateSignalInput } from "@/governance/signalsStore";
import {
  createNode,
  createEdge,
  clearWorkspace,
  __acwStoreInternals,
  type AcwDiagramType,
} from "@/acw/acwStore";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import { paletteItemByLabel } from "@/acw/palette/paletteRegistry";
import {
  createOu,
  clearOus,
  __ouStoreInternals,
} from "@/acw/orgUnits/ouStore";
import { currentScope } from "@/governance/storageKeyUtils";
import {
  __resetScopedStorageForTest,
  clearScope,
} from "@/governance/scopedStorageClient";

const ORG_ID = "org-jabatan-imigresen";
const ORG_NAME = "Jabatan Imigresen Malaysia";
const WI_TITLE =
  "Immigration Department of Malaysia – Core Systems Modernisation";

const FROZEN_ISO = "2026-01-15T12:00:00.000Z";
const FROZEN_MS = Date.parse(FROZEN_ISO);

export interface GoldenSeedSummary {
  readonly orgId: string;
  readonly workItemId: string;
  readonly modules: number;
  readonly requirements: number;
  readonly nodes: number;
  readonly edges: number;
  readonly ous: number;
  readonly signals: number;
  readonly ctadNodes: number;
  readonly promotions: number;
}

// ---------------------------------------------------------------------------
// Deterministic clock freeze (mirrors the pattern in seedAll.ts)
// ---------------------------------------------------------------------------

type GlobalsBag = {
  Date: typeof Date;
  randomUUID?: typeof crypto.randomUUID;
};

function withFrozenClock<T>(fn: () => T): T {
  const RealDate = globalThis.Date;
  const realNow = RealDate.now;
  const realRandom = Math.random;
  const realUuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID.bind(crypto)
      : null;

  class FrozenDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) {
        super(FROZEN_MS);
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
    static override now(): number {
      return FROZEN_MS;
    }
  }

  let randomCounter = 0;
  const frozenRandom = (): number => {
    randomCounter += 1;
    const x = (randomCounter * 1103515245 + 12345) >>> 0;
    return (x % 0x7fffffff) / 0x7fffffff;
  };

  const savedGlobals: GlobalsBag = { Date: RealDate };

  try {
    globalThis.Date = FrozenDate as unknown as typeof Date;
    (globalThis.Date as unknown as { now: () => number }).now = FrozenDate.now;
    Math.random = frozenRandom;
    if (typeof crypto !== "undefined" && realUuid) {
      crypto.randomUUID = (): ReturnType<typeof crypto.randomUUID> => {
        const seg = (): string =>
          Math.floor(frozenRandom() * 0x10000)
            .toString(16)
            .padStart(4, "0");
        return `${seg()}${seg()}-${seg()}-4${seg().slice(1)}-${seg()}-${seg()}${seg()}${seg()}` as ReturnType<
          typeof crypto.randomUUID
        >;
      };
      savedGlobals.randomUUID = realUuid;
    }
    return fn();
  } finally {
    globalThis.Date = savedGlobals.Date;
    (globalThis.Date as unknown as { now: () => number }).now = realNow;
    Math.random = realRandom;
    if (savedGlobals.randomUUID && typeof crypto !== "undefined") {
      crypto.randomUUID = savedGlobals.randomUUID;
    }
  }
}

// ---------------------------------------------------------------------------
// Clear + reset helpers
// ---------------------------------------------------------------------------

function clearGoldenScope(): void {
  if (typeof window === "undefined") return;

  // Set org-only scope so org-scoped stores can be addressed during cleanup.
  currentScope.set({ orgId: ORG_ID, workItemId: null });

  // Remove org (cascades WI removal) if it already exists.
  if (getOrganisation(ORG_ID) !== null) {
    deleteOrganisation(ORG_ID);
  }

  // Wipe L1 (in-memory) and L2 (localStorage) for every key under this org.
  clearScope(ORG_ID);
  __resetScopedStorageForTest();

  // Reload in-memory caches so subsequent reads return empty, not stale.
  __acwStoreInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface DomainNodeSpec {
  readonly id: string;
  readonly label: string;
  readonly parentId: string;
  readonly x: number;
  readonly y: number;
}

interface CtadNodeSpec {
  readonly id: string;
  readonly parentId: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly diagramType: AcwDiagramType;
  readonly boundRequirementIds?: readonly string[];
}

const DOMAIN_NODES: readonly DomainNodeSpec[] = [
  // ---- Business domain ------------------------------------------------
  { id: "gn-bus-strategy",   label: "Strategy Map",     parentId: "domain-business",    x: 60,  y: 60  },
  { id: "gn-bus-process",    label: "Business Process", parentId: "domain-business",    x: 260, y: 60  },
  { id: "gn-bus-governance", label: "Governance Model", parentId: "domain-business",    x: 460, y: 60  },
  { id: "gn-bus-orgunit",    label: "Org Unit",         parentId: "domain-business",    x: 60,  y: 220 },
  { id: "gn-bus-value",      label: "Value Stream",     parentId: "domain-business",    x: 260, y: 220 },
  { id: "gn-bus-capability", label: "Capability Map",   parentId: "domain-business",    x: 460, y: 220 },
  { id: "gn-bus-kpi",        label: "KPI Dashboard",    parentId: "domain-business",    x: 660, y: 60  },
  // ---- Data domain ----------------------------------------------------
  { id: "gn-dat-store",      label: "Data Store",       parentId: "domain-data",        x: 60,  y: 60  },
  { id: "gn-dat-stream",     label: "Data Stream",      parentId: "domain-data",        x: 260, y: 60  },
  { id: "gn-dat-model",      label: "Data Model",       parentId: "domain-data",        x: 460, y: 60  },
  { id: "gn-dat-product",    label: "Data Product",     parentId: "domain-data",        x: 60,  y: 220 },
  { id: "gn-dat-master",     label: "Master Data",      parentId: "domain-data",        x: 260, y: 220 },
  { id: "gn-dat-catalog",    label: "Data Catalog",     parentId: "domain-data",        x: 460, y: 220 },
  { id: "gn-dat-policy",     label: "Data Policy",      parentId: "domain-data",        x: 660, y: 60  },
  { id: "gn-dat-etl",        label: "ETL Pipeline",     parentId: "domain-data",        x: 660, y: 220 },
  // ---- Application domain ---------------------------------------------
  { id: "gn-app-portal",     label: "Application",      parentId: "domain-application", x: 60,  y: 60  },
  { id: "gn-app-gateway",    label: "API Gateway",      parentId: "domain-application", x: 260, y: 60  },
  { id: "gn-app-service",    label: "Microservice",     parentId: "domain-application", x: 460, y: 60  },
  { id: "gn-app-module",     label: "Module",           parentId: "domain-application", x: 60,  y: 220 },
  { id: "gn-app-mobile",     label: "Mobile App",       parentId: "domain-application", x: 260, y: 220 },
  { id: "gn-app-events",     label: "Event Bus",        parentId: "domain-application", x: 460, y: 220 },
  { id: "gn-app-web",        label: "Web Portal",       parentId: "domain-application", x: 660, y: 60  },
  { id: "gn-app-integ",      label: "Integration",      parentId: "domain-application", x: 660, y: 220 },
  // ---- Technology domain ----------------------------------------------
  { id: "gn-tec-cloud",      label: "Cloud Region",     parentId: "domain-technology",  x: 60,  y: 60  },
  { id: "gn-tec-network",    label: "Network Layer",    parentId: "domain-technology",  x: 260, y: 60  },
  { id: "gn-tec-db",         label: "Database",         parentId: "domain-technology",  x: 460, y: 60  },
  { id: "gn-tec-runtime",    label: "Runtime Engine",   parentId: "domain-technology",  x: 60,  y: 220 },
  { id: "gn-tec-iam",        label: "IAM Service",      parentId: "domain-technology",  x: 260, y: 220 },
  { id: "gn-tec-monitor",    label: "Monitoring",       parentId: "domain-technology",  x: 460, y: 220 },
  { id: "gn-tec-storage",    label: "Object Storage",   parentId: "domain-technology",  x: 660, y: 60  },
  { id: "gn-tec-cicd",       label: "CI/CD Pipeline",   parentId: "domain-technology",  x: 660, y: 220 },
];

// 5 CTAD diagram-type nodes. The first 3 carry `boundRequirementIds`
// making them explicit CTAD-to-canvas promotions.
const CTAD_NODES: readonly CtadNodeSpec[] = [
  {
    id: "gn-ctad-bpmn",
    parentId: "domain-application",
    label: "Permit Application Flow",
    x: 860, y: 60,
    diagramType: "bpmn",
    boundRequirementIds: ["req-aa01bb02cc03", "req-bb02cc03dd04"],
  },
  {
    id: "gn-ctad-erd",
    parentId: "domain-data",
    label: "Applicant Data Model",
    x: 860, y: 60,
    diagramType: "erd",
    boundRequirementIds: ["req-0222a333b444"],
  },
  {
    id: "gn-ctad-ddl",
    parentId: "domain-data",
    label: "Case Registry Schema",
    x: 860, y: 220,
    diagramType: "ddl",
    boundRequirementIds: ["req-a333b444c555"],
  },
  {
    id: "gn-ctad-seq",
    parentId: "domain-application",
    label: "Verification Sequence",
    x: 860, y: 220,
    diagramType: "sequence",
  },
  {
    id: "gn-ctad-class",
    parentId: "domain-application",
    label: "Service Class Model",
    x: 1060, y: 60,
    diagramType: "class",
  },
];

interface RequirementFixture {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: RequirementType;
  readonly urgency: RequirementUrgency;
  readonly moduleId: string;
  readonly hardwareDetails?: HardwareDetails;
}

const REQUIREMENT_FIXTURES: readonly RequirementFixture[] = [
  { id: "req-aa01bb02cc03", title: "Citizen Self-Service Portal",    description: "Travellers access permit applications through a self-service web channel.",             type: "functional",     urgency: "medium",   moduleId: "module:citizen-portal"    },
  { id: "req-bb02cc03dd04", title: "Application Submission",         description: "Permit applications are submitted digitally with structured field validation.",          type: "functional",     urgency: "high",     moduleId: "module:citizen-portal"    },
  { id: "req-cc03dd04ee05", title: "Biometric Verification",         description: "Fingerprint and facial biometrics are captured at border entry points.",                 type: "functional",     urgency: "critical", moduleId: "module:citizen-portal"    },
  { id: "req-dd04ee05ff06", title: "Case Status Tracking",           description: "Officers and applicants track case progress through defined workflow stages.",           type: "functional",     urgency: "medium",   moduleId: "module:case-management"   },
  { id: "req-ee05ff060011", title: "Case Assignment",                description: "Cases are routed to available officers based on workload and specialisation.",           type: "functional",     urgency: "medium",   moduleId: "module:case-management"   },
  { id: "req-ff0600110222", title: "System Response Time",           description: "Portal transactions complete within an agreed latency threshold under peak load.",       type: "non-functional", urgency: "medium",   moduleId: "module:internal-admin"    },
  { id: "req-00110222a333", title: "System Availability",            description: "Core services maintain continuous operation outside scheduled maintenance windows.",     type: "non-functional", urgency: "high",     moduleId: "module:internal-admin"    },
  { id: "req-0222a333b444", title: "Data Sovereignty",               description: "All personal data is stored and processed within Malaysian jurisdiction.",               type: "constraint",     urgency: "high",     moduleId: "module:document-mgmt"     },
  { id: "req-a333b444c555", title: "Audit Trail",                    description: "Every state transition in the permit workflow produces a tamper-evident audit record.", type: "constraint",     urgency: "critical", moduleId: "module:workflow-approval"  },
  {
    id: "req-b444c555d666",
    title: "Biometric Terminals",
    description: "Fingerprint scanner units deployed at all gazetted border entry points.",
    type: "hardware",
    urgency: "high",
    moduleId: "module:citizen-portal",
    hardwareDetails: {
      itemName: "Fingerprint Scanner Unit",
      model: "DigitalPersona U.are.U 4500",
      quantity: 150,
      unitCostEstimate: 320,
      notes: "Units cover all entry lanes; replacements held at regional depots.",
    },
  },
  { id: "req-c555d666e777", title: "Audit Log Capacity",             description: "Audit log store supports ten years of retention for all permit workflow events.",      type: "non-functional", urgency: "low",      moduleId: "module:reporting-analytics" },
];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function seedGolden(): GoldenSeedSummary {
  // Always wipe the scope first so re-runs are byte-stable.
  clearGoldenScope();

  return withFrozenClock(() => {
    // ------------------------------------------------------------------
    // 1. Organisation + EA Blueprint Work Item
    // ------------------------------------------------------------------
    const { organisation: org, eaBlueprintWorkItemId: wiId } =
      createOrganisation({
        id: ORG_ID,
        slug: "jabatan-imigresen",
        name: ORG_NAME,
        sector: "government",
        natureOfBusiness: "government-administration",
      });

    renameWorkItem(wiId, WI_TITLE);

    // Set full scope so WI-scoped stores can write.
    currentScope.set({ orgId: org.id, workItemId: wiId });
    __acwStoreInternals.reloadFromStorageForTest();
    __ouStoreInternals.reloadFromStorageForTest();

    // ------------------------------------------------------------------
    // 2. Six modules (one per capability)
    // ------------------------------------------------------------------
    const moduleList = [
      createModule({
        id: "module:citizen-portal",
        name: "Citizen Portal",
        description: "Public-facing services for traveller permit applications.",
        relatedCapabilityIds: ["CAP_EXTERNAL_ACCESS"],
      }),
      createModule({
        id: "module:internal-admin",
        name: "Internal Administration",
        description: "Back-office tooling for departmental staff.",
        relatedCapabilityIds: ["CAP_INTERNAL_ADMIN"],
      }),
      createModule({
        id: "module:case-management",
        name: "Case Management",
        description: "End-to-end lifecycle for border-control cases.",
        relatedCapabilityIds: ["CAP_CASE_MANAGEMENT"],
      }),
      createModule({
        id: "module:document-mgmt",
        name: "Document Management",
        description: "Digital storage and retrieval of application documents.",
        relatedCapabilityIds: ["CAP_DOCUMENT_MANAGEMENT"],
      }),
      createModule({
        id: "module:workflow-approval",
        name: "Workflow Approval",
        description: "Multi-step routing for permit application sign-off.",
        relatedCapabilityIds: ["CAP_WORKFLOW_APPROVAL"],
      }),
      createModule({
        id: "module:reporting-analytics",
        name: "Reporting and Analytics",
        description: "Dashboards and statistical summaries for operations.",
        relatedCapabilityIds: ["CAP_REPORTING_ANALYTICS"],
      }),
    ];

    // ------------------------------------------------------------------
    // 3. Eleven requirements — saved then approved (all have moduleId)
    // ------------------------------------------------------------------
    for (const r of REQUIREMENT_FIXTURES) {
      saveRequirement({
        id: r.id,
        workItemId: wiId,
        title: r.title,
        description: r.description,
        type: r.type,
        urgency: r.urgency,
        moduleId: r.moduleId,
        ...(r.hardwareDetails !== undefined
          ? { hardwareDetails: r.hardwareDetails }
          : {}),
        status: "draft",
      });
      approveRequirement(r.id);
    }

    // ------------------------------------------------------------------
    // 4. Organisational Units (2)
    // ------------------------------------------------------------------
    createOu({ id: "ou-operations", name: "Immigration Operations" });
    createOu({ id: "ou-digital",    name: "Digital Transformation" });

    // ------------------------------------------------------------------
    // 5. EAStudio canvas — 4 domain containers + 31 child nodes + 5 CTAD
    // ------------------------------------------------------------------
    clearWorkspace();
    ensureDomainContainers();

    // Map spec-id → resolved ACW node id (same when caller supplies id).
    const nodeIdMap = new Map<string, string>();
    let nodeCount = 0;

    // Domain child nodes — derive elementType from the palette registry.
    for (const spec of DOMAIN_NODES) {
      const item = paletteItemByLabel(spec.label);
      if (item === undefined) continue;
      const r = createNode({
        id: spec.id,
        type: item.elementType,
        parentId: spec.parentId,
        label: spec.label,
        x: spec.x,
        y: spec.y,
        ...(item.boundTechnologyCategory !== undefined
          ? { boundTechnologyCategory: item.boundTechnologyCategory }
          : {}),
        ...(item.boundParam !== undefined
          ? { boundParam: item.boundParam }
          : {}),
      });
      if (r.ok) {
        nodeIdMap.set(spec.id, r.id);
        nodeCount += 1;
      }
    }

    // CTAD diagram-type nodes (System type).
    // First 3 carry `boundRequirementIds` → CTAD-to-canvas promotions.
    let ctadNodeCount = 0;
    for (const spec of CTAD_NODES) {
      const r = createNode({
        id: spec.id,
        type: "System",
        parentId: spec.parentId,
        label: spec.label,
        x: spec.x,
        y: spec.y,
        diagramType: spec.diagramType,
        ...(spec.boundRequirementIds !== undefined
          ? { boundRequirementIds: spec.boundRequirementIds }
          : {}),
      });
      if (r.ok) {
        nodeIdMap.set(spec.id, r.id);
        nodeCount += 1;
        ctadNodeCount += 1;
      }
    }

    // ------------------------------------------------------------------
    // 6. Edges (≥10) — all between System-typed nodes within/across
    //    domains via DATA_FLOW / CONNECTS / INTERFACES_WITH
    // ------------------------------------------------------------------
    type EdgeKind = "CONNECTS" | "DATA_FLOW" | "INTERFACES_WITH";
    const EDGE_SPECS: readonly { from: string; to: string; kind: EdgeKind }[] = [
      { from: "gn-app-portal",  to: "gn-app-gateway",  kind: "CONNECTS"        },
      { from: "gn-app-mobile",  to: "gn-app-gateway",  kind: "CONNECTS"        },
      { from: "gn-app-web",     to: "gn-app-gateway",  kind: "CONNECTS"        },
      { from: "gn-app-gateway", to: "gn-app-service",  kind: "CONNECTS"        },
      { from: "gn-app-gateway", to: "gn-app-events",   kind: "INTERFACES_WITH" },
      { from: "gn-app-service", to: "gn-app-events",   kind: "INTERFACES_WITH" },
      { from: "gn-app-service", to: "gn-dat-stream",   kind: "DATA_FLOW"       },
      { from: "gn-app-service", to: "gn-dat-product",  kind: "DATA_FLOW"       },
      { from: "gn-dat-etl",     to: "gn-dat-stream",   kind: "DATA_FLOW"       },
      { from: "gn-app-portal",  to: "gn-app-service",  kind: "DATA_FLOW"       },
      { from: "gn-ctad-seq",    to: "gn-app-service",  kind: "INTERFACES_WITH" },
      { from: "gn-ctad-bpmn",   to: "gn-app-gateway",  kind: "DATA_FLOW"       },
    ];

    let edgeCount = 0;
    for (const e of EDGE_SPECS) {
      const fromId = nodeIdMap.get(e.from);
      const toId   = nodeIdMap.get(e.to);
      if (fromId === undefined || toId === undefined) continue;
      const r = createEdge({ kind: e.kind, fromId, toId });
      if (r.ok) edgeCount += 1;
    }

    // ------------------------------------------------------------------
    // 7. Policy signals (2)
    // ------------------------------------------------------------------
    const sig1: CreateSignalInput = {
      signalCategory: "Risk Accumulation",
      signalTitle: "Legacy Integration Dependencies",
      signalDescription:
        "Multiple point-to-point integrations with legacy permit systems concentrate failure risk across border processing.",
      evidenceSummary: {
        observationWindow: "Q1 2026 – Q2 2026",
        relatedDecisionCount: 4,
        qualitativePattern:
          "Repeated integration failures observed during peak application periods at major border entry systems.",
      },
      interpretationGuidance: [
        "Are all legacy integration points documented and mapped to individual services?",
        "Has a remediation timeline been agreed for each high-risk legacy dependency?",
      ],
      regulatoryContext:
        "MyCoID 2002 — data-residency provisions apply to integration patterns.",
      reviewingBody: "Enterprise Architecture Review Board",
    };

    const sig2: CreateSignalInput = {
      signalCategory: "Complexity Accumulation",
      signalTitle: "Permit Workflow Branch Growth",
      signalDescription:
        "Approval paths have grown to include over thirty conditional branches, reducing processing consistency across permit categories.",
      evidenceSummary: {
        observationWindow: "Q4 2025 – Q1 2026",
        relatedDecisionCount: 7,
        qualitativePattern:
          "New permit categories added over successive quarters without rationalising existing branch conditions.",
      },
      interpretationGuidance: [
        "Has the full set of workflow branches been reviewed against current permit categories?",
        "Are branch conditions documented with explicit business justifications?",
      ],
      reviewingBody: "Digital Transformation Steering Committee",
    };

    createSignal(sig1);
    createSignal(sig2);

    const promotionCount = CTAD_NODES.filter(
      (n) =>
        n.boundRequirementIds !== undefined && n.boundRequirementIds.length > 0,
    ).length;

    return {
      orgId: org.id,
      workItemId: wiId,
      modules: moduleList.length,
      requirements: REQUIREMENT_FIXTURES.length,
      nodes: nodeCount,
      edges: edgeCount,
      ous: 2,
      signals: 2,
      ctadNodes: ctadNodeCount,
      promotions: promotionCount,
    };
  });
}

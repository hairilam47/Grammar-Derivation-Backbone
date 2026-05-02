// Golden-scenario seeder — deterministic test data for
// "Immigration Department of Malaysia – Core Systems Modernisation".
//
// Routes exclusively through validator-gated public store APIs
// (createOrganisation, renameWorkItem, createModule, saveRequirement,
// approveRequirement, createOu, createNode, updateNodeParent,
// updateNodeProperties, createEdge, clearWorkspace, clearOus,
// ensureDomainContainers, createSignal).
// No raw localStorage write is performed for governance / ACW state.
//
// Determinism contract
// --------------------
// Running the seeder twice over the seeded state must produce a
// byte-identical localStorage snapshot. To ensure that:
//   * The scope is set to FIXED keys (ORG_ID + WI_SCOPE_ID) before any
//     store write. All WI-scoped storage therefore resolves to the same
//     on-disk keys on every run.
//   * The existing data under those keys is cleared before re-seeding,
//     so reruns are idempotent.
//   * withFrozenClock freezes Date, Math.random, crypto.randomUUID, and
//     crypto.getRandomValues so every store-internal timestamp, counter,
//     and random id (including the auto-generated blueprint WI id that
//     createOrganisation assigns) resolves to the same value every run.
//
// Idempotency flow
// ----------------
//   1. Set currentScope to the fixed (ORG_ID, WI_SCOPE_ID) pair.
//   2. Resolve + removeItem each governed base key from localStorage.
//   3. clearWorkspace() + clearOus() clear the in-memory and on-disk
//      caches for the canvas and OU stores.
//   4. removeOrganisation(ORG_ID) removes the org entry if it exists.
//   5. __resetScopedStorageForTest() + store reload flush all caches.
//   6. Re-seed from scratch inside withFrozenClock.

import {
  createOrganisation,
  getOrganisation,
  removeOrganisation,
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
  updateNodeParent,
  updateNodeProperties,
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
import {
  currentScope,
  resolveActiveKey,
} from "@/governance/storageKeyUtils";
import { __resetScopedStorageForTest } from "@/governance/scopedStorageClient";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID = "org-jabatan-imigresen";
const ORG_NAME = "Jabatan Imigresen Malaysia";
// Fixed scope key used for all WI-scoped storage. Stable across reruns.
const WI_SCOPE_ID = "wi-immigration-modernisation";
// Display title applied to the auto-created blueprint work item.
const WI_TITLE = "Immigration Systems Modernisation";

const FROZEN_ISO = "2026-01-15T12:00:00.000Z";
const FROZEN_MS = Date.parse(FROZEN_ISO);

// Base keys that the seeder writes to, matched with their scoping rule.
// Org-only keys resolve under <orgId>:<key>; WI-scoped under
// <orgId>:<workItemId>:<key>. Keep in sync with each store's getKey().
const GOLDEN_BASE_KEYS: ReadonlyArray<{ key: string; needsWorkItem: boolean }> =
  [
    { key: "adc.module-catalog.v1",       needsWorkItem: false },
    { key: "adc.requirements.v1",         needsWorkItem: true  },
    { key: "adc.policy-signals.v1",       needsWorkItem: true  },
    { key: "acw.workspace.v1",            needsWorkItem: true  },
    { key: "acw.workspace.view.v1",       needsWorkItem: true  },
    { key: "acw.organisational-units.v1", needsWorkItem: false },
  ];

// ---------------------------------------------------------------------------
// Public summary type
// ---------------------------------------------------------------------------

export interface GoldenSeedSummary {
  readonly modules: number;
  readonly requirements: number;
  readonly ctadNodes: number;
  readonly acwNodes: number;
  readonly edges: number;
  readonly ous: number;
  readonly signals: number;
}

// ---------------------------------------------------------------------------
// Deterministic clock + entropy freeze
// ---------------------------------------------------------------------------

type SavedGlobals = {
  Date: typeof Date;
  mathRandom: () => number;
  randomUUID?: typeof crypto.randomUUID;
  getRandomValues?: typeof crypto.getRandomValues;
};

function withFrozenClock<T>(fn: () => T): T {
  const RealDate = globalThis.Date;
  const realMathRandom = Math.random;
  const hasCrypto =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function" &&
    typeof crypto.getRandomValues === "function";
  const realUuid = hasCrypto ? crypto.randomUUID.bind(crypto) : undefined;
  const realGetRandomValues = hasCrypto
    ? crypto.getRandomValues.bind(crypto)
    : undefined;

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
  const nextLcg = (): number => {
    randomCounter += 1;
    const x = (randomCounter * 1103515245 + 12345) >>> 0;
    return x;
  };
  const frozenRandom = (): number => (nextLcg() % 0x7fffffff) / 0x7fffffff;

  const saved: SavedGlobals = {
    Date: RealDate,
    mathRandom: realMathRandom,
    randomUUID: realUuid,
    getRandomValues: realGetRandomValues,
  };

  try {
    globalThis.Date = FrozenDate as unknown as typeof Date;
    (globalThis.Date as unknown as { now: () => number }).now = FrozenDate.now;
    Math.random = frozenRandom;

    if (hasCrypto && typeof crypto !== "undefined") {
      crypto.randomUUID = (): ReturnType<typeof crypto.randomUUID> => {
        const seg = (): string =>
          Math.floor(frozenRandom() * 0x10000)
            .toString(16)
            .padStart(4, "0");
        return `${seg()}${seg()}-${seg()}-4${seg().slice(1)}-${seg()}-${seg()}${seg()}${seg()}` as ReturnType<
          typeof crypto.randomUUID
        >;
      };
      crypto.getRandomValues = <T extends ArrayBufferView | null>(
        array: T,
      ): T => {
        if (array === null) return array;
        const buf = array as unknown as { length: number; [i: number]: number };
        for (let i = 0; i < buf.length; i++) {
          buf[i] = nextLcg() & 0xff;
        }
        return array;
      };
    }

    return fn();
  } finally {
    globalThis.Date = saved.Date;
    (globalThis.Date as unknown as { now: () => number }).now =
      saved.Date.now.bind(saved.Date);
    Math.random = saved.mathRandom;
    if (
      hasCrypto &&
      typeof crypto !== "undefined" &&
      saved.randomUUID !== undefined &&
      saved.getRandomValues !== undefined
    ) {
      crypto.randomUUID = saved.randomUUID;
      crypto.getRandomValues = saved.getRandomValues;
    }
  }
}

// ---------------------------------------------------------------------------
// Idempotent clear — wipes the target scope before re-seeding
// ---------------------------------------------------------------------------

function clearGoldenScope(): void {
  if (typeof window === "undefined") return;

  // Step 1: Fix the scope to the stable (orgId, workItemId) pair so that
  // resolveActiveKey resolves the same on-disk keys on every run.
  currentScope.set({ orgId: ORG_ID, workItemId: WI_SCOPE_ID });

  // Step 2: Remove each governed base key from localStorage so a second
  // run starts from a truly empty slate at the storage layer.
  for (const { key, needsWorkItem } of GOLDEN_BASE_KEYS) {
    const resolved = resolveActiveKey(key, needsWorkItem);
    if (resolved !== null) {
      window.localStorage.removeItem(resolved);
    }
  }

  // Step 3: Tell the canvas and OU store caches to forget their in-memory
  // state (they may have been populated by a previous seed run).
  clearWorkspace();
  clearOus();

  // Step 4: Remove the org entry (which also carries the real blueprint WI
  // id). On the first run the org does not exist yet — guard accordingly.
  if (getOrganisation(ORG_ID) !== null) {
    removeOrganisation(ORG_ID);
  }

  // Step 5: Flush the scoped-storage layer's internal state so subsequent
  // reads return empty instead of a stale snapshot.
  __resetScopedStorageForTest();

  // Step 6: Reload in-memory caches from the now-cleared storage.
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

// 5 CTAD logical-diagram nodes. All are created inside domain-technology
// as a staging container; then updateNodeParent promotes each to its
// semantically correct domain (the three that also receive
// boundRequirementIds via updateNodeProperties are the "promoted" nodes
// referenced in the task spec).
interface CtadNodeSpec {
  readonly id: string;
  readonly stagingParentId: string;
  readonly targetParentId: string;
  readonly label: string;
  readonly diagramType: AcwDiagramType;
  readonly diagramSubtype: string;
  readonly x: number;
  readonly y: number;
  readonly boundRequirementIds?: readonly string[];
  readonly moduleId?: string;
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

// All 5 CTAD nodes start in domain-technology (staging), then each is
// moved to its semantic target domain via updateNodeParent. The three
// that also receive boundRequirementIds are the "CTAD-to-canvas
// promoted" nodes (task spec §1, promotion step).
const CTAD_NODES: readonly CtadNodeSpec[] = [
  {
    id:              "gn-ctad-bpmn",
    stagingParentId: "domain-technology",
    targetParentId:  "domain-business",
    label:           "Border Entry Process",
    diagramType:     "bpmn",
    diagramSubtype:  "Border Entry Process BPMN",
    x: 860, y: 60,
    boundRequirementIds: ["req-aa01bb02cc03", "req-bb02cc03dd04"],
    moduleId: "module:citizen-portal",
  },
  {
    id:              "gn-ctad-erd",
    stagingParentId: "domain-technology",
    targetParentId:  "domain-data",
    label:           "Core Entities ERD",
    diagramType:     "erd",
    diagramSubtype:  "Core Entities ERD",
    x: 860, y: 60,
    boundRequirementIds: ["req-0222a333b444"],
    moduleId: "module:document-mgmt",
  },
  {
    id:              "gn-ctad-seq",
    stagingParentId: "domain-technology",
    targetParentId:  "domain-application",
    label:           "Visa Application Flow",
    diagramType:     "sequence",
    diagramSubtype:  "Visa Application Flow",
    x: 860, y: 220,
    boundRequirementIds: ["req-a333b444c555"],
    moduleId: "module:workflow-approval",
  },
  {
    id:              "gn-ctad-ddl",
    stagingParentId: "domain-technology",
    targetParentId:  "domain-data",
    label:           "Physical DDL",
    diagramType:     "ddl",
    diagramSubtype:  "Physical DDL",
    x: 1060, y: 60,
  },
  {
    id:              "gn-ctad-class",
    stagingParentId: "domain-technology",
    targetParentId:  "domain-application",
    label:           "Payment Module Class",
    diagramType:     "class",
    diagramSubtype:  "Payment Module Class Diagram",
    x: 1060, y: 220,
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
  {
    id: "req-aa01bb02cc03",
    title: "Citizen Self-Service Portal",
    description:
      "Travellers access permit applications through a self-service web channel.",
    type: "functional",
    urgency: "medium",
    moduleId: "module:citizen-portal",
  },
  {
    id: "req-bb02cc03dd04",
    title: "Application Submission",
    description:
      "Permit applications are submitted digitally with structured field validation.",
    type: "functional",
    urgency: "high",
    moduleId: "module:citizen-portal",
  },
  {
    id: "req-cc03dd04ee05",
    title: "Biometric Verification",
    description:
      "Fingerprint and facial biometrics are captured at border entry points.",
    type: "functional",
    urgency: "critical",
    moduleId: "module:citizen-portal",
  },
  {
    id: "req-dd04ee05ff06",
    title: "Case Status Tracking",
    description:
      "Officers and applicants track case progress through defined workflow stages.",
    type: "functional",
    urgency: "medium",
    moduleId: "module:case-management",
  },
  {
    id: "req-ee05ff060011",
    title: "Case Assignment",
    description:
      "Cases are routed to available officers based on workload and specialisation.",
    type: "functional",
    urgency: "medium",
    moduleId: "module:case-management",
  },
  {
    id: "req-ff0600110222",
    title: "System Response Time",
    description:
      "Portal transactions complete within an agreed latency threshold under peak load.",
    type: "non-functional",
    urgency: "medium",
    moduleId: "module:internal-admin",
  },
  {
    id: "req-00110222a333",
    title: "System Availability",
    description:
      "Core services maintain continuous operation outside scheduled maintenance windows.",
    type: "non-functional",
    urgency: "high",
    moduleId: "module:internal-admin",
  },
  {
    id: "req-0222a333b444",
    title: "Data Sovereignty",
    description:
      "All personal data is stored and processed within Malaysian jurisdiction.",
    type: "constraint",
    urgency: "high",
    moduleId: "module:document-mgmt",
  },
  {
    id: "req-a333b444c555",
    title: "Audit Trail",
    description:
      "Every state transition in the permit workflow produces a tamper-evident audit record.",
    type: "constraint",
    urgency: "critical",
    moduleId: "module:workflow-approval",
  },
  {
    id: "req-b444c555d666",
    title: "Biometric Terminals",
    description:
      "Fingerprint scanner units deployed at all gazetted border entry points.",
    type: "hardware",
    urgency: "high",
    moduleId: "module:citizen-portal",
    hardwareDetails: {
      itemName: "Fingerprint Scanner Unit",
      model: "DigitalPersona U.are.U 4500",
      quantity: 150,
      unitCostEstimate: 320,
      notes:
        "Units cover all entry lanes; replacements held at regional depots.",
    },
  },
  {
    id: "req-c555d666e777",
    title: "Audit Log Capacity",
    description:
      "Audit log store supports ten years of retention for all permit workflow events.",
    type: "non-functional",
    urgency: "low",
    moduleId: "module:reporting-analytics",
  },
];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function seedGolden(): GoldenSeedSummary {
  // Wipe the target scope so every run starts from a clean slate.
  clearGoldenScope();

  return withFrozenClock(() => {
    // ------------------------------------------------------------------
    // 1. Organisation + EA Blueprint Work Item
    //
    // The scope was already set to (ORG_ID, WI_SCOPE_ID) by
    // clearGoldenScope, so all WI-scoped store writes resolve to the
    // stable key prefix. The blueprint WI created inside
    // createOrganisation gets a deterministic id (crypto.getRandomValues
    // is frozen above); we capture it only for the rename call below.
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

    // Reload caches now that the org and WI entries exist in storage.
    __acwStoreInternals.reloadFromStorageForTest();
    __ouStoreInternals.reloadFromStorageForTest();

    // ------------------------------------------------------------------
    // 2. Six modules (one per capability area)
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
    const ouBorderResult = createOu({
      id: "ou-border",
      name: "Border Control Operations",
    });
    const ouVisaResult = createOu({
      id: "ou-visa",
      name: "Visa Services",
    });

    // ------------------------------------------------------------------
    // 5. EAStudio canvas — 4 domain containers + 31 child nodes
    // ------------------------------------------------------------------
    clearWorkspace();
    ensureDomainContainers();

    const nodeIdMap = new Map<string, string>();
    let acwNodeCount = 0;

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
        acwNodeCount += 1;
      }
    }

    // ------------------------------------------------------------------
    // 6. OU assignments to Business Process domain nodes
    // ------------------------------------------------------------------
    const busProcId = nodeIdMap.get("gn-bus-process");
    const busValueId = nodeIdMap.get("gn-bus-value");
    if (ouBorderResult.ok && busProcId !== undefined) {
      updateNodeProperties(busProcId, {
        organisationalUnitId: ouBorderResult.id,
      });
    }
    if (ouVisaResult.ok && busValueId !== undefined) {
      updateNodeProperties(busValueId, {
        organisationalUnitId: ouVisaResult.id,
      });
    }

    // ------------------------------------------------------------------
    // 7. CTAD logical-diagram nodes
    //
    // Two-step promotion flow (task spec §1, promotion step):
    //   a) Create each CTAD node inside domain-technology (staging).
    //   b) updateNodeParent to move it to its semantic target domain.
    //   c) updateNodeProperties to set boundRequirementIds + moduleId on
    //      the three promoted nodes (BPMN, ERD, Sequence).
    // ------------------------------------------------------------------
    let ctadNodeCount = 0;

    for (const spec of CTAD_NODES) {
      // a) Create in staging container.
      const r = createNode({
        id:            spec.id,
        type:          "System",
        parentId:      spec.stagingParentId,
        label:         spec.label,
        x:             spec.x,
        y:             spec.y,
        diagramType:   spec.diagramType,
        diagramSubtype: spec.diagramSubtype,
      });
      if (!r.ok) continue;

      nodeIdMap.set(spec.id, r.id);
      acwNodeCount += 1;
      ctadNodeCount += 1;

      // b) Promote to semantic target domain via post-create parent update.
      if (spec.targetParentId !== spec.stagingParentId) {
        updateNodeParent(r.id, spec.targetParentId);
      }

      // c) Bind requirements + module on the promoted nodes.
      if (spec.boundRequirementIds !== undefined || spec.moduleId !== undefined) {
        updateNodeProperties(r.id, {
          ...(spec.boundRequirementIds !== undefined
            ? { boundRequirementIds: spec.boundRequirementIds }
            : {}),
          ...(spec.moduleId !== undefined
            ? { moduleId: spec.moduleId }
            : {}),
        });
      }
    }

    // ------------------------------------------------------------------
    // 8. Edges (≥ 10) — CONNECTS / DATA_FLOW / INTERFACES_WITH
    // ------------------------------------------------------------------
    type EdgeKind = "CONNECTS" | "DATA_FLOW" | "INTERFACES_WITH";
    const EDGE_SPECS: readonly { from: string; to: string; kind: EdgeKind }[] =
      [
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
      const toId = nodeIdMap.get(e.to);
      if (fromId === undefined || toId === undefined) continue;
      const r = createEdge({ kind: e.kind, fromId, toId });
      if (r.ok) edgeCount += 1;
    }

    // ------------------------------------------------------------------
    // 9. Policy signals (2)
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
      signalCategory: "Posture Drift",
      signalTitle: "Permit Workflow Deviation Trend",
      signalDescription:
        "Observed approval paths are diverging from the ratified baseline across multiple permit categories over successive quarters.",
      evidenceSummary: {
        observationWindow: "Q4 2025 – Q1 2026",
        relatedDecisionCount: 5,
        qualitativePattern:
          "New conditional branches added without formal review, increasing deviation from the approved workflow model.",
      },
      interpretationGuidance: [
        "Has the current workflow baseline been re-ratified to account for recent permit category additions?",
        "Are deviations from the approved workflow model being tracked and escalated systematically?",
      ],
      reviewingBody: "Digital Transformation Steering Committee",
    };

    createSignal(sig1);
    createSignal(sig2);

    // The org.id is used only internally; the stable scope key is
    // WI_SCOPE_ID. Suppress the unused-variable lint for org.
    void org;

    return {
      modules:      moduleList.length,
      requirements: REQUIREMENT_FIXTURES.length,
      ctadNodes:    ctadNodeCount,
      acwNodes:     acwNodeCount,
      edges:        edgeCount,
      ous:          2,
      signals:      2,
    };
  });
}

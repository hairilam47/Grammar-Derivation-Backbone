// Golden-scenario seeder — deterministic test data for
// "Immigration Department of Malaysia – Core Systems Modernisation".
//
// Routes exclusively through validator-gated public store APIs.
// No raw localStorage write is performed for governance / ACW state.
//
// Determinism contract
// --------------------
// Running the seeder twice must produce a byte-identical localStorage
// snapshot for every key the seeder writes.
//   - withFrozenClock freezes Date, Math.random, crypto.randomUUID, and
//     crypto.getRandomValues so every store-internal timestamp and random
//     id (including the auto-generated blueprint WI id from
//     createOrganisation) resolves identically on every run.
//   - All node/edge/OU ids are hard-coded, so subsequent runs produce
//     the same structure graph.
//
// Idempotency flow
// ----------------
//   1. clearGoldenScope:
//      a. Look up the existing blueprint WI id via getEaBlueprintForOrg.
//      b. Set currentScope to (ORG_ID, existing-WI-id-or-placeholder).
//      c. resolveActiveKey + localStorage.removeItem each governed key.
//      d. clearWorkspace() + clearOus() flush the canvas/OU caches.
//      e. removeOrganisation + removeAllWorkItemsForOrg remove the org.
//      f. __resetScopedStorageForTest + reload caches.
//   2. withFrozenClock:
//      a. createOrganisation → captures deterministic wiId.
//      b. renameWorkItem.
//      c. currentScope.set to real wiId (so scoped stores resolve to the
//         same key path the user opens via Organisation Home → Blueprint).
//      d. Reload caches.
//      e. Seed: modules → requirements → OUs → domain-canvas → CTAD →
//         edges → signals.

import {
  createOrganisation,
  getOrganisation,
  removeOrganisation,
} from "@/governance/orgStore";
import {
  renameWorkItem,
  getEaBlueprintForOrg,
  removeAllWorkItemsForOrg,
} from "@/governance/workItemStore";
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
const WI_TITLE = "Immigration Systems Modernisation";

const FROZEN_ISO = "2026-01-15T12:00:00.000Z";
const FROZEN_MS = Date.parse(FROZEN_ISO);

// Base keys the seeder writes to, with their scoping rule.
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
    ? (crypto.getRandomValues.bind(crypto) as typeof crypto.getRandomValues)
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
    return (randomCounter * 1103515245 + 12345) >>> 0;
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

  // Step 1: Find the existing blueprint WI id (if any) so we can resolve
  // the correct WI-scoped keys to clear. On the very first run no org
  // exists yet, so we fall back to an empty string (no WI-scoped keys
  // will resolve with a null workItemId anyway).
  const existingWi = getEaBlueprintForOrg(ORG_ID);
  const prevWiId = existingWi?.id ?? null;

  // Step 2: Set scope so resolveActiveKey can compute the on-disk key
  // for each base key. We need the WI-scoped stores to clear correctly.
  currentScope.set({ orgId: ORG_ID, workItemId: prevWiId });

  // Step 3: Remove each governed base key from localStorage.
  for (const { key, needsWorkItem } of GOLDEN_BASE_KEYS) {
    const resolved = resolveActiveKey(key, needsWorkItem);
    if (resolved !== null) {
      window.localStorage.removeItem(resolved);
    }
  }

  // Step 4: Tell the canvas and OU stores to forget their in-memory state.
  clearWorkspace();
  clearOus();

  // Step 5: Remove org + all its work items (cascades the WI entry).
  if (getOrganisation(ORG_ID) !== null) {
    removeOrganisation(ORG_ID);
  }
  removeAllWorkItemsForOrg(ORG_ID);

  // Step 6: Flush the scoped-storage layer and reload all caches.
  __resetScopedStorageForTest();
  __acwStoreInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
}

// ---------------------------------------------------------------------------
// Canvas fixtures
// ---------------------------------------------------------------------------

interface DomainNodeSpec {
  readonly id: string;
  readonly label: string;
  readonly parentId: string;
  readonly x: number;
  readonly y: number;
}

// Five diagram types.  Each diagram is represented by multiple nodes that
// share the same (diagramType, diagramSubtype) pair, mirroring how a real
// CTAD design canvas groups elements by diagram instance.
//
// Promotion: the first node for BPMN, ERD, and Sequence is the "anchor"
// node that receives boundRequirementIds + moduleId via updateNodeProperties
// after a post-create updateNodeParent move (spec §1, promotion step).
// Non-promoted nodes are created directly in their target domain.
interface CtadNodeSpec {
  readonly id: string;
  readonly label: string;
  readonly diagramType: AcwDiagramType;
  readonly diagramSubtype: string;
  readonly targetParentId: string;
  readonly x: number;
  readonly y: number;
  // Staging-and-promote only for the three promoted anchor nodes.
  readonly stagingParentId?: string;
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

// BPMN: pool + 2 lanes + 3 tasks + 1 gateway + 2 events = 9 nodes
// (anchor = bpmn-pool → promoted to domain-business)
// ERD: 4 entity nodes (anchor = erd-traveller → promoted to domain-data)
// DDL: 3 table nodes (no promotion)
// Sequence: 3 lifeline nodes (anchor = seq-applicant → promoted to domain-application)
// Class: 3 class nodes (no promotion)
// Total CTAD: 22 nodes
const CTAD_NODES: readonly CtadNodeSpec[] = [
  // -- BPMN (Border Entry Process) ---
  {
    id: "gn-ctad-bpmn-pool",
    label: "Border Entry Pool",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    stagingParentId: "domain-technology",
    x: 860, y: 60,
    boundRequirementIds: ["req-aa01bb02cc03", "req-bb02cc03dd04"],
    moduleId: "module:citizen-portal",
  },
  {
    id: "gn-ctad-bpmn-lane-officer",
    label: "Officer Lane",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 860, y: 200,
  },
  {
    id: "gn-ctad-bpmn-lane-traveller",
    label: "Traveller Lane",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 860, y: 340,
  },
  {
    id: "gn-ctad-bpmn-task-check",
    label: "Check Documents",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 1060, y: 200,
  },
  {
    id: "gn-ctad-bpmn-task-bio",
    label: "Biometric Scan",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 1260, y: 200,
  },
  {
    id: "gn-ctad-bpmn-task-log",
    label: "Log Entry",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 1460, y: 200,
  },
  {
    id: "gn-ctad-bpmn-gateway",
    label: "Approved?",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 1060, y: 340,
  },
  {
    id: "gn-ctad-bpmn-evt-start",
    label: "Entry Start",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 760, y: 270,
  },
  {
    id: "gn-ctad-bpmn-evt-end",
    label: "Entry Complete",
    diagramType: "bpmn",
    diagramSubtype: "Border Entry Process BPMN",
    targetParentId: "domain-business",
    x: 1660, y: 270,
  },
  // -- ERD (Core Entities) ---
  {
    id: "gn-ctad-erd-traveller",
    label: "Traveller",
    diagramType: "erd",
    diagramSubtype: "Core Entities ERD",
    targetParentId: "domain-data",
    stagingParentId: "domain-technology",
    x: 860, y: 480,
    boundRequirementIds: ["req-0222a333b444"],
    moduleId: "module:document-mgmt",
  },
  {
    id: "gn-ctad-erd-permit",
    label: "Permit",
    diagramType: "erd",
    diagramSubtype: "Core Entities ERD",
    targetParentId: "domain-data",
    x: 1060, y: 480,
  },
  {
    id: "gn-ctad-erd-officer",
    label: "Officer",
    diagramType: "erd",
    diagramSubtype: "Core Entities ERD",
    targetParentId: "domain-data",
    x: 860, y: 640,
  },
  {
    id: "gn-ctad-erd-case",
    label: "Case",
    diagramType: "erd",
    diagramSubtype: "Core Entities ERD",
    targetParentId: "domain-data",
    x: 1060, y: 640,
  },
  // -- DDL (Physical Schema) ---
  {
    id: "gn-ctad-ddl-travellers",
    label: "travellers",
    diagramType: "ddl",
    diagramSubtype: "Physical DDL",
    targetParentId: "domain-data",
    x: 860, y: 800,
  },
  {
    id: "gn-ctad-ddl-permits",
    label: "permits",
    diagramType: "ddl",
    diagramSubtype: "Physical DDL",
    targetParentId: "domain-data",
    x: 1060, y: 800,
  },
  {
    id: "gn-ctad-ddl-cases",
    label: "cases",
    diagramType: "ddl",
    diagramSubtype: "Physical DDL",
    targetParentId: "domain-data",
    x: 1260, y: 800,
  },
  // -- Sequence (Visa Application Flow) ---
  {
    id: "gn-ctad-seq-applicant",
    label: "Applicant",
    diagramType: "sequence",
    diagramSubtype: "Visa Application Flow",
    targetParentId: "domain-application",
    stagingParentId: "domain-technology",
    x: 860, y: 480,
    boundRequirementIds: ["req-a333b444c555"],
    moduleId: "module:workflow-approval",
  },
  {
    id: "gn-ctad-seq-portal",
    label: "Portal",
    diagramType: "sequence",
    diagramSubtype: "Visa Application Flow",
    targetParentId: "domain-application",
    x: 1060, y: 480,
  },
  {
    id: "gn-ctad-seq-backend",
    label: "Backend Service",
    diagramType: "sequence",
    diagramSubtype: "Visa Application Flow",
    targetParentId: "domain-application",
    x: 1260, y: 480,
  },
  // -- Class (Payment Module) ---
  {
    id: "gn-ctad-class-permit",
    label: "PermitService",
    diagramType: "class",
    diagramSubtype: "Payment Module Class Diagram",
    targetParentId: "domain-application",
    x: 860, y: 640,
  },
  {
    id: "gn-ctad-class-case",
    label: "CaseManager",
    diagramType: "class",
    diagramSubtype: "Payment Module Class Diagram",
    targetParentId: "domain-application",
    x: 1060, y: 640,
  },
  {
    id: "gn-ctad-class-doc",
    label: "DocumentStore",
    diagramType: "class",
    diagramSubtype: "Payment Module Class Diagram",
    targetParentId: "domain-application",
    x: 1260, y: 640,
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
// Internal helpers
// ---------------------------------------------------------------------------

function warnIfFailed(label: string, result: { ok: boolean; reason?: string }): void {
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[seedGolden] ${label}: ${result.reason ?? "unknown reason"}`);
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function seedGolden(): GoldenSeedSummary {
  // Wipe the target scope so reruns start from a truly clean slate.
  clearGoldenScope();

  return withFrozenClock(() => {
    // ------------------------------------------------------------------
    // 1. Organisation + EA Blueprint Work Item
    //
    // createOrganisation makes NO random calls before generateWorkItemId
    // (id + slug are supplied explicitly, avoiding any slug-dedup random).
    // crypto.getRandomValues is frozen above, so the generated blueprint
    // WI id is the same deterministic bytes on every run.
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

    // Set scope to the REAL blueprint WI id so all WI-scoped store
    // writes target the same key path users open via Organisation Home.
    currentScope.set({ orgId: org.id, workItemId: wiId });
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
    // 3. Eleven requirements — saved then approved
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
    // 5. EAStudio canvas — 4 domain containers + 31 domain child nodes
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
      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[seedGolden] createNode "${spec.id}" failed: ${r.reason}`,
        );
        continue;
      }
      nodeIdMap.set(spec.id, r.id);
      acwNodeCount += 1;
    }

    // ------------------------------------------------------------------
    // 6. OU assignments on Business Process domain nodes
    // ------------------------------------------------------------------
    const busProcId = nodeIdMap.get("gn-bus-process");
    const busValueId = nodeIdMap.get("gn-bus-value");
    if (ouBorderResult.ok && busProcId !== undefined) {
      warnIfFailed(
        "updateNodeProperties(gn-bus-process, ou-border)",
        updateNodeProperties(busProcId, {
          organisationalUnitId: ouBorderResult.id,
        }),
      );
    }
    if (ouVisaResult.ok && busValueId !== undefined) {
      warnIfFailed(
        "updateNodeProperties(gn-bus-value, ou-visa)",
        updateNodeProperties(busValueId, {
          organisationalUnitId: ouVisaResult.id,
        }),
      );
    }

    // ------------------------------------------------------------------
    // 7. CTAD logical-diagram nodes (22 nodes across 5 diagram types)
    //
    // Promotion flow for 3 anchor nodes (BPMN pool, ERD Traveller,
    // Sequence Applicant):
    //   a) Create in staging domain (domain-technology).
    //   b) updateNodeParent → semantic target domain.
    //   c) updateNodeProperties → boundRequirementIds + moduleId.
    // Non-anchor CTAD nodes are created directly in their target domain.
    // ------------------------------------------------------------------
    let ctadNodeCount = 0;

    for (const spec of CTAD_NODES) {
      const isPromoted =
        spec.stagingParentId !== undefined &&
        spec.stagingParentId !== spec.targetParentId;

      // a) Create node — in staging (for promoted) or target directly.
      const initialParent = isPromoted
        ? (spec.stagingParentId as string)
        : spec.targetParentId;

      const r = createNode({
        id:            spec.id,
        type:          "System",
        parentId:      initialParent,
        label:         spec.label,
        x:             spec.x,
        y:             spec.y,
        diagramType:   spec.diagramType,
        diagramSubtype: spec.diagramSubtype,
      });

      if (!r.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[seedGolden] createNode CTAD "${spec.id}" failed: ${r.reason}`,
        );
        continue;
      }

      nodeIdMap.set(spec.id, r.id);
      acwNodeCount += 1;
      ctadNodeCount += 1;

      // b) Post-create parent update (promotion to target domain).
      if (isPromoted) {
        warnIfFailed(
          `updateNodeParent(${spec.id}, ${spec.targetParentId})`,
          updateNodeParent(r.id, spec.targetParentId),
        );
      }

      // c) Bind requirements + module on promoted anchor nodes.
      if (spec.boundRequirementIds !== undefined || spec.moduleId !== undefined) {
        warnIfFailed(
          `updateNodeProperties(${spec.id}, boundReqs+moduleId)`,
          updateNodeProperties(r.id, {
            ...(spec.boundRequirementIds !== undefined
              ? { boundRequirementIds: spec.boundRequirementIds }
              : {}),
            ...(spec.moduleId !== undefined
              ? { moduleId: spec.moduleId }
              : {}),
          }),
        );
      }
    }

    // ------------------------------------------------------------------
    // 8a. Canvas-level CONNECTS edges (≥ 10, no diagramType — rendered
    //     on the main EAStudio canvas between System-typed domain nodes)
    // ------------------------------------------------------------------
    interface CanvasEdgeSpec {
      readonly from: string;
      readonly to: string;
    }
    const CANVAS_EDGE_SPECS: readonly CanvasEdgeSpec[] = [
      { from: "gn-app-portal",  to: "gn-app-gateway" },
      { from: "gn-app-mobile",  to: "gn-app-gateway" },
      { from: "gn-app-web",     to: "gn-app-gateway" },
      { from: "gn-app-gateway", to: "gn-app-service" },
      { from: "gn-app-gateway", to: "gn-app-events"  },
      { from: "gn-app-service", to: "gn-app-events"  },
      { from: "gn-app-portal",  to: "gn-app-service" },
      { from: "gn-app-module",  to: "gn-app-service" },
      { from: "gn-app-integ",   to: "gn-app-gateway" },
      { from: "gn-app-web",     to: "gn-app-service" },
    ];

    let edgeCount = 0;
    for (const e of CANVAS_EDGE_SPECS) {
      const fromId = nodeIdMap.get(e.from);
      const toId   = nodeIdMap.get(e.to);
      if (fromId === undefined || toId === undefined) continue;
      const r = createEdge({ kind: "CONNECTS", fromId, toId });
      if (r.ok) {
        edgeCount += 1;
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[seedGolden] canvas edge ${e.from}→${e.to}: ${r.reason}`);
      }
    }

    // ------------------------------------------------------------------
    // 8b. CTAD diagram-scoped CONNECTS edges — each edge carries
    //     (diagramType, diagramSubtype) matching the nodes it links so
    //     CtadDesignShell renders them inside the correct diagram tab.
    // ------------------------------------------------------------------
    interface CtadEdgeSpec {
      readonly from: string;
      readonly to: string;
      readonly diagramType: AcwDiagramType;
      readonly diagramSubtype: string;
    }
    const CTAD_EDGE_SPECS: readonly CtadEdgeSpec[] = [
      // BPMN — Border Entry Process BPMN
      { from: "gn-ctad-bpmn-evt-start",   to: "gn-ctad-bpmn-pool",        diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-pool",        to: "gn-ctad-bpmn-lane-officer", diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-pool",        to: "gn-ctad-bpmn-lane-traveller", diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-task-check",  to: "gn-ctad-bpmn-gateway",      diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-gateway",     to: "gn-ctad-bpmn-task-bio",     diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-task-bio",    to: "gn-ctad-bpmn-task-log",     diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      { from: "gn-ctad-bpmn-task-log",    to: "gn-ctad-bpmn-evt-end",      diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" },
      // ERD — Core Entities ERD
      { from: "gn-ctad-erd-traveller", to: "gn-ctad-erd-permit",  diagramType: "erd", diagramSubtype: "Core Entities ERD" },
      { from: "gn-ctad-erd-officer",   to: "gn-ctad-erd-case",    diagramType: "erd", diagramSubtype: "Core Entities ERD" },
      { from: "gn-ctad-erd-case",      to: "gn-ctad-erd-permit",  diagramType: "erd", diagramSubtype: "Core Entities ERD" },
      // DDL — Physical DDL
      { from: "gn-ctad-ddl-travellers", to: "gn-ctad-ddl-permits", diagramType: "ddl", diagramSubtype: "Physical DDL" },
      { from: "gn-ctad-ddl-cases",      to: "gn-ctad-ddl-permits", diagramType: "ddl", diagramSubtype: "Physical DDL" },
      // Sequence — Visa Application Flow
      { from: "gn-ctad-seq-applicant", to: "gn-ctad-seq-portal",   diagramType: "sequence", diagramSubtype: "Visa Application Flow" },
      { from: "gn-ctad-seq-portal",    to: "gn-ctad-seq-backend",  diagramType: "sequence", diagramSubtype: "Visa Application Flow" },
      // Class — Payment Module Class Diagram
      { from: "gn-ctad-class-permit", to: "gn-ctad-class-case", diagramType: "class", diagramSubtype: "Payment Module Class Diagram" },
      { from: "gn-ctad-class-case",   to: "gn-ctad-class-doc",  diagramType: "class", diagramSubtype: "Payment Module Class Diagram" },
    ];

    for (const e of CTAD_EDGE_SPECS) {
      const fromId = nodeIdMap.get(e.from);
      const toId   = nodeIdMap.get(e.to);
      if (fromId === undefined || toId === undefined) continue;
      const r = createEdge({
        kind: "CONNECTS",
        fromId,
        toId,
        diagramType:    e.diagramType,
        diagramSubtype: e.diagramSubtype,
      });
      if (r.ok) {
        edgeCount += 1;
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[seedGolden] ctad edge ${e.from}→${e.to}: ${r.reason}`);
      }
    }

    // ------------------------------------------------------------------
    // 9. Policy signals (2: Risk Accumulation + Posture Drift)
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

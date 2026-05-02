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
//   - withFrozenClock freezes Date, Date.now, Math.random,
//     crypto.randomUUID, and crypto.getRandomValues so every
//     store-internal timestamp and random id (including the
//     auto-generated blueprint WI id from createOrganisation)
//     resolves identically on every run.
//   - All node/edge/OU ids are hard-coded, so subsequent runs produce
//     the same structure graph.
//
// Idempotency flow
// ----------------
//   1. clearGoldenScope:
//      a. Look up the existing blueprint WI id via getEaBlueprintForOrg.
//      b. Set currentScope to (ORG_ID, existing-wi-id) so resolveActiveKey
//         produces the correct on-disk key for WI-scoped stores.
//      c. resolveActiveKey + localStorage.removeItem each governed key.
//      d. clearWorkspace() + clearOus() flush the canvas/OU caches.
//      e. removeOrganisation + removeAllWorkItemsForOrg remove the org row.
//      f. __resetScopedStorageForTest + reload caches.
//   2. withFrozenClock:
//      a. createOrganisation → captures deterministic wiId.
//         (We supply id + slug, so NO random calls occur before
//          generateWorkItemId, making wiId byte-stable every run.)
//      b. renameWorkItem to the canonical title.
//      c. currentScope.set to the REAL wiId so all WI-scoped store
//         writes land under the same key path users open via
//         Organisation Home → EA Blueprint.
//      d. Reload caches.
//      e. Seed: modules → requirements → OUs → domain-canvas →
//         CTAD nodes → edges → signals.
//
// Grammar discipline
// ------------------
// domain-business is a BusinessEntity container. Its ONLY permitted
// direct children are Zone nodes (ACW_CONTAINMENT_RULES line 236).
// System and Component nodes must sit inside a Zone that is itself
// inside domain-business. All other domain containers
// (domain-data, domain-application, domain-technology) are Zone, so
// System/Component/ComputeNode children are valid there directly.

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
import type { AcwNodeStatus, AcwNodeMaturity, AcwNodePriority } from "@/acw/acwNodeProperties";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORG_ID   = "org-jabatan-imigresen";
const ORG_NAME = "Jabatan Imigresen Malaysia";
const WI_TITLE = "Immigration Systems Modernisation";

const FROZEN_ISO = "2026-01-15T12:00:00.000Z";
const FROZEN_MS  = Date.parse(FROZEN_ISO);

// Base keys the seeder writes, with their scoping rule.
const GOLDEN_BASE_KEYS: ReadonlyArray<{ key: string; needsWorkItem: boolean }> = [
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
  readonly modules:      number;
  readonly requirements: number;
  readonly ctadNodes:    number;
  readonly acwNodes:     number;
  readonly edges:        number;
  readonly ous:          number;
  readonly signals:      number;
}

// ---------------------------------------------------------------------------
// Deterministic clock + entropy freeze
// ---------------------------------------------------------------------------

function withFrozenClock<T>(fn: () => T): T {
  const RealDate = globalThis.Date;
  const realMathRandom = Math.random;
  const hasCrypto =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function" &&
    typeof crypto.getRandomValues === "function";
  const realUuid = hasCrypto ? crypto.randomUUID.bind(crypto) : undefined;
  const realGrv  = hasCrypto
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
    static override now(): number { return FROZEN_MS; }
  }

  let lcgCounter = 0;
  const nextLcg = (): number => {
    lcgCounter += 1;
    return (lcgCounter * 1103515245 + 12345) >>> 0;
  };
  const frozenRandom = (): number =>
    (nextLcg() % 0x7fffffff) / 0x7fffffff;

  try {
    globalThis.Date = FrozenDate as unknown as typeof Date;
    (globalThis.Date as unknown as { now: () => number }).now = FrozenDate.now;
    Math.random = frozenRandom;

    if (hasCrypto && typeof crypto !== "undefined") {
      crypto.randomUUID = (): ReturnType<typeof crypto.randomUUID> => {
        const seg = (): string =>
          Math.floor(frozenRandom() * 0x10000).toString(16).padStart(4, "0");
        return `${seg()}${seg()}-${seg()}-4${seg().slice(1)}-${seg()}-${seg()}${seg()}${seg()}` as ReturnType<typeof crypto.randomUUID>;
      };
      crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
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
    globalThis.Date = RealDate;
    (globalThis.Date as unknown as { now: () => number }).now =
      RealDate.now.bind(RealDate);
    Math.random = realMathRandom;
    if (hasCrypto && typeof crypto !== "undefined" &&
        realUuid !== undefined && realGrv !== undefined) {
      crypto.randomUUID = realUuid;
      crypto.getRandomValues = realGrv;
    }
  }
}

// ---------------------------------------------------------------------------
// Idempotent clear
// ---------------------------------------------------------------------------

function clearGoldenScope(): void {
  if (typeof window === "undefined") return;

  // Determine the WI id that was used on the previous run (if any).
  // getEaBlueprintForOrg reads the unscoped workItem doc, so it works
  // even when currentScope is pointing at a different org.
  const existingWi = getEaBlueprintForOrg(ORG_ID);
  const prevWiId   = existingWi?.id ?? null;

  // Set scope so resolveActiveKey can build the correct on-disk key
  // for WI-scoped base keys.
  currentScope.set({ orgId: ORG_ID, workItemId: prevWiId });

  for (const { key, needsWorkItem } of GOLDEN_BASE_KEYS) {
    const resolved = resolveActiveKey(key, needsWorkItem);
    if (resolved !== null) {
      window.localStorage.removeItem(resolved);
    }
  }

  clearWorkspace();
  clearOus();

  if (getOrganisation(ORG_ID) !== null) {
    removeOrganisation(ORG_ID);
  }
  removeAllWorkItemsForOrg(ORG_ID);

  __resetScopedStorageForTest();
  __acwStoreInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Throws if a required node could not be created. */
function requireNode(spec: Parameters<typeof createNode>[0]): string {
  const r = createNode(spec);
  if (!r.ok) {
    throw new Error(
      `[seedGolden] required createNode "${spec.id}" refused: ${r.reason}`,
    );
  }
  return r.id;
}

/** Logs a warning if a non-critical mutation is refused. */
function warnIfFailed(label: string, result: { ok: boolean; reason?: string }): void {
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[seedGolden] ${label}: ${result.reason ?? "unknown reason"}`);
  }
}

// ---------------------------------------------------------------------------
// Requirement fixture type
// ---------------------------------------------------------------------------

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
      notes: "Units cover all entry lanes; replacements held at regional depots.",
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
  clearGoldenScope();

  return withFrozenClock(() => {
    // ---------------------------------------------------------------
    // 1. Organisation + EA Blueprint Work Item
    //
    // We supply both `id` and `slug` explicitly, so createOrganisation
    // makes NO random calls before generateWorkItemId. With
    // crypto.getRandomValues frozen, the resulting wiId is the same
    // deterministic bytes on every run.
    // ---------------------------------------------------------------
    const { organisation: org, eaBlueprintWorkItemId: wiId } =
      createOrganisation({
        id:               ORG_ID,
        slug:             "jabatan-imigresen",
        name:             ORG_NAME,
        sector:           "government",
        natureOfBusiness: "government-administration",
      });

    renameWorkItem(wiId, WI_TITLE);

    // Align scope to the REAL blueprint WI id so all WI-scoped store
    // writes land under the same key path users open from Org Home.
    currentScope.set({ orgId: org.id, workItemId: wiId });
    __acwStoreInternals.reloadFromStorageForTest();
    __ouStoreInternals.reloadFromStorageForTest();

    // ---------------------------------------------------------------
    // 2. Six modules
    // ---------------------------------------------------------------
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

    // ---------------------------------------------------------------
    // 3. Eleven requirements — saved then approved
    // ---------------------------------------------------------------
    for (const r of REQUIREMENT_FIXTURES) {
      saveRequirement({
        id:          r.id,
        workItemId:  wiId,
        title:       r.title,
        description: r.description,
        type:        r.type,
        urgency:     r.urgency,
        moduleId:    r.moduleId,
        ...(r.hardwareDetails !== undefined
          ? { hardwareDetails: r.hardwareDetails }
          : {}),
        status: "draft",
      });
      approveRequirement(r.id);
    }

    // ---------------------------------------------------------------
    // 4. Organisational Units
    // ---------------------------------------------------------------
    const ouBorder = createOu({ id: "ou-border", name: "Border Control Operations" });
    const ouVisa   = createOu({ id: "ou-visa",   name: "Visa Services"             });

    // ---------------------------------------------------------------
    // 5. EAStudio canvas
    //
    // ACW containment discipline:
    //   domain-business  = BusinessEntity  → ONLY Zone children directly
    //   domain-data      = Zone            → Zone/System/Component OK
    //   domain-application = Zone          → Zone/System/Component OK
    //   domain-technology  = Zone          → Zone/System/ComputeNode/Component OK
    //
    // All palette items in the Business domain are Zone type (Strategy Map,
    // Business Process, Governance Model, etc.).
    // System nodes belong in the data / application / technology domains.
    // ---------------------------------------------------------------
    clearWorkspace();
    ensureDomainContainers();

    // Palette lookup shorthand: resolves elementType + optional bound fields.
    const pal = (label: string) => paletteItemByLabel(label);

    // nodeIdMap maps stable spec id → store-returned id (same if no collision)
    const nodeIdMap = new Map<string, string>();
    let acwNodeCount = 0;

    // Helper: create a required canvas node; throws on refusal.
    const mkNode = (
      id: string,
      label: string,
      parentId: string | null,
      x: number,
      y: number,
      extra: Record<string, unknown> = {},
    ): string => {
      const item = pal(label);
      const type = (extra._type as string | undefined) ?? item?.elementType;
      if (type === undefined) {
        throw new Error(`[seedGolden] no palette item found for label "${label}"`);
      }
      const nodeId = requireNode({
        id,
        type: type as Parameters<typeof createNode>[0]["type"],
        parentId,
        label,
        x,
        y,
        ...(item?.boundTechnologyCategory !== undefined
          ? { boundTechnologyCategory: item.boundTechnologyCategory }
          : {}),
        ...(item?.boundParam !== undefined ? { boundParam: item.boundParam } : {}),
        ...Object.fromEntries(
          Object.entries(extra).filter(([k]) => k !== "_type"),
        ),
      });
      nodeIdMap.set(id, nodeId);
      acwNodeCount += 1;
      return nodeId;
    };

    // -- 5a. Business domain (BusinessEntity → Zone children only) --
    mkNode("gn-imm-strategy",   "Strategy Map",      "domain-business",  80,  80);
    mkNode("gn-imm-governance",  "Governance Model",  "domain-business", 280,  80);
    mkNode("gn-imm-capability",  "Capability Map",    "domain-business", 480,  80);
    mkNode("gn-imm-value",       "Value Stream",      "domain-business",  80, 280);
    mkNode("gn-imm-orgunit",     "Org Unit",          "domain-business", 280, 280);
    mkNode("gn-imm-compliance",  "Compliance",        "domain-business", 480, 280);
    // Business Process Zone — this is also the CTAD BPMN staging target
    // (Zone inside BusinessEntity → valid; System inside Zone → valid).
    mkNode("gn-imm-bprocess",    "Business Process",  "domain-business", 680,  80);

    // -- 5b. Data domain (Zone container → System/Zone/Component OK) --
    mkNode("gn-imm-datastore",   "Data Store",    "domain-data",  80,  80);
    mkNode("gn-imm-datastream",  "Data Stream",   "domain-data", 280,  80);
    mkNode("gn-imm-dataproduct", "Data Product",  "domain-data", 480,  80);
    mkNode("gn-imm-etl",         "ETL Pipeline",  "domain-data", 680,  80);

    // -- 5c. Application domain (Zone container → System/Component OK) --
    mkNode("gn-imm-portal",    "Application", "domain-application",  80,  80);
    mkNode("gn-imm-gateway",   "API Gateway", "domain-application", 280,  80);
    mkNode("gn-imm-service",   "Microservice","domain-application", 480,  80);
    mkNode("gn-imm-mobile",    "Mobile App",  "domain-application",  80, 280);
    mkNode("gn-imm-events",    "Event Bus",   "domain-application", 280, 280);
    mkNode("gn-imm-webportal", "Web Portal",  "domain-application", 480, 280);

    // -- 5d. Technology domain (Zone container → Zone/ComputeNode/Component) --
    mkNode("gn-imm-cloud",      "Cloud Region",    "domain-technology",  80,  80);
    mkNode("gn-imm-network",    "Network Layer",   "domain-technology", 280,  80);
    mkNode("gn-imm-runtime",    "Runtime Engine",  "domain-technology", 480,  80);
    mkNode("gn-imm-iam",        "IAM Service",     "domain-technology",  80, 280);
    mkNode("gn-imm-monitoring", "Monitoring",      "domain-technology", 280, 280);
    mkNode("gn-imm-database",   "Database",        "domain-technology", 480, 280);
    mkNode("gn-imm-storage",    "Object Storage",  "domain-technology", 680,  80);

    // -- 5e. OU assignments --
    if (ouBorder.ok) {
      const bpId = nodeIdMap.get("gn-imm-bprocess");
      if (bpId !== undefined) {
        warnIfFailed(
          "updateNodeProperties(gn-imm-bprocess, ou-border)",
          updateNodeProperties(bpId, { organisationalUnitId: ouBorder.id }),
        );
      }
    }
    if (ouVisa.ok) {
      const ouId = nodeIdMap.get("gn-imm-orgunit");
      if (ouId !== undefined) {
        warnIfFailed(
          "updateNodeProperties(gn-imm-orgunit, ou-visa)",
          updateNodeProperties(ouId, { organisationalUnitId: ouVisa.id }),
        );
      }
    }

    // -- 5f. Enrich key nodes with status / maturity / priority / owner --
    const enrichKey = (
      specId: string,
      props: {
        status?: AcwNodeStatus;
        maturity?: AcwNodeMaturity;
        priority?: AcwNodePriority;
        owner?: string;
      },
    ) => {
      const id = nodeIdMap.get(specId);
      if (id === undefined) return;
      warnIfFailed(
        `updateNodeProperties(${specId}, enrichment)`,
        updateNodeProperties(id, props),
      );
    };

    enrichKey("gn-imm-portal",   { status: "active",   priority: "critical", owner: "Digital Services Division" });
    enrichKey("gn-imm-gateway",  { status: "active",   maturity: "managed"  });
    enrichKey("gn-imm-service",  { status: "planned",  priority: "high"     });
    enrichKey("gn-imm-bprocess", { status: "active",   maturity: "defined"  });
    enrichKey("gn-imm-datastore",{ status: "active",   owner: "Data Management Office" });
    enrichKey("gn-imm-iam",      { status: "active",   priority: "critical" });

    // ---------------------------------------------------------------
    // 6. CTAD logical-diagram nodes (22 nodes, 5 diagram types)
    //
    // Grammar: CTAD nodes use type "System".
    //   System permitted parents: [null, "ComputeNode", "Zone"]
    //   domain-business is BusinessEntity → System NOT allowed there directly.
    //   BPMN nodes land in gn-imm-bprocess (Zone inside BusinessEntity) ✓
    //   ERD/DDL nodes land in domain-data (Zone) ✓
    //   Sequence/Class nodes land in domain-application (Zone) ✓
    //
    // Promotion flow (3 anchor nodes only):
    //   Stage anchor in domain-technology → updateNodeParent → target Zone
    //   Then updateNodeProperties → boundRequirementIds + moduleId.
    //   Non-anchor CTAD nodes are created directly in their target Zone.
    // ---------------------------------------------------------------
    let ctadNodeCount = 0;

    interface CtadNodeSpec {
      readonly id: string;
      readonly label: string;
      readonly diagramType: AcwDiagramType;
      readonly diagramSubtype: string;
      readonly targetParentId: string;
      readonly x: number;
      readonly y: number;
      readonly stagingParentId?: string;
      readonly boundRequirementIds?: readonly string[];
      readonly moduleId?: string;
    }

    const CTAD_NODES: readonly CtadNodeSpec[] = [
      // -- BPMN: Border Entry Process (→ gn-imm-bprocess Zone) --
      { id: "gn-ctad-bpmn-pool",       label: "Border Entry Pool",  diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", stagingParentId: "domain-technology", x: 860, y:  60, boundRequirementIds: ["req-aa01bb02cc03", "req-bb02cc03dd04"], moduleId: "module:citizen-portal" },
      { id: "gn-ctad-bpmn-lane-officer",label: "Officer Lane",       diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x: 860, y: 200 },
      { id: "gn-ctad-bpmn-lane-traveller",label:"Traveller Lane",    diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x: 860, y: 340 },
      { id: "gn-ctad-bpmn-task-check",  label: "Check Documents",    diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x:1060, y: 200 },
      { id: "gn-ctad-bpmn-task-bio",    label: "Biometric Scan",     diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x:1260, y: 200 },
      { id: "gn-ctad-bpmn-task-log",    label: "Log Entry",          diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x:1460, y: 200 },
      { id: "gn-ctad-bpmn-gateway",     label: "Approved?",          diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x:1060, y: 340 },
      { id: "gn-ctad-bpmn-evt-start",   label: "Entry Start",        diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x: 760, y: 270 },
      { id: "gn-ctad-bpmn-evt-end",     label: "Entry Complete",     diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN", targetParentId: "gn-imm-bprocess", x:1660, y: 270 },
      // -- ERD: Core Entities (→ domain-data Zone) --
      { id: "gn-ctad-erd-traveller",    label: "Traveller",          diagramType: "erd",  diagramSubtype: "Core Entities ERD", targetParentId: "domain-data", stagingParentId: "domain-technology", x: 860, y: 480, boundRequirementIds: ["req-0222a333b444"], moduleId: "module:document-mgmt" },
      { id: "gn-ctad-erd-permit",       label: "Permit",             diagramType: "erd",  diagramSubtype: "Core Entities ERD", targetParentId: "domain-data",  x:1060, y: 480 },
      { id: "gn-ctad-erd-officer",      label: "Officer",            diagramType: "erd",  diagramSubtype: "Core Entities ERD", targetParentId: "domain-data",  x: 860, y: 640 },
      { id: "gn-ctad-erd-case",         label: "Case",               diagramType: "erd",  diagramSubtype: "Core Entities ERD", targetParentId: "domain-data",  x:1060, y: 640 },
      // -- DDL: Physical Schema (→ domain-data Zone) --
      { id: "gn-ctad-ddl-travellers",   label: "travellers",         diagramType: "ddl",  diagramSubtype: "Physical DDL", targetParentId: "domain-data",  x: 860, y: 800 },
      { id: "gn-ctad-ddl-permits",      label: "permits",            diagramType: "ddl",  diagramSubtype: "Physical DDL", targetParentId: "domain-data",  x:1060, y: 800 },
      { id: "gn-ctad-ddl-cases",        label: "cases",              diagramType: "ddl",  diagramSubtype: "Physical DDL", targetParentId: "domain-data",  x:1260, y: 800 },
      // -- Sequence: Visa Application Flow (→ domain-application Zone) --
      { id: "gn-ctad-seq-applicant",    label: "Applicant",          diagramType: "sequence", diagramSubtype: "Visa Application Flow", targetParentId: "domain-application", stagingParentId: "domain-technology", x: 860, y: 480, boundRequirementIds: ["req-a333b444c555"], moduleId: "module:workflow-approval" },
      { id: "gn-ctad-seq-portal",       label: "Portal",             diagramType: "sequence", diagramSubtype: "Visa Application Flow", targetParentId: "domain-application", x:1060, y: 480 },
      { id: "gn-ctad-seq-backend",      label: "Backend Service",    diagramType: "sequence", diagramSubtype: "Visa Application Flow", targetParentId: "domain-application", x:1260, y: 480 },
      // -- Class: Payment Module (→ domain-application Zone) --
      { id: "gn-ctad-class-permit",     label: "PermitService",      diagramType: "class", diagramSubtype: "Payment Module Class Diagram", targetParentId: "domain-application", x: 860, y: 640 },
      { id: "gn-ctad-class-case",       label: "CaseManager",        diagramType: "class", diagramSubtype: "Payment Module Class Diagram", targetParentId: "domain-application", x:1060, y: 640 },
      { id: "gn-ctad-class-doc",        label: "DocumentStore",      diagramType: "class", diagramSubtype: "Payment Module Class Diagram", targetParentId: "domain-application", x:1260, y: 640 },
    ];

    for (const spec of CTAD_NODES) {
      const isPromoted =
        spec.stagingParentId !== undefined &&
        spec.stagingParentId !== spec.targetParentId;

      const initialParent = isPromoted
        ? (spec.stagingParentId as string)
        : spec.targetParentId;

      // Throws if the node cannot be created — CTAD nodes are required fixtures.
      const nodeId = requireNode({
        id:             spec.id,
        type:           "System",
        parentId:       initialParent,
        label:          spec.label,
        x:              spec.x,
        y:              spec.y,
        diagramType:    spec.diagramType,
        diagramSubtype: spec.diagramSubtype,
      });

      nodeIdMap.set(spec.id, nodeId);
      acwNodeCount  += 1;
      ctadNodeCount += 1;

      // Post-create parent update (stage → target domain Zone).
      if (isPromoted) {
        warnIfFailed(
          `updateNodeParent(${spec.id}, ${spec.targetParentId})`,
          updateNodeParent(nodeId, spec.targetParentId),
        );
      }

      // Bind requirements + module on the three anchor nodes.
      if (spec.boundRequirementIds !== undefined || spec.moduleId !== undefined) {
        warnIfFailed(
          `updateNodeProperties(${spec.id}, boundReqs+moduleId)`,
          updateNodeProperties(nodeId, {
            ...(spec.boundRequirementIds !== undefined
              ? { boundRequirementIds: spec.boundRequirementIds }
              : {}),
            ...(spec.moduleId !== undefined ? { moduleId: spec.moduleId } : {}),
          }),
        );
      }
    }

    // ---------------------------------------------------------------
    // 7a. Canvas-level CONNECTS edges (≥10, no diagramType)
    //     Both endpoints must be System type.
    //     Application domain System nodes: Application, API Gateway,
    //     Microservice, Mobile App, Event Bus, Web Portal.
    //     Data domain System nodes: Data Stream, Data Product, ETL Pipeline.
    // ---------------------------------------------------------------
    let edgeCount = 0;

    const mkEdge = (
      fromSpec: string,
      toSpec: string,
      extra: { diagramType?: AcwDiagramType; diagramSubtype?: string } = {},
    ) => {
      const fromId = nodeIdMap.get(fromSpec);
      const toId   = nodeIdMap.get(toSpec);
      if (fromId === undefined || toId === undefined) return;
      const r = createEdge({ kind: "CONNECTS", fromId, toId, ...extra });
      if (r.ok) {
        edgeCount += 1;
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[seedGolden] edge ${fromSpec}→${toSpec}: ${r.reason}`);
      }
    };

    // Application-domain System↔System canvas edges (10 edges)
    mkEdge("gn-imm-portal",    "gn-imm-gateway");
    mkEdge("gn-imm-mobile",    "gn-imm-gateway");
    mkEdge("gn-imm-webportal", "gn-imm-gateway");
    mkEdge("gn-imm-gateway",   "gn-imm-service");
    mkEdge("gn-imm-gateway",   "gn-imm-events");
    mkEdge("gn-imm-service",   "gn-imm-events");
    mkEdge("gn-imm-portal",    "gn-imm-service");
    mkEdge("gn-imm-service",   "gn-imm-datastream");
    mkEdge("gn-imm-datastream","gn-imm-dataproduct");
    mkEdge("gn-imm-etl",       "gn-imm-datastream");

    // ---------------------------------------------------------------
    // 7b. CTAD diagram-scoped CONNECTS edges
    //     Each edge carries (diagramType, diagramSubtype) matching the
    //     nodes so CtadDesignShell renders them in the correct diagram tab.
    // ---------------------------------------------------------------

    // BPMN — Border Entry Process BPMN (7 edges)
    mkEdge("gn-ctad-bpmn-evt-start",    "gn-ctad-bpmn-pool",          { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-pool",         "gn-ctad-bpmn-lane-officer",   { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-pool",         "gn-ctad-bpmn-lane-traveller", { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-task-check",   "gn-ctad-bpmn-gateway",        { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-gateway",      "gn-ctad-bpmn-task-bio",       { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-task-bio",     "gn-ctad-bpmn-task-log",       { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });
    mkEdge("gn-ctad-bpmn-task-log",     "gn-ctad-bpmn-evt-end",        { diagramType: "bpmn", diagramSubtype: "Border Entry Process BPMN" });

    // ERD — Core Entities ERD (3 edges)
    mkEdge("gn-ctad-erd-traveller", "gn-ctad-erd-permit",  { diagramType: "erd", diagramSubtype: "Core Entities ERD" });
    mkEdge("gn-ctad-erd-officer",   "gn-ctad-erd-case",    { diagramType: "erd", diagramSubtype: "Core Entities ERD" });
    mkEdge("gn-ctad-erd-case",      "gn-ctad-erd-permit",  { diagramType: "erd", diagramSubtype: "Core Entities ERD" });

    // DDL — Physical DDL (2 edges)
    mkEdge("gn-ctad-ddl-travellers", "gn-ctad-ddl-permits", { diagramType: "ddl", diagramSubtype: "Physical DDL" });
    mkEdge("gn-ctad-ddl-cases",      "gn-ctad-ddl-permits", { diagramType: "ddl", diagramSubtype: "Physical DDL" });

    // Sequence — Visa Application Flow (2 edges)
    mkEdge("gn-ctad-seq-applicant", "gn-ctad-seq-portal",  { diagramType: "sequence", diagramSubtype: "Visa Application Flow" });
    mkEdge("gn-ctad-seq-portal",    "gn-ctad-seq-backend", { diagramType: "sequence", diagramSubtype: "Visa Application Flow" });

    // Class — Payment Module Class Diagram (2 edges)
    mkEdge("gn-ctad-class-permit", "gn-ctad-class-case", { diagramType: "class", diagramSubtype: "Payment Module Class Diagram" });
    mkEdge("gn-ctad-class-case",   "gn-ctad-class-doc",  { diagramType: "class", diagramSubtype: "Payment Module Class Diagram" });

    // ---------------------------------------------------------------
    // 8. Policy signals (Risk Accumulation + Posture Drift)
    // ---------------------------------------------------------------
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

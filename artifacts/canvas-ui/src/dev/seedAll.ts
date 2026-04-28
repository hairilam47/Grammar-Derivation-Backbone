// Dev-only deterministic seeder for the Architecture Decision Canvas.
//
// Routes EXCLUSIVELY through the validator-gated public store APIs
// (`addOrUpdateEntry`, `createSignal`, `advanceSignal`, `setCtadParam`,
// `addEnvironment`, `createArchitecture`, `setArchitectureParam`,
// `addArchitectureEnvironment`, `applyCard`, `createOu`, `createNode`,
// `createEdge`, `updateNodeProperties`, `updateNodeBinding`, the per-
// lens view-state setters, and the Track 3 view-prefs setters). No
// raw localStorage write is performed for any governance / CTAD /
// ACW state. The seeder is a pure consumer of public surfaces.
//
// Determinism contract
// --------------------
// Running the seeder twice over the seeded state must produce a
// byte-identical localStorage snapshot for every key the seeder
// writes. To get there:
//
//   * Every id (architecture id, signal id, OU id, node id, edge id
//     where applicable, environment id) is hard-coded inside the
//     seeder. Architecture ids carry an 8-hex stable suffix so they
//     satisfy the `ARCHITECTURE_ID_REGEX` invariant the persisted-
//     doc validator enforces.
//   * Every name, decision-date, project-name, OU name, env name
//     is hard-coded.
//   * The seeder freezes the global Date constructor and `Date.now`
//     to a fixed instant (2026-01-15T12:00:00.000Z) for the entire
//     synchronous run, then restores them in a `finally` block.
//     This makes every store-internal `new Date()` call (CTAD
//     params' `updatedAt`, environment add timestamps, applied-card
//     `appliedAt`, signal `createdAt` / `lastReviewedAt`, etc.)
//     resolve to the same instant on every run.
//
// Build-time tree-shaking
// -----------------------
// The seeder module is loaded through `React.lazy()` from App.tsx
// inside an `import.meta.env.DEV` guard, so neither the seeder code
// nor the `/seed-all` route is reachable from a production build.
// The build-bundle regression check (Task #120) verifies the
// production bundle contains no `seedAll` symbol.

import {
  addOrUpdateEntry,
  entryFromADS,
} from "@/governance/portfolioStore";
import { buildADS } from "@/governance/adsBuilder";
import {
  createSignal,
  advanceSignal,
  type CreateSignalInput,
} from "@/governance/signalsStore";
import {
  setCtadParam,
  addEnvironment,
  createArchitecture,
  setArchitectureParam,
  addArchitectureEnvironment,
  type CtadBinding,
} from "@/ctad/ctadStore";
import type { CtadEnvironmentDef } from "@/ctad/ctadRegistry";
import { applyCard } from "@/ctad/cncfApplyService";
import { CNCF_CARDS } from "@/cncf/cncfCatalog";
import {
  createNode,
  createEdge,
  updateNodeProperties,
  updateNodeBinding,
  clearWorkspace,
  __acwStoreInternals,
} from "@/acw/acwStore";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import { paletteItemByLabel } from "@/acw/palette/paletteRegistry";
import {
  setCurrentDomain,
  setActiveLod,
  setViewTab,
  toggleCollapsed,
  __acwViewStateInternals,
} from "@/acw/acwViewState";
import {
  createOu,
  __ouStoreInternals,
} from "@/acw/orgUnits/ouStore";
import {
  setArchitectureViewMode,
  setArchitecturePerspective,
  toggleArchitectureLayerHidden,
  __track3ViewPrefsInternals,
} from "@/acw/track3/track3ViewPrefs";
import { __acwWorkspaceViewPrefsInternals } from "@/acw/acwWorkspaceViewPrefs";
import {
  publishRefusal,
  __acwRefusalChannelInternals,
} from "@/acw/acwRefusalChannel";
import type {
  OrganisationContext,
  TradeOffSettings,
  CapabilitySelection,
} from "@workspace/architecture-grammar";

// Storage keys touched by the seeder. Listed explicitly so the
// preflight clear is exhaustive and discoverable.
const STORAGE_KEYS = [
  "adc.portfolio.v1",
  "adc.policy-signals.v1",
  "adc.architecture-attachments.v1",
  "ctad.state.v1",
  "ctad.constraints.v1",
  "ctad.applied-cards.v1",
  "acw.workspace.v1",
  "acw.workspace.view.v1",
  "acw.workspace.viewprefs.v1",
  "acw.organisational-units.v1",
  "acw.track3.viewprefs.v1",
] as const;

// Frozen instant for the entire seed run. Keeps every store-internal
// `new Date()` / `Date.now()` call resolving to the same value so the
// resulting localStorage snapshot is byte-stable across reruns.
const FROZEN_ISO = "2026-01-15T12:00:00.000Z";
const FROZEN_MS = Date.parse(FROZEN_ISO);

export interface SeedSummary {
  readonly portfolio: number;
  readonly architectures: number;
  readonly nodes: number;
  readonly edges: number;
  readonly ous: number;
  readonly cards: number;
  readonly signals: number;
  readonly track3: number;
  readonly refusalsObserved: number;
  readonly firstRefusalReason: string | null;
}

// ---------------------------------------------------------------
// Portfolio fixtures (3 deterministic decisions). Each fixture
// supplies the inputs the grammar engine needs; `deriveArchitecture`
// runs inside `buildADS` so every derived field (complexity score,
// risk severity, layers present, in-scope capability ids, ECP
// constraint categories, approval-function snapshots) is computed
// from the actual deriver — never hand-coded.
// ---------------------------------------------------------------

interface PortfolioFixture {
  readonly context: OrganisationContext;
  readonly selections: readonly CapabilitySelection[];
  readonly baselineTradeOffs: TradeOffSettings;
  readonly metadata: { projectName: string; approvingAuthority: string };
}

function buildPortfolioFixtures(): readonly PortfolioFixture[] {
  return [
    // Customer Portal Modernization — high-sensitivity external
    // customer portal owned by Sarah Chen. Translates the user's
    // "balanced" intent to (Distributed, Cloud, Full).
    {
      context: {
        organisationType: "Enterprise",
        sensitivityLevel: "High",
        systemIntent: "LegacyReplacement",
        expectedLifespanYears: 8,
      },
      selections: [
        { capabilityId: "CAP_EXTERNAL_ACCESS", status: "IN_SCOPE" },
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_CASE_MANAGEMENT", status: "IN_SCOPE" },
        { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "DEFERRED" },
        { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "OUT_OF_SCOPE" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Distributed",
        deploymentModel: "Cloud",
        scopeLevel: "Full",
      },
      metadata: {
        projectName: "Customer Portal Modernization",
        approvingAuthority: "Sarah Chen",
      },
    },
    // Enterprise Data Lake — medium-sensitivity internal admin
    // owned by Marcus Rivera. Translates the user's "cost-optimized"
    // intent to (Simple, Cloud, Minimal).
    {
      context: {
        organisationType: "Enterprise",
        sensitivityLevel: "Medium",
        systemIntent: "NewCapability",
        expectedLifespanYears: 5,
      },
      selections: [
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_REPORTING_ANALYTICS", status: "IN_SCOPE" },
        { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
        { capabilityId: "CAP_AUDIT_COMPLIANCE", status: "DEFERRED" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Simple",
        deploymentModel: "Cloud",
        scopeLevel: "Minimal",
      },
      metadata: {
        projectName: "Enterprise Data Lake",
        approvingAuthority: "Marcus Rivera",
      },
    },
    // Regulatory Compliance Hub — high-sensitivity internal admin
    // owned by Aisha Khan. Translates the user's "risk-averse"
    // intent to (Distributed, OnPrem, Full).
    {
      context: {
        organisationType: "Government",
        sensitivityLevel: "High",
        systemIntent: "NewCapability",
        expectedLifespanYears: 10,
      },
      selections: [
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_AUDIT_COMPLIANCE", status: "IN_SCOPE" },
        { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "IN_SCOPE" },
        { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Distributed",
        deploymentModel: "OnPrem",
        scopeLevel: "Full",
      },
      metadata: {
        projectName: "Regulatory Compliance Hub",
        approvingAuthority: "Aisha Khan",
      },
    },
  ];
}

// Adapter labels (palette tile labels) → ACW domain. Drives the
// per-domain seed pass; mirrors `DomainGrid.onDrop` semantics by
// resolving each label through `paletteItemByLabel` and forwarding
// `elementType`, `boundTechnologyCategory`, and `boundParam` from
// the palette tile onto the `createNode` request.
interface AcwSeedTile {
  readonly id: string;
  readonly label: string;
  readonly parentId:
    | "domain-business"
    | "domain-data"
    | "domain-application"
    | "domain-technology";
  readonly x: number;
  readonly y: number;
}

// Hard-coded node ids passed through `createNode`'s existing
// optional `id` field so the persisted ACW workspace is byte-stable
// across reruns.
const ACW_SEED_TILES: readonly AcwSeedTile[] = Object.freeze([
  { id: "seed-node-strategy-map", label: "Strategy Map", parentId: "domain-business", x: 80, y: 80 },
  { id: "seed-node-capability-map", label: "Capability Map", parentId: "domain-business", x: 240, y: 80 },
  { id: "seed-node-data-store", label: "Data Store", parentId: "domain-data", x: 80, y: 80 },
  { id: "seed-node-web-portal", label: "Web Portal", parentId: "domain-application", x: 80, y: 80 },
  { id: "seed-node-api-gateway", label: "API Gateway", parentId: "domain-application", x: 240, y: 80 },
  { id: "seed-node-microservice", label: "Microservice", parentId: "domain-application", x: 400, y: 80 },
  { id: "seed-node-cloud-region", label: "Cloud Region", parentId: "domain-technology", x: 80, y: 80 },
  { id: "seed-node-database", label: "Database", parentId: "domain-technology", x: 240, y: 80 },
  { id: "seed-node-monitoring", label: "Monitoring", parentId: "domain-technology", x: 400, y: 80 },
] as const);

// CONNECTS edges between application children. Sealed domain
// containers may not be edge endpoints; only application nodes
// connect to one another in this seed.
const ACW_SEED_EDGES: readonly { from: string; to: string }[] = Object.freeze([
  { from: "Web Portal", to: "API Gateway" },
  { from: "API Gateway", to: "Microservice" },
] as const);

// Hard-coded architecture ids — the 8-hex suffix keeps the value
// inside `ARCHITECTURE_ID_REGEX` so the persisted-doc validator
// accepts them as if they had been generated.
const ARCH_NEXTGEN_ID = "nextgen-platform-deadbeef";
const ARCH_MOBILE_ID = "mobile-first-architecture-cafef00d";

const STUDIO_LENS_ID = "/workspace/studio";

function clearAllSeededKeys(): void {
  if (typeof window === "undefined") return;
  for (const key of STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  // Reload caches for stores that hold an in-memory cache. Stores
  // that read on every call (portfolio, signals, all CTAD stores,
  // architecture-attachment) need no reload.
  __acwStoreInternals.reloadFromStorageForTest();
  __acwViewStateInternals.reloadFromStorageForTest();
  __acwWorkspaceViewPrefsInternals.reloadFromStorageForTest();
  __ouStoreInternals.reloadFromStorageForTest();
  __track3ViewPrefsInternals.reloadFromStorageForTest();
}

// Freezes Date, Date.now, Math.random, and crypto.randomUUID for the
// synchronous duration of `fn` so every store-internal timestamp / id
// resolves deterministically across reruns. Globals are restored in
// `finally`. This is the minimum mechanism that lets the seeder remain
// a pure consumer of existing public store APIs without widening every
// store's signature with a clock-injection parameter.
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

  let uuidCounter = 0;
  const frozenUuid = ((): `${string}-${string}-${string}-${string}-${string}` => {
    uuidCounter += 1;
    const hex = uuidCounter.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}` as `${string}-${string}-${string}-${string}-${string}`;
  }) satisfies typeof crypto.randomUUID;

  const g = globalThis as unknown as GlobalsBag;
  try {
    g.Date = FrozenDate as unknown as DateConstructor;
    Math.random = frozenRandom;
    if (realUuid !== null) {
      (crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID =
        frozenUuid;
    }
    return fn();
  } finally {
    g.Date = RealDate;
    RealDate.now = realNow;
    Math.random = realRandom;
    if (realUuid !== null) {
      (crypto as { randomUUID: typeof crypto.randomUUID }).randomUUID =
        realUuid;
    }
  }
}

// Public entry point. Returns a structured summary the dev page
// renders. Every step of the seed routes through validator-gated
// public APIs; refusals surface through `acwRefusalChannel` and
// are counted in the summary.
export function seedAll(): SeedSummary {
  __acwRefusalChannelInternals.reset();
  let refusalsObserved = 0;
  let firstRefusalReason: string | null = null;
  const noteRefusal = (reason: string): void => {
    refusalsObserved += 1;
    if (firstRefusalReason === null) firstRefusalReason = reason;
    // eslint-disable-next-line no-console
    console.warn("[seedAll] refusal:", reason);
    publishRefusal(reason);
  };

  return withFrozenClock(() => {
    clearAllSeededKeys();

    // ----- ADC portfolio (3 frozen decisions) -------------------
    const fixtures = buildPortfolioFixtures();
    const fixedNow = new Date(FROZEN_ISO);
    for (const fx of fixtures) {
      const ads = buildADS({
        context: fx.context,
        selections: [...fx.selections],
        baselineTradeOffs: fx.baselineTradeOffs,
        metadata: fx.metadata,
        now: fixedNow,
      });
      addOrUpdateEntry(entryFromADS(ads));
    }

    // ----- CTAD: 1 ADC-bound binding (legacy) -------------------
    // Anchors to the first portfolio entry's adsId (computed by
    // `slugifyAdsId(projectName)`). `setCtadParam` materialises
    // the binding doc on first write.
    const legacyBinding: CtadBinding = {
      adsId: "customer-portal-modernization",
      adsVersion: "v1",
    };
    setCtadParam(legacyBinding, "frontendFrameworkClass", "React-like");
    setCtadParam(legacyBinding, "hostingModel", "Public");
    setCtadParam(legacyBinding, "applicationStyle", "Microservices");
    setCtadParam(legacyBinding, "databaseClass", "Relational");
    setCtadParam(legacyBinding, "dataDistribution", "Sharded");
    setCtadParam(legacyBinding, "observabilityStack", "Metrics + Logs + Traces");
    const envDev: CtadEnvironmentDef = {
      id: "env-dev",
      name: "Development",
      kind: "Development",
      hostingModel: "Public",
    };
    const envProd: CtadEnvironmentDef = {
      id: "env-prod",
      name: "Production",
      kind: "Production",
      hostingModel: "Public",
    };
    addEnvironment(legacyBinding, envDev);
    addEnvironment(legacyBinding, envProd);

    // ----- CTAD: 2 standalone architectures ---------------------
    // Hard-coded ids passed via `createArchitecture`'s additive
    // `id` option so the persisted doc is byte-stable across runs.
    let standaloneCount = 0;
    try {
      createArchitecture("NextGen Platform", { id: ARCH_NEXTGEN_ID });
      setArchitectureParam(ARCH_NEXTGEN_ID, "hostingModel", "Hybrid");
      setArchitectureParam(ARCH_NEXTGEN_ID, "applicationStyle", "Microservices");
      setArchitectureParam(ARCH_NEXTGEN_ID, "databaseClass", "Document");
      setArchitectureParam(
        ARCH_NEXTGEN_ID,
        "containerOrchestration",
        "Kubernetes",
      );
      addArchitectureEnvironment(ARCH_NEXTGEN_ID, envDev);
      addArchitectureEnvironment(ARCH_NEXTGEN_ID, envProd);
      standaloneCount += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }
    try {
      createArchitecture("Mobile-First Architecture", { id: ARCH_MOBILE_ID });
      setArchitectureParam(
        ARCH_MOBILE_ID,
        "frontendFrameworkClass",
        "Other",
      );
      setArchitectureParam(ARCH_MOBILE_ID, "hostingModel", "Public");
      addArchitectureEnvironment(ARCH_MOBILE_ID, envProd);
      standaloneCount += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }

    // ----- CNCF apply: 2 cards on the legacy binding ------------
    // cncf:kubernetes sets `containerOrchestration` to a containerd-
    // compatible option (Kubernetes); cncf:vitess constrains
    // `databaseClass` to ["Relational"] (matches the value set
    // above) and `dataDistribution` to ["Sharded"].
    const cardKubernetes = CNCF_CARDS.find((c) => c.id === "cncf:kubernetes");
    const cardVitess = CNCF_CARDS.find((c) => c.id === "cncf:vitess");
    let cncfCardsApplied = 0;
    if (cardKubernetes) {
      try {
        applyCard(legacyBinding, cardKubernetes);
        cncfCardsApplied += 1;
      } catch (err) {
        noteRefusal((err as Error).message);
      }
    } else {
      noteRefusal('CNCF card "cncf:kubernetes" missing from catalog.');
    }
    if (cardVitess) {
      try {
        applyCard(legacyBinding, cardVitess);
        cncfCardsApplied += 1;
      } catch (err) {
        noteRefusal((err as Error).message);
      }
    } else {
      noteRefusal('CNCF card "cncf:vitess" missing from catalog.');
    }

    // ----- Organisational Units (2 fixtures) --------------------
    const ouEng = createOu({ id: "ou-engineering", name: "Engineering" });
    const ouComp = createOu({ id: "ou-compliance", name: "Compliance" });
    if (!ouEng.ok) noteRefusal(ouEng.reason);
    if (!ouComp.ok) noteRefusal(ouComp.reason);

    // ----- ACW workspace: 4 sealed containers + 9 children ------
    clearWorkspace();
    ensureDomainContainers();

    const idByLabel = new Map<string, string>();
    for (const tile of ACW_SEED_TILES) {
      const item = paletteItemByLabel(tile.label);
      if (item === undefined) {
        noteRefusal(
          `Palette tile "${tile.label}" is not present in the registry.`,
        );
        continue;
      }
      const r = createNode({
        id: tile.id,
        type: item.elementType,
        parentId: tile.parentId,
        label: item.label,
        x: tile.x,
        y: tile.y,
        ...(item.boundTechnologyCategory !== undefined
          ? { boundTechnologyCategory: item.boundTechnologyCategory }
          : {}),
        ...(item.boundParam !== undefined
          ? { boundParam: item.boundParam }
          : {}),
      });
      if (!r.ok) {
        noteRefusal(r.reason);
        continue;
      }
      idByLabel.set(tile.label, r.id);
    }

    // CONNECTS edges between application children only.
    let edgesCreated = 0;
    for (const edge of ACW_SEED_EDGES) {
      const fromId = idByLabel.get(edge.from);
      const toId = idByLabel.get(edge.to);
      if (fromId === undefined || toId === undefined) {
        noteRefusal(
          `Edge "${edge.from}" -> "${edge.to}" cannot be created (one endpoint did not seed).`,
        );
        continue;
      }
      const r = createEdge({ kind: "CONNECTS", fromId, toId });
      if (!r.ok) {
        noteRefusal(r.reason);
        continue;
      }
      edgesCreated += 1;
    }

    // OU bindings on two non-container nodes. Microservice →
    // Engineering exercises the application-domain overlay path;
    // Capability Map → Compliance exercises the business-domain path.
    const microserviceId = idByLabel.get("Microservice");
    if (ouEng.ok && microserviceId !== undefined) {
      const upd = updateNodeProperties(microserviceId, {
        organisationalUnitId: ouEng.id,
      });
      if (!upd.ok) noteRefusal(upd.reason);
    }
    const capMapId = idByLabel.get("Capability Map");
    if (ouComp.ok && capMapId !== undefined) {
      const upd = updateNodeProperties(capMapId, {
        organisationalUnitId: ouComp.id,
      });
      if (!upd.ok) noteRefusal(upd.reason);
    }

    // Re-bind one application node through `updateNodeBinding` so
    // the Phase 5 semantic-binding read path is exercised end-to-
    // end (palette default already binds API Gateway via
    // `boundTechnologyCategory`; here we additionally bind a
    // `boundParam` to `containerOrchestration=Kubernetes` so the
    // overlay reflects the legacy binding's chosen orchestrator).
    const apiGatewayId = idByLabel.get("API Gateway");
    if (apiGatewayId !== undefined) {
      const reb = updateNodeBinding(apiGatewayId, {
        boundParam: {
          sectionId: "ops",
          paramId: "containerOrchestration",
          optionValue: "Kubernetes",
        },
      });
      if (!reb.ok) noteRefusal(reb.reason);
    }

    const totalNodes = idByLabel.size + 4; // + 4 sealed containers

    // ----- ACW view-state: per-lens preferences -----------------
    setCurrentDomain(STUDIO_LENS_ID, "application");
    setActiveLod(STUDIO_LENS_ID, 2);
    setViewTab(STUDIO_LENS_ID, "design");
    toggleCollapsed(STUDIO_LENS_ID, "domain-technology");
    // OU overlay is intentionally OFF — per the spec the seeded
    // workspace presents the overlay as off so the developer can
    // toggle it on and observe the OU-tinted nodes light up.

    // ----- Track 3 view-prefs (per-architecture) ----------------
    setArchitectureViewMode(ARCH_NEXTGEN_ID, "3d");
    // "all" is the closest valid analogue of the spec's "top-down"
    // perspective — the registry's enumerated values are
    // "all" | "infraCentric" | "appCentric" | "integrationCentric".
    setArchitecturePerspective(ARCH_NEXTGEN_ID, "all");
    // Two layers collapsed: infrastructure and ops. Both layer ids
    // are members of the canonical TRACK3_LAYERS list.
    toggleArchitectureLayerHidden(ARCH_NEXTGEN_ID, "infrastructure");
    toggleArchitectureLayerHidden(ARCH_NEXTGEN_ID, "ops");

    // ----- Policy signals (3 fixtures, varied lifecycle) --------
    const sigRisk: CreateSignalInput = {
      signalCategory: "Risk Accumulation",
      signalTitle: "Risk Accumulation across customer-portal and data-lake",
      signalDescription:
        "Two recently frozen decisions in the customer programme carry the same High severity in Compliance.",
      evidenceSummary: {
        observationWindow: "Last 60 days",
        relatedDecisionCount: 2,
        qualitativePattern:
          "Same compliance category appearing across unrelated programmes.",
        relatedEntries: [
          {
            adsId: "customer-portal-modernization",
            adsVersion: "v1",
          },
          { adsId: "enterprise-data-lake", adsVersion: "v1" },
        ],
      },
      interpretationGuidance: [
        "Is the compliance pattern attributable to the same upstream control gap?",
        "Should a portfolio review be scheduled?",
      ],
      reviewingBody: "Architecture Council",
    };
    const sigDrift: CreateSignalInput = {
      signalCategory: "Posture Drift",
      signalTitle: "Posture Drift on compliance-hub",
      signalDescription:
        "A High-sensitivity Government decision selected an OnPrem deployment baseline; the broader portfolio's drift trend is towards Cloud.",
      evidenceSummary: {
        observationWindow: "Last 30 days",
        relatedDecisionCount: 1,
        qualitativePattern:
          "Sensitivity / deployment combination uncommon for this organisation type.",
        relatedEntries: [
          { adsId: "regulatory-compliance-hub", adsVersion: "v1" },
        ],
      },
      interpretationGuidance: [
        "Does this combination reflect a deliberate posture change?",
      ],
      reviewingBody: "Risk and Compliance Board",
    };
    const sigDep: CreateSignalInput = {
      signalCategory: "Dependency Concentration",
      signalTitle: "Dependency Concentration across all three decisions",
      signalDescription:
        "All three frozen decisions in the seeded portfolio share the same approving-authority pool and reference overlapping capability ids.",
      evidenceSummary: {
        observationWindow: "Last quarter",
        relatedDecisionCount: 3,
        qualitativePattern:
          "Common approving-authority pool plus overlapping capability scope.",
        relatedEntries: [
          {
            adsId: "customer-portal-modernization",
            adsVersion: "v1",
          },
          { adsId: "enterprise-data-lake", adsVersion: "v1" },
          { adsId: "regulatory-compliance-hub", adsVersion: "v1" },
        ],
      },
      interpretationGuidance: [
        "Does the shared capability scope indicate a shared upstream concern?",
      ],
      reviewingBody: "Architecture Council",
    };

    // Seed in deterministic order; advance each to its target
    // status. createSignal returns the assigned signalId — capture
    // it and pass to advanceSignal so the seeder does not depend on
    // any specific id-generation scheme inside signalsStore.
    let signalsCreated = 0;
    try {
      const created = createSignal(sigRisk);
      // Risk → Under Discussion (advance once)
      advanceSignal(created.signalId);
      signalsCreated += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }
    try {
      createSignal(sigDrift);
      // Drift → Observed (no advance)
      signalsCreated += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }
    try {
      const created = createSignal(sigDep);
      // Dependency Concentration → Acknowledged (advance twice)
      advanceSignal(created.signalId);
      advanceSignal(created.signalId);
      signalsCreated += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }

    // Final refusal-channel snapshot — anything that surfaced
    // through publishRefusal during the seed run that we did not
    // count via noteRefusal is included as a safety net.
    const channelLast = __acwRefusalChannelInternals.peekLast();
    if (channelLast !== null && refusalsObserved === 0) {
      refusalsObserved = 1;
      firstRefusalReason = `(channel) ${channelLast}`;
    }

    return {
      portfolio: fixtures.length,
      architectures: 1 + standaloneCount, // 1 legacy binding + standalones
      nodes: totalNodes,
      edges: edgesCreated,
      ous: 2,
      cards: cncfCardsApplied,
      signals: signalsCreated,
      track3: 1,
      refusalsObserved,
      firstRefusalReason,
    };
  });
}

// Snapshot-and-restore probe used by the SeedAllPage to verify the
// seeder runs without surfacing a validator refusal under the EXACT
// keys the seeder writes. Restores any pre-existing localStorage
// values regardless of probe outcome.
export interface SeedProbeResult {
  readonly ok: boolean;
  readonly summary?: SeedSummary;
  readonly errorMessage?: string;
}

export function runSeedProbe(): SeedProbeResult {
  if (typeof window === "undefined") {
    return { ok: false, errorMessage: "Probe requires a browser environment." };
  }
  const snapshot: Record<string, string | null> = {};
  for (const key of STORAGE_KEYS) {
    snapshot[key] = window.localStorage.getItem(key);
  }
  try {
    const summary = seedAll();
    if (summary.refusalsObserved > 0) {
      return {
        ok: false,
        summary,
        errorMessage: `Probe observed ${summary.refusalsObserved} validator refusal(s) during the seed run.`,
      };
    }
    return { ok: true, summary };
  } catch (err) {
    return {
      ok: false,
      errorMessage: (err as Error).message,
    };
  } finally {
    for (const key of STORAGE_KEYS) {
      const prev = snapshot[key];
      if (prev === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, prev);
      }
    }
    __acwStoreInternals.reloadFromStorageForTest();
    __acwViewStateInternals.reloadFromStorageForTest();
    __acwWorkspaceViewPrefsInternals.reloadFromStorageForTest();
    __ouStoreInternals.reloadFromStorageForTest();
    __track3ViewPrefsInternals.reloadFromStorageForTest();
  }
}

export const __seedAllInternals = Object.freeze({
  STORAGE_KEYS,
  FROZEN_ISO,
  ARCH_NEXTGEN_ID,
  ARCH_MOBILE_ID,
});

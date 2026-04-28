// Dev-only deterministic seeder for the Architecture Decision Canvas.
//
// Routes EXCLUSIVELY through validator-gated store APIs (no direct
// localStorage writes for governance / CTAD / ACW state). Clears the
// relevant storage keys first so a re-run from any starting state
// converges on the same end state.
//
// Determinism caveat
// ------------------
// Two store APIs we depend on do not accept caller-supplied IDs:
//   * `ctadStore.createArchitecture(name)` mints an `architectureId`
//     by suffixing a slug with 8 random hex digits.
//   * `signalsStore.createSignal(input)` mints a `signalId` by
//     concatenating `Date.now()` with a random suffix, and stamps
//     `observedAt` with `new Date()`.
// All other seeded values (portfolio entries with frozen-at
// `2026-01-15T12:00:00Z`, CTAD param values, env definitions, ACW
// node ids, OU ids, view-prefs, view-state, applied-card defaults)
// are byte-stable across reruns. Adding deterministic-id overrides
// to the underlying stores would broaden their public API for a
// dev-only consumer; we deliberately do not do so. The seeder
// therefore documents the two non-deterministic fields it produces
// and surfaces both ids in the on-screen summary so a developer
// can correlate them across surfaces.
//
// The seeder module itself is loaded through `React.lazy()` from
// App.tsx and the `/seed-all` route is gated on
// `import.meta.env.DEV`, so neither the seeder code nor the route
// is reachable from a production build.

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
import { CNCF_CARDS } from "@workspace/cncf-catalog";
import {
  clearWorkspace,
  createNode,
  createEdge,
  updateNodeProperties,
  updateNodeBinding,
  __acwStoreInternals,
} from "@/acw/acwStore";
import { ensureDomainContainers } from "@/acw/palette/domainContainerSeed";
import {
  setCurrentDomain,
  setActiveLod,
  setViewTab,
  toggleCollapsed,
  setShowOrgOverlay,
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
import {
  setLensFullscreen,
  __acwWorkspaceViewPrefsInternals,
} from "@/acw/acwWorkspaceViewPrefs";
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

export interface SeedSummary {
  readonly portfolioEntries: number;
  readonly signals: number;
  // Generated signal ids (non-deterministic — see module header).
  // Surfaced so a developer can correlate the rendered signals
  // panel with the seeder run.
  readonly signalIds: readonly string[];
  readonly ctadBindings: number;
  readonly ctadStandaloneArchitectures: readonly string[];
  readonly cncfCardsApplied: number;
  readonly orgUnits: number;
  readonly acwNodes: number;
  readonly acwEdges: number;
  readonly track3ArchitectureId: string | null;
  readonly refusalsObserved: number;
  readonly firstRefusalReason: string | null;
}

// Three deterministic ADC decisions. Each is a plausible synthetic
// case sized to exercise the grammar derivers (capability selection
// produces components / risks / indicators automatically).
function buildPortfolioFixtures(): Array<{
  context: OrganisationContext;
  selections: CapabilitySelection[];
  baselineTradeOffs: TradeOffSettings;
  metadata: { projectName: string; approvingAuthority: string };
}> {
  return [
    {
      context: {
        organisationType: "Government",
        sensitivityLevel: "High",
        systemIntent: "LegacyReplacement",
        expectedLifespanYears: 10,
      },
      selections: [
        { capabilityId: "CAP_EXTERNAL_ACCESS", status: "IN_SCOPE" },
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_CASE_MANAGEMENT", status: "IN_SCOPE" },
        { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
        { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "DEFERRED" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Distributed",
        deploymentModel: "Cloud",
        scopeLevel: "Full",
      },
      metadata: {
        projectName: "Customer Portal Replacement",
        approvingAuthority: "Chief Architect",
      },
    },
    {
      context: {
        organisationType: "Enterprise",
        sensitivityLevel: "Medium",
        systemIntent: "NewCapability",
        expectedLifespanYears: 5,
      },
      selections: [
        { capabilityId: "CAP_EXTERNAL_ACCESS", status: "IN_SCOPE" },
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_CASE_MANAGEMENT", status: "OUT_OF_SCOPE" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Simple",
        deploymentModel: "Cloud",
        scopeLevel: "Minimal",
      },
      metadata: {
        projectName: "Field Service Mobile",
        approvingAuthority: "Head of Engineering",
      },
    },
    {
      context: {
        organisationType: "Government",
        sensitivityLevel: "Low",
        systemIntent: "NewCapability",
        expectedLifespanYears: 7,
      },
      selections: [
        { capabilityId: "CAP_INTERNAL_ADMIN", status: "IN_SCOPE" },
        { capabilityId: "CAP_DOCUMENT_MANAGEMENT", status: "IN_SCOPE" },
        { capabilityId: "CAP_WORKFLOW_APPROVAL", status: "IN_SCOPE" },
      ],
      baselineTradeOffs: {
        architectureStyle: "Simple",
        deploymentModel: "OnPrem",
        scopeLevel: "Minimal",
      },
      metadata: {
        projectName: "Records Disposal Workflow",
        approvingAuthority: "Records Manager",
      },
    },
  ];
}

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

// Public entry point. Returns a summary the dev page renders.
export function seedAll(): SeedSummary {
  __acwRefusalChannelInternals.reset();
  let refusalsObserved = 0;
  let firstRefusalReason: string | null = null;
  const noteRefusal = (reason: string): void => {
    refusalsObserved += 1;
    if (firstRefusalReason === null) firstRefusalReason = reason;
    // Surface to console with a stable prefix so the dev workflow
    // can show every refusal directly in the browser logs without
    // routing through React state.
    // eslint-disable-next-line no-console
    console.warn("[seedAll] refusal:", reason);
    publishRefusal(reason);
  };

  clearAllSeededKeys();

  // ----- ADC portfolio (3 frozen decisions) -------------------
  const fixtures = buildPortfolioFixtures();
  // Stable freeze date — keeps the rendered Portfolio rows
  // reading identically on every seed.
  const fixedNow = new Date("2026-01-15T12:00:00.000Z");
  for (const fx of fixtures) {
    const ads = buildADS({
      context: fx.context,
      selections: fx.selections,
      baselineTradeOffs: fx.baselineTradeOffs,
      metadata: fx.metadata,
      now: fixedNow,
    });
    addOrUpdateEntry(entryFromADS(ads));
  }

  // ----- CTAD: 1 ADC-bound binding ----------------------------
  // The bound binding is the first portfolio entry. setCtadParam
  // implicitly materialises the binding doc on first write.
  const boundBinding: CtadBinding = {
    adsId: "customer-portal-replacement",
    adsVersion: "v1",
  };
  setCtadParam(boundBinding, "hostingModel", "Public");
  setCtadParam(boundBinding, "databaseClass", "Relational");
  setCtadParam(boundBinding, "containerOrchestration", "Kubernetes");
  setCtadParam(boundBinding, "monitoringClass", "Observability");
  const boundEnvDev: CtadEnvironmentDef = {
    id: "env-dev",
    name: "Development",
    kind: "Development",
    hostingModel: "Public",
  };
  const boundEnvProd: CtadEnvironmentDef = {
    id: "env-prod",
    name: "Production",
    kind: "Production",
    hostingModel: "Public",
  };
  addEnvironment(boundBinding, boundEnvDev);
  addEnvironment(boundBinding, boundEnvProd);

  // ----- CTAD: 2 standalone architectures ---------------------
  // Architecture ids are generated by `createArchitecture` (random
  // 8-hex suffix on a content-derived slug); the seeder captures
  // the id and threads it through the rest of the calls. The
  // suffix is the only non-deterministic field in the seeded set.
  const archA = createArchitecture("Next-gen Platform");
  setArchitectureParam(archA.architectureId, "hostingModel", "Hybrid");
  setArchitectureParam(archA.architectureId, "databaseClass", "Document");
  setArchitectureParam(
    archA.architectureId,
    "containerOrchestration",
    "Kubernetes",
  );
  addArchitectureEnvironment(archA.architectureId, boundEnvDev);
  addArchitectureEnvironment(archA.architectureId, boundEnvProd);

  const archB = createArchitecture("Mobile First Architecture");
  setArchitectureParam(archB.architectureId, "hostingModel", "Public");
  setArchitectureParam(archB.architectureId, "databaseClass", "Document");
  setArchitectureParam(archB.architectureId, "monitoringClass", "Centralised");
  addArchitectureEnvironment(archB.architectureId, boundEnvProd);

  // ----- CNCF apply layer: 2 cards on the bound binding -------
  const cardKubernetes = CNCF_CARDS.find((c) => c.id === "cncf:kubernetes");
  const cardOpenTelemetry = CNCF_CARDS.find(
    (c) => c.id === "cncf:opentelemetry",
  );
  let cncfCardsApplied = 0;
  if (cardKubernetes) {
    try {
      applyCard(boundBinding, cardKubernetes);
      cncfCardsApplied += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }
  }
  if (cardOpenTelemetry) {
    try {
      applyCard(boundBinding, cardOpenTelemetry);
      cncfCardsApplied += 1;
    } catch (err) {
      noteRefusal((err as Error).message);
    }
  }

  // ----- Organisational Units (2 fixtures) --------------------
  // OUs are seeded BEFORE any ACW node so the bind step at the end
  // of the workspace seed cannot dangle.
  const ouEng = createOu({ id: "ou-engineering", name: "Engineering" });
  const ouComp = createOu({ id: "ou-compliance", name: "Compliance" });
  if (!ouEng.ok) noteRefusal(ouEng.reason);
  if (!ouComp.ok) noteRefusal(ouComp.reason);

  // ----- ACW workspace: clear + seed 4 quadrants + children ---
  clearWorkspace();
  // re-seed the four sealed domain containers idempotently
  ensureDomainContainers();

  // Children — one node per domain quadrant, exercising 4 of the
  // 5 grammar element types (Zone, BusinessEntity, System, Component;
  // Connector is exercised via an explicit edge below).
  const bizProc = createNode({
    type: "Zone",
    parentId: "domain-business",
    label: "Customer service journey",
    x: 100,
    y: 100,
  });
  const dataStore = createNode({
    type: "System",
    parentId: "domain-data",
    label: "Customer database",
    x: 100,
    y: 100,
    boundTechnologyCategory: "Relational database",
  });
  const apiGateway = createNode({
    type: "System",
    parentId: "domain-application",
    label: "Public API gateway",
    x: 100,
    y: 100,
    boundTechnologyCategory: "API gateway",
    boundParam: {
      sectionId: "infrastructure",
      paramId: "containerOrchestration",
      optionValue: "Kubernetes",
    },
  });
  const microservice = createNode({
    type: "System",
    parentId: "domain-application",
    label: "Customer service backend",
    x: 400,
    y: 100,
    boundTechnologyCategory: "Backend service",
  });
  const k8sCluster = createNode({
    type: "Component",
    parentId: "domain-technology",
    label: "Production Kubernetes cluster",
    x: 100,
    y: 100,
    boundParam: {
      sectionId: "infrastructure",
      paramId: "containerOrchestration",
      optionValue: "Kubernetes",
    },
  });

  // Surface any node-creation refusals in the summary counter.
  for (const r of [bizProc, dataStore, apiGateway, microservice, k8sCluster]) {
    if (!r.ok) noteRefusal(r.reason);
  }

  // 2 explicit edges between application children (sealed domain
  // containers may not be edge endpoints — connect application
  // children only).
  if (apiGateway.ok && microservice.ok) {
    const e1 = createEdge({
      kind: "CONNECTS",
      fromId: apiGateway.id,
      toId: microservice.id,
    });
    if (!e1.ok) noteRefusal(e1.reason);
  }
  if (microservice.ok && dataStore.ok) {
    const e2 = createEdge({
      kind: "DATA_FLOW",
      fromId: microservice.id,
      toId: dataStore.id,
    });
    if (!e2.ok) noteRefusal(e2.reason);
  }

  // Bind two child nodes to the OU registry so the Org View overlay
  // has live tints to render.
  if (ouEng.ok && apiGateway.ok) {
    const upd = updateNodeProperties(apiGateway.id, {
      organisationalUnitId: ouEng.id,
    });
    if (!upd.ok) noteRefusal(upd.reason);
  }
  if (ouComp.ok && microservice.ok) {
    const upd = updateNodeProperties(microservice.id, {
      organisationalUnitId: ouComp.id,
    });
    if (!upd.ok) noteRefusal(upd.reason);
  }

  // Re-bind one node through updateNodeBinding so the Phase 5
  // semantic-binding read path is exercised end-to-end.
  if (k8sCluster.ok) {
    const reb = updateNodeBinding(k8sCluster.id, {
      boundParam: {
        sectionId: "infrastructure",
        paramId: "containerOrchestration",
        optionValue: "Kubernetes",
      },
      boundTechnologyCategory: "Container orchestration",
    });
    if (!reb.ok) noteRefusal(reb.reason);
  }

  // ----- ACW view-state: per-lens preferences -----------------
  const studioLensId = "/workspace/studio";
  setCurrentDomain(studioLensId, "application");
  setActiveLod(studioLensId, 2);
  setViewTab(studioLensId, "design");
  toggleCollapsed(studioLensId, "domain-technology");
  setShowOrgOverlay(studioLensId, true);

  // ----- ACW workspace view-prefs (separate store) -----------
  // Seeds the per-lens view-prefs document at
  // `acw.workspace.viewprefs.v1`. Without this call the storage
  // key would only ever exist if an end-user toggled fullscreen.
  setLensFullscreen(studioLensId, false);

  // ----- Track 3 view-prefs (per-architecture) ----------------
  const track3Arch = archA.architectureId;
  setArchitectureViewMode(track3Arch, "3d");
  setArchitecturePerspective(track3Arch, "appCentric");
  toggleArchitectureLayerHidden(track3Arch, "ops");

  // ----- Policy signals (3 fixtures, varied lifecycle) --------
  const sigInputs: CreateSignalInput[] = [
    {
      signalCategory: "Risk Accumulation",
      signalTitle: "Recurrent High severity in Customer Portal Replacement",
      signalDescription:
        "Two recently frozen decisions in the customer portfolio carried High severity in Compliance.",
      evidenceSummary: {
        observationWindow: "Last 60 days",
        relatedDecisionCount: 2,
        qualitativePattern:
          "Same compliance category appearing across unrelated programmes.",
        relatedEntries: [
          { adsId: "customer-portal-replacement", adsVersion: "v1" },
        ],
      },
      interpretationGuidance: [
        "Is the compliance pattern attributable to the same upstream control gap?",
        "Should a portfolio review be scheduled?",
      ],
      reviewingBody: "Architecture Council",
    },
    {
      signalCategory: "Complexity Accumulation",
      signalTitle: "Distributed style adopted across two new programmes",
      signalDescription:
        "Two of the last three frozen decisions selected a distributed style under cloud deployment.",
      evidenceSummary: {
        observationWindow: "Last quarter",
        relatedDecisionCount: 2,
        qualitativePattern: "Trend toward distributed cloud baselines.",
      },
      interpretationGuidance: [
        "Is the distributed style being adopted for capability or for fashion?",
      ],
      reviewingBody: "Architecture Council",
    },
    {
      signalCategory: "Posture Drift",
      signalTitle: "Cloud deployment under High sensitivity",
      signalDescription:
        "A High-sensitivity government decision selected a cloud baseline.",
      evidenceSummary: {
        observationWindow: "Last 30 days",
        relatedDecisionCount: 1,
        qualitativePattern:
          "Sensitivity / deployment combination uncommon for this organisation type.",
      },
      interpretationGuidance: [
        "Does this combination reflect a deliberate posture change?",
      ],
      reviewingBody: "Risk & Compliance Board",
    },
  ];
  const signalIds: string[] = [];
  for (const input of sigInputs) {
    const sig = createSignal(input);
    signalIds.push(sig.signalId);
  }
  // Vary lifecycle: leave first as Observed, advance second to
  // Under Discussion, advance third to Acknowledged.
  if (signalIds[1]) {
    advanceSignal(signalIds[1]);
  }
  if (signalIds[2]) {
    advanceSignal(signalIds[2]);
    advanceSignal(signalIds[2]);
  }

  // Final refusal channel snapshot — anything that surfaced
  // through publishRefusal during the seed run that we did not
  // count via noteRefusal is included here as a safety net.
  const channelLast = __acwRefusalChannelInternals.peekLast();
  if (channelLast !== null && refusalsObserved === 0) {
    refusalsObserved = 1;
    firstRefusalReason = `(channel) ${channelLast}`;
  }

  return {
    portfolioEntries: fixtures.length,
    signals: signalIds.length,
    signalIds,
    ctadBindings: 1,
    ctadStandaloneArchitectures: [
      archA.architectureId,
      archB.architectureId,
    ],
    cncfCardsApplied,
    orgUnits: 2,
    acwNodes: 4 + 5,
    acwEdges: 2,
    track3ArchitectureId: track3Arch,
    refusalsObserved,
    firstRefusalReason,
  };
}

// Snapshot-and-restore probe used by the SeedAllPage to verify
// the seeder runs without surfacing a validator refusal under
// the EXACT keys the seeder writes. Restores any pre-existing
// localStorage values regardless of probe outcome.
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
});

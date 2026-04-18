import {
  CAPABILITIES,
  deriveArchitecture,
  type OrganisationContext,
  type CapabilitySelection,
  type TradeOffSettings,
  type Component,
} from "@workspace/architecture-grammar";
import type { ADS, ADSSection, ProjectMetadata } from "./types";
import { canonicalJSON, fnv1aHex } from "./hash";
import { slugifyAdsId } from "./identity";

const LAYER_ORDER = [
  "UI",
  "Application",
  "Data",
  "Integration",
  "Security",
  "Operations",
] as const;

function groupComponentsByLayer(
  components: Component[],
): { layer: string; components: Component[] }[] {
  const grouped: Record<string, Component[]> = {};
  for (const c of components) {
    if (!grouped[c.layer]) grouped[c.layer] = [];
    grouped[c.layer].push(c);
  }
  return LAYER_ORDER.map((layer) => ({
    layer,
    components: grouped[layer] ?? [],
  })).filter((g) => g.components.length > 0);
}

function namesByStatus(
  selections: CapabilitySelection[],
  status: "IN_SCOPE" | "DEFERRED" | "OUT_OF_SCOPE",
): { id: string; name: string }[] {
  return selections
    .filter((s) => s.status === status)
    .map((s) => {
      const cap = CAPABILITIES.find((c) => c.id === s.capabilityId);
      return { id: s.capabilityId, name: cap?.name ?? s.capabilityId };
    });
}

export function computeVersion(
  context: OrganisationContext,
  selections: CapabilitySelection[],
  baselineTradeOffs: TradeOffSettings,
): string {
  // HC1: Hash inputs do NOT include project metadata.
  const sortedSelections = [...selections].sort((a, b) =>
    a.capabilityId.localeCompare(b.capabilityId),
  );
  const payload = {
    context,
    selections: sortedSelections,
    baselineTradeOffs,
  };
  return fnv1aHex(canonicalJSON(payload));
}

function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildADS(args: {
  context: OrganisationContext;
  selections: CapabilitySelection[];
  baselineTradeOffs: TradeOffSettings;
  metadata: ProjectMetadata;
  now?: Date;
}): ADS {
  const { context, selections, baselineTradeOffs, metadata } = args;
  const version = computeVersion(context, selections, baselineTradeOffs);
  // adsId is the logical decision identity, derived from project name.
  // It is intentionally distinct from `version` (the architectural hash) so
  // that two freezes of the same project with revised architecture share
  // the same adsId but have different versions.
  const adsId = slugifyAdsId(metadata.projectName);
  const date = todayISO(args.now);

  const result = deriveArchitecture(context, selections, baselineTradeOffs);

  const sections: ADSSection[] = [
    {
      sectionId: "ADS_DECISION_CONTEXT",
      sectionOrder: 1,
      title: "Decision Context",
      context,
    },
    {
      sectionId: "ADS_CAPABILITY_SCOPE",
      sectionOrder: 2,
      title: "Capability Scope Declaration",
      inScope: namesByStatus(selections, "IN_SCOPE"),
      deferred: namesByStatus(selections, "DEFERRED"),
      outOfScope: namesByStatus(selections, "OUT_OF_SCOPE"),
    },
    {
      sectionId: "ADS_DERIVED_ARCHITECTURE",
      sectionOrder: 3,
      title: "Derived Architecture",
      layers: groupComponentsByLayer(result.requiredComponents),
    },
    {
      sectionId: "ADS_RISK_ACKNOWLEDGEMENT",
      sectionOrder: 4,
      title: "Risk Acknowledgement",
      risks: result.risks,
    },
    {
      sectionId: "ADS_TRADEOFF_SUMMARY",
      sectionOrder: 5,
      title: "Trade-Off Exploration Summary",
      baseline: baselineTradeOffs,
    },
    {
      sectionId: "ADS_DECISION_RECORD",
      sectionOrder: 6,
      title: "Decision Record",
      projectName: metadata.projectName,
      approvingAuthority: metadata.approvingAuthority,
      date,
      version,
      adsId,
    },
  ];

  return {
    adsId,
    version,
    date,
    projectName: metadata.projectName,
    approvingAuthority: metadata.approvingAuthority,
    sections,
    context,
    selections,
    baselineTradeOffs,
    result,
  };
}

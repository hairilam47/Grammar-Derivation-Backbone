import type {
  OrganisationContext,
  TradeOffSettings,
  RiskCategory,
  RiskLevel,
  ComponentLayer,
} from "@workspace/architecture-grammar";
import type { ADS } from "./types";

const STORAGE_KEY = "adc.portfolio.v1";

// HC4: top-level allow-list. The portfolio entry persists exactly these
// fields and no others. The `ads` field carries the full canonical
// Architecture Decision Snapshot (HC1 source of truth) so that the
// read-only viewer can render the snapshot through the same preview
// renderers used at freeze time and re-build the ECP through the
// existing `buildECP` flow. The remaining fields are a flat summary
// derived from the ADS for the table and aggregation views.
const ALLOWED_FIELDS = [
  "ads",
  "adsId",
  "adsVersion",
  "projectName",
  "approvingAuthority",
  "decisionDate",
  "organisationContext",
  "baselinePosture",
  "complexityScore",
  "operationalOverheadScore",
  "changeCostLaterScore",
  "highestRiskSeverity",
  "riskCategoriesPresent",
  "layersPresent",
] as const;

export interface PortfolioEntry {
  ads: ADS;
  adsId: string;
  adsVersion: string;
  projectName: string;
  approvingAuthority: string;
  decisionDate: string;
  organisationContext: OrganisationContext;
  baselinePosture: TradeOffSettings;
  complexityScore: number;
  operationalOverheadScore: number;
  changeCostLaterScore: number;
  highestRiskSeverity: RiskLevel | "NONE";
  riskCategoriesPresent: RiskCategory[];
  layersPresent: ComponentLayer[];
}

const RISK_RANK: Record<RiskLevel, number> = { GREEN: 1, AMBER: 2, RED: 3 };

export function entryFromADS(ads: ADS): PortfolioEntry {
  const risks = ads.result.risks;
  let highest: RiskLevel | "NONE" = "NONE";
  for (const r of risks) {
    if (highest === "NONE" || RISK_RANK[r.level] > RISK_RANK[highest]) {
      highest = r.level;
    }
  }
  const categories = Array.from(
    new Set(risks.map((r) => r.category)),
  ).sort() as RiskCategory[];
  const layers = Array.from(
    new Set(ads.result.requiredComponents.map((c) => c.layer)),
  ).sort() as ComponentLayer[];

  return {
    ads,
    adsId: ads.adsId,
    adsVersion: ads.version,
    projectName: ads.projectName,
    approvingAuthority: ads.approvingAuthority,
    decisionDate: ads.date,
    organisationContext: ads.context,
    baselinePosture: ads.baselineTradeOffs,
    complexityScore: ads.result.indicators.complexityScore,
    operationalOverheadScore: ads.result.indicators.operationalOverheadScore,
    changeCostLaterScore: ads.result.indicators.changeCostLaterScore,
    highestRiskSeverity: highest,
    riskCategoriesPresent: categories,
    layersPresent: layers,
  };
}

const ALLOWED_CONTEXT_KEYS = new Set([
  "organisationType",
  "sensitivityLevel",
  "systemIntent",
  "expectedLifespanYears",
]);
const ALLOWED_BASELINE_KEYS = new Set([
  "architectureStyle",
  "deploymentModel",
  "scopeLevel",
]);

function assertAllowedFields(entry: unknown): void {
  if (entry === null || typeof entry !== "object") {
    throw new Error("Portfolio entry must be an object.");
  }
  const allowed = new Set<string>(ALLOWED_FIELDS);
  for (const k of Object.keys(entry as Record<string, unknown>)) {
    if (!allowed.has(k)) {
      throw new Error(
        `Portfolio entry contains forbidden field "${k}". Allowed fields: ${ALLOWED_FIELDS.join(", ")}.`,
      );
    }
  }
}

function isValidEntry(raw: unknown): raw is PortfolioEntry {
  if (raw === null || typeof raw !== "object") return false;
  const e = raw as Record<string, unknown>;
  for (const k of Object.keys(e)) {
    if (!ALLOWED_FIELDS.includes(k as (typeof ALLOWED_FIELDS)[number])) {
      return false;
    }
  }
  if (typeof e.adsId !== "string" || typeof e.adsVersion !== "string") return false;
  if (typeof e.projectName !== "string") return false;
  if (typeof e.approvingAuthority !== "string") return false;
  if (typeof e.decisionDate !== "string") return false;
  if (typeof e.complexityScore !== "number") return false;
  if (typeof e.operationalOverheadScore !== "number") return false;
  if (typeof e.changeCostLaterScore !== "number") return false;
  if (typeof e.highestRiskSeverity !== "string") return false;
  if (!Array.isArray(e.riskCategoriesPresent)) return false;
  if (!Array.isArray(e.layersPresent)) return false;
  if (e.organisationContext === null || typeof e.organisationContext !== "object") return false;
  for (const k of Object.keys(e.organisationContext as Record<string, unknown>)) {
    if (!ALLOWED_CONTEXT_KEYS.has(k)) return false;
  }
  if (e.baselinePosture === null || typeof e.baselinePosture !== "object") return false;
  for (const k of Object.keys(e.baselinePosture as Record<string, unknown>)) {
    if (!ALLOWED_BASELINE_KEYS.has(k)) return false;
  }
  // Minimal shape check on the embedded ADS — the canonical artefact's full
  // structural validation is the responsibility of `buildADS`; here we only
  // confirm the required top-level fields are present.
  if (e.ads === null || typeof e.ads !== "object") return false;
  const ads = e.ads as Record<string, unknown>;
  if (typeof ads.adsId !== "string" || typeof ads.version !== "string") return false;
  if (!Array.isArray(ads.sections)) return false;
  return true;
}

function readAll(): PortfolioEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // HC4 read-path enforcement: drop any row that does not match the
    // strict allow-list schema. localStorage is mutable, so a tampered
    // entry must not be able to surface forbidden fields to the UI.
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function writeAll(entries: PortfolioEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function listEntries(): PortfolioEntry[] {
  return readAll();
}

export function addOrUpdateEntry(entry: PortfolioEntry): void {
  assertAllowedFields(entry);
  const all = readAll();
  const idx = all.findIndex(
    (e) => e.adsId === entry.adsId && e.adsVersion === entry.adsVersion,
  );
  if (idx >= 0) {
    const existing = all[idx];
    all[idx] = {
      ...existing,
      projectName: entry.projectName,
      approvingAuthority: entry.approvingAuthority,
      decisionDate: entry.decisionDate,
    };
  } else {
    all.push(entry);
  }
  writeAll(all);
}

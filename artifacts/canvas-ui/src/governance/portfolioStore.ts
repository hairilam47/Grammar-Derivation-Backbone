import type {
  OrganisationContext,
  TradeOffSettings,
  RiskCategory,
  RiskLevel,
  ComponentLayer,
} from "@workspace/architecture-grammar";
import type { ADS } from "./types";
import {
  deriveEcpConstraintCategories,
  isEcpConstraintCategoryTag,
  type EcpConstraintCategoryTag,
} from "./exposureCategories";

const STORAGE_KEY = "adc.portfolio.v1";

// HC4: top-level allow-list. The portfolio entry persists EXACTLY these
// 15 fields and nothing else. The full ADS is intentionally NOT
// persisted here — the portfolio is a deliberately reduced read-model
// of the canonical artefact (HC1). The read-only viewer renders from
// these fields directly, never by re-running the grammar.
//
// Phase 1 (Decision Exposure View) extension under PH1-HC5 (clarified)
// and PH1-HC6: the allow-list grew by exactly two frozen-at-freeze
// decision-intent fields — `inScopeCapabilityIds` and
// `ecpConstraintCategories`. They are written once at freeze and are
// read-only thereafter; they do not feed back into the grammar engine.
const ALLOWED_FIELDS = [
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
  "inScopeCapabilityIds",
  "ecpConstraintCategories",
] as const;

export interface PortfolioEntry {
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
  inScopeCapabilityIds: string[];
  ecpConstraintCategories: EcpConstraintCategoryTag[];
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

  // Phase 1 frozen-at-freeze decision-intent fields. Computed once here
  // and never re-derived afterwards; both fields are read-only thereafter.
  const inScopeCapabilityIds = ads.selections
    .filter((s) => s.status === "IN_SCOPE")
    .map((s) => s.capabilityId)
    .slice()
    .sort();
  const ecpConstraintCategories = deriveEcpConstraintCategories(ads);

  return {
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
    inScopeCapabilityIds,
    ecpConstraintCategories,
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
  const e = entry as Record<string, unknown>;
  for (const k of Object.keys(e)) {
    if (!allowed.has(k)) {
      throw new Error(
        `Portfolio entry contains forbidden field "${k}". Allowed fields: ${ALLOWED_FIELDS.join(", ")}.`,
      );
    }
  }
  // PH1-HC6: the two Phase 1 fields are mandatory at write time and
  // must conform to their declared shape. Read-time accepts undefined
  // for legacy entries (handled in withDefaults), but every newly
  // written entry must carry well-formed values.
  if (
    !Array.isArray(e.inScopeCapabilityIds) ||
    !e.inScopeCapabilityIds.every((x) => typeof x === "string")
  ) {
    throw new Error(
      "Portfolio entry field \"inScopeCapabilityIds\" must be an array of capability id strings.",
    );
  }
  if (
    !Array.isArray(e.ecpConstraintCategories) ||
    !e.ecpConstraintCategories.every(
      (x) => typeof x === "string" && isEcpConstraintCategoryTag(x),
    )
  ) {
    throw new Error(
      "Portfolio entry field \"ecpConstraintCategories\" must be an array of canonical ECP constraint-category tags.",
    );
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
  // Phase 1 fields are optional at read time so pre-existing entries
  // written before the allow-list extension continue to load. They are
  // mandatory at write time (see assertAllowedFields below).
  if (e.inScopeCapabilityIds !== undefined) {
    if (!Array.isArray(e.inScopeCapabilityIds)) return false;
    if (!e.inScopeCapabilityIds.every((x) => typeof x === "string")) return false;
  }
  if (e.ecpConstraintCategories !== undefined) {
    if (!Array.isArray(e.ecpConstraintCategories)) return false;
    if (
      !e.ecpConstraintCategories.every(
        (x) => typeof x === "string" && isEcpConstraintCategoryTag(x),
      )
    ) {
      return false;
    }
  }
  return true;
}

// Pre-existing entries written before the Phase 1 extension may not
// carry the two new fields. Normalise reads so callers can rely on the
// fields always being defined (as empty arrays in the legacy case).
function withDefaults(entry: PortfolioEntry): PortfolioEntry {
  return {
    ...entry,
    inScopeCapabilityIds: entry.inScopeCapabilityIds ?? [],
    ecpConstraintCategories: entry.ecpConstraintCategories ?? [],
  };
}

function readAll(): PortfolioEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).map(withDefaults);
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

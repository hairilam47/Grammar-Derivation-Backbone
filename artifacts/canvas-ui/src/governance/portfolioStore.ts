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
// Phase 5 — approval-time markers are computed at freeze and frozen
// onto the entry so the Decision Re-Entry Lens can compare current
// derivation output against the approval-time profile. These imports
// are value imports; the inverse direction in `exposureDerive.ts` and
// `responsibilityLens.ts` is `import type` only, so there is no
// runtime circular dependency.
import { deriveExposure } from "./exposureDerive";
import { deriveResponsibilityLens } from "./responsibilityLens";

const STORAGE_KEY = "adc.portfolio.v1";

// HC4: top-level allow-list. The portfolio entry persists EXACTLY these
// 17 fields and nothing else. The full ADS is intentionally NOT
// persisted here — the portfolio is a deliberately reduced read-model
// of the canonical artefact (HC1). The read-only viewer renders from
// these fields directly, never by re-running the grammar.
//
// Phase 1 (Decision Exposure View) extension under PH1-HC5 (clarified)
// and PH1-HC6: the allow-list grew by exactly two frozen-at-freeze
// decision-intent fields — `inScopeCapabilityIds` and
// `ecpConstraintCategories`. They are written once at freeze and are
// read-only thereafter; they do not feed back into the grammar engine.
//
// Phase 5 (Decision Re-Entry Lens) extension under PH5-HC3: the
// allow-list grew by exactly two further frozen-at-freeze fields —
// `approvalFunctionsAffected` and `approvalDominantFunctions` —
// snapshotting the live Phase 1 / Phase 3 derivation outputs at
// freeze. Same write-once / read-only / no-feedback semantics.
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
  // Phase 5 (PH5-HC3) approval-time markers. Both are written ONCE at
  // freeze, read-only thereafter, and never feed back into the grammar
  // engine. They snapshot what the live derivers (Phase 1 exposure,
  // Phase 3 responsibility lens) produced AT freeze time. The
  // Decision Re-Entry Lens compares current derivation output against
  // these snapshots to recognise drift introduced by future derivation
  // upgrades or future upstream-context evolution.
  "approvalFunctionsAffected",
  "approvalDominantFunctions",
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
  // Phase 5 approval-time markers (see ALLOWED_FIELDS comment above).
  // Both are alphabetically-sorted arrays of plain strings: function
  // names captured at freeze from `payload.functionsAffected` and
  // from the responsibility lens row set respectively.
  approvalFunctionsAffected: string[];
  approvalDominantFunctions: string[];
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

  // Phase 5 approval-time markers. We assemble a draft entry that
  // carries every field the downstream derivers need, then run the
  // live Phase 1 + Phase 3 derivers against it and snapshot their
  // outputs as alphabetically-sorted plain string arrays. Because
  // these snapshots are taken at freeze, any future divergence
  // between the live derivers and these snapshots — caused by a
  // future derivation upgrade or by upstream context evolution —
  // becomes a procedurally legitimate Re-Entry signal at read time.
  const draftForDerivation: PortfolioEntry = {
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
    approvalFunctionsAffected: [],
    approvalDominantFunctions: [],
  };
  const approvalPayload = deriveExposure(draftForDerivation);
  const approvalLens = deriveResponsibilityLens(
    draftForDerivation,
    approvalPayload,
  );
  const approvalFunctionsAffected = [...approvalPayload.functionsAffected]
    .slice()
    .sort();
  const approvalDominantFunctions = approvalLens
    .map((row) => row.functionName)
    .slice()
    .sort();

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
    approvalFunctionsAffected,
    approvalDominantFunctions,
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
  // Phase 5 markers — strings only; allowed to be empty for decisions
  // whose freeze-time derivers produced no functions / no responsibility
  // lens rows. Pre-existing entries written before Phase 5 are
  // accepted at READ time (see withDefaults) but every newly written
  // entry must carry well-formed values.
  if (
    !Array.isArray(e.approvalFunctionsAffected) ||
    !e.approvalFunctionsAffected.every((x) => typeof x === "string")
  ) {
    throw new Error(
      "Portfolio entry field \"approvalFunctionsAffected\" must be an array of strings.",
    );
  }
  if (
    !Array.isArray(e.approvalDominantFunctions) ||
    !e.approvalDominantFunctions.every((x) => typeof x === "string")
  ) {
    throw new Error(
      "Portfolio entry field \"approvalDominantFunctions\" must be an array of strings.",
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
  // Phase 5 markers — optional at READ time so entries written before
  // Phase 5 continue to load. They are mandatory at WRITE time
  // (assertAllowedFields above).
  if (e.approvalFunctionsAffected !== undefined) {
    if (!Array.isArray(e.approvalFunctionsAffected)) return false;
    if (!e.approvalFunctionsAffected.every((x) => typeof x === "string")) {
      return false;
    }
  }
  if (e.approvalDominantFunctions !== undefined) {
    if (!Array.isArray(e.approvalDominantFunctions)) return false;
    if (!e.approvalDominantFunctions.every((x) => typeof x === "string")) {
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
    approvalFunctionsAffected: entry.approvalFunctionsAffected ?? [],
    approvalDominantFunctions: entry.approvalDominantFunctions ?? [],
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

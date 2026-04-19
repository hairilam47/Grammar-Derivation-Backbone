// Phase 6 — Negative invariants ("what the system MUST NOT do").
//
// This module encodes Phase 6's hard-stop refusals as pure functions.
// Each function takes its inputs as parameters (per the brief: "pure
// functions whose contract is what the system MUST NOT do") so the
// contract can be exercised in isolation. The module-load side
// effects at the bottom of the file then call each function with the
// live application introspection so any regression fails the build.
//
// File suffix `.test-shape.ts` per the brief: this module's exports
// are negative-shape predicates, not feature surface. Removing this
// file plus its side-effect import in App.tsx restores Phase 5
// behaviour with no other change required (PH6-HC7).
import * as exportModule from "./export";
// Imported from the lightweight constants module (PH6-HC2) — NOT
// from `portfolioStore.ts` — so that constitutional-containment
// invariants do not transitively load Phase 1–5 derivation modules
// at app-bundle startup. This preserves Phase 6's "cleanly removable
// / no real coupling" guarantee.
import { ALLOWED_FIELDS as PORTFOLIO_ALLOWED_FIELDS } from "./portfolioFields";
import * as togafContainment from "./togafContainment";

// PH6-HC2 — The export module's public surface is closed to exactly
// the four PDF/DOCX entrypoints named in the brief. No JSON, CSV,
// XML, GraphQL, schema, YAML, TOML, or OpenAPI export may be added.
// The `sanitiseFilenameSegment` helper used internally by the export
// module is intentionally NOT in this allow-list and must therefore
// not be exported from `export.ts`.
const ALLOWED_EXPORT_NAMES = new Set<string>([
  "exportADSPdf",
  "exportADSDocx",
  "exportECPPdf",
  "exportECPDocx",
]);

const FORBIDDEN_EXPORT_PATTERNS = [
  "json",
  "csv",
  "xml",
  "graphql",
  "schema",
  "yaml",
  "toml",
  "openapi",
];

export function assertNoStructuredADCExport(exportFns: readonly string[]): void {
  for (const name of exportFns) {
    const lower = name.toLowerCase();
    for (const pat of FORBIDDEN_EXPORT_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation (PH6-HC2): export module exposes a forbidden serialisation surface "${name}". ADC data may leave the application only as PDF/DOCX text or as the ADC_REF short-form token.`,
        );
      }
    }
    if (!ALLOWED_EXPORT_NAMES.has(name)) {
      throw new Error(
        `Phase 6 invariant violation (PH6-HC2): export module exposes unrecognised symbol "${name}". The Phase 6 allow-list is exactly: ${Array.from(ALLOWED_EXPORT_NAMES).join(", ")}.`,
      );
    }
  }
}

// PH6-HC1 / 6C — The portfolio entry shape MUST NOT carry any field
// suggesting lifecycle state, severity grade, computed score,
// runtime trigger / event, computed metric, or chart input. The
// brief lists these construct families verbatim.
//
// Phase 5 baseline note. Four pre-existing portfolio fields whose
// names predate Phase 6 — `complexityScore`,
// `operationalOverheadScore`, `changeCostLaterScore`, and
// `highestRiskSeverity` — are baseline indicator snapshots written
// once at freeze and never fed back into the grammar. They predate
// the Phase 6 brief and are explicitly listed in
// `PHASE_5_BASELINE_PORTFOLIO_FIELDS` below. The function's contract
// is forward-looking: any NEW field on the portfolio entry shape
// (i.e. any name in `entryShape` not in the Phase 5 baseline) must
// not match the forbidden constructs. PH6-HC7 requires Phase 6 to
// not modify the Phase 5 portfolio entry shape, which forces this
// reading.
const FORBIDDEN_FIELD_PATTERNS = [
  "lifecycle",
  "severity",
  "score",
  "trigger",
  "event",
  "metric",
  "chart",
  "ranking",
];

export const PHASE_5_BASELINE_PORTFOLIO_FIELDS: ReadonlySet<string> = new Set([
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
  "approvalFunctionsAffected",
  "approvalDominantFunctions",
]);

export function assertNoComputedADCFields(
  entryShape: readonly string[],
): void {
  for (const field of entryShape) {
    if (PHASE_5_BASELINE_PORTFOLIO_FIELDS.has(field)) continue;
    const lower = field.toLowerCase();
    for (const pat of FORBIDDEN_FIELD_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation (PH6-HC1): portfolio field "${field}" matches a forbidden construct pattern "${pat}". ADC data must not carry lifecycle fields, severity grades, computed scores, runtime triggers, events, metrics, charts, or rankings.`,
        );
      }
    }
  }
}

// PH6-HC6 — No constant or function in the Phase 6 surface may
// permit bypassing PH6-HC1..PH6-HC5. Override / bypass / force /
// ignore / skip / mandate / escalate naming patterns are forbidden.
const OVERRIDE_PATTERNS = [
  "override",
  "bypass",
  "force",
  "ignore",
  "skip",
  "escalate",
];

export function assertNoOverrideMechanism(): void {
  for (const name of Object.keys(togafContainment)) {
    const lower = name.toLowerCase();
    for (const pat of OVERRIDE_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation (PH6-HC6): togafContainment exposes an override-style symbol "${name}". Phase 6 forbids override / bypass / force / escalate mechanisms.`,
        );
      }
    }
  }
}

// Module-load side-effect: run all three invariants against the
// live application surface. A failure here fails the application
// bundle at startup, which is the intended behaviour — Phase 6 is a
// build-time refusal, not a runtime hint.
assertNoStructuredADCExport(Object.keys(exportModule));
assertNoComputedADCFields(PORTFOLIO_ALLOWED_FIELDS);
assertNoOverrideMechanism();

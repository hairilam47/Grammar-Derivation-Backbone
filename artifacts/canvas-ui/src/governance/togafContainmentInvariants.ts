// Phase 6 — Negative invariants ("what the system MUST NOT do").
//
// This module runs a small set of module-load assertions that fail
// the build if a future change re-introduces a forbidden surface.
// Each assertion encodes one of Phase 6's hard constraints in a way
// that future code cannot silently regress past.
//
// The module has no exports beyond the assertion entry-points. It is
// imported once from the application entry (App.tsx) so that any
// regression manifests at startup. Removing this import plus this
// file restores Phase 5 behaviour (PH6-HC7).
import * as exportModule from "./export";
// Imported from the lightweight constants module (PH6-HC2) — NOT
// from `portfolioStore.ts` — so that constitutional-containment
// invariants do not transitively load Phase 1–5 derivation modules
// at app-bundle startup. This preserves Phase 6's "cleanly removable
// / no real coupling" guarantee.
import { ALLOWED_FIELDS as PORTFOLIO_ALLOWED_FIELDS } from "./portfolioFields";
import * as togafContainment from "./togafContainment";

// PH6-HC2 — The export module's public surface is a closed set of
// text-format functions. No JSON, CSV, XML, GraphQL, or schema
// export may be added without explicit Phase 6 review.
const ALLOWED_EXPORT_NAMES = new Set([
  "exportADSPdf",
  "exportECPPdf",
  "exportADSDocx",
  "exportECPDocx",
  "sanitiseFilenameSegment",
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

export function assertNoStructuredADCExport(): void {
  for (const name of Object.keys(exportModule)) {
    const lower = name.toLowerCase();
    for (const pat of FORBIDDEN_EXPORT_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation: export module exposes a forbidden serialisation surface "${name}". ADC data may leave the application only as PDF/DOCX text or as the ADC_REF short-form token.`,
        );
      }
    }
    if (!ALLOWED_EXPORT_NAMES.has(name)) {
      throw new Error(
        `Phase 6 invariant violation: export module exposes unrecognised symbol "${name}". The Phase 6 allow-list is: ${Array.from(ALLOWED_EXPORT_NAMES).join(", ")}.`,
      );
    }
  }
}

// PH6-HC1 / 6C — The portfolio entry allow-list MUST NOT carry any
// field that suggests lifecycle state, runtime trigger/event, or
// computed metric/chart input. Existing fields whose names happen to
// contain "score" or "severity" predate Phase 6 and are baseline
// indicator snapshots, not exposure-derived metrics; they are
// explicitly grandfathered. Any newly-added field whose name matches
// the forbidden patterns must be reviewed under Phase 6.
const FORBIDDEN_FIELD_PATTERNS = [
  "lifecycle",
  "trigger",
  "event",
  "metric",
  "chart",
  "ranking",
];

const PHASE6_GRANDFATHERED_FIELDS = new Set<string>([
  "complexityScore",
  "operationalOverheadScore",
  "changeCostLaterScore",
  "highestRiskSeverity",
]);

export function assertNoComputedADCFields(): void {
  for (const field of PORTFOLIO_ALLOWED_FIELDS) {
    if (PHASE6_GRANDFATHERED_FIELDS.has(field)) continue;
    const lower = field.toLowerCase();
    for (const pat of FORBIDDEN_FIELD_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation: portfolio field "${field}" matches a forbidden construct pattern "${pat}". ADC data must not carry lifecycle fields, runtime triggers, events, or computed metrics.`,
        );
      }
    }
  }
}

// PH6-HC6 — No constant or function in the Phase 6 surface may
// permit bypassing PH6-HC1..PH6-HC5. We enforce this by forbidding
// any exported symbol whose name matches an override-style pattern.
const OVERRIDE_PATTERNS = ["override", "bypass", "force", "ignore", "skip"];

export function assertNoOverrideMechanism(): void {
  for (const name of Object.keys(togafContainment)) {
    const lower = name.toLowerCase();
    for (const pat of OVERRIDE_PATTERNS) {
      if (lower.indexOf(pat) !== -1) {
        throw new Error(
          `Phase 6 invariant violation: togafContainment exposes an override-style symbol "${name}". Phase 6 forbids override / bypass / force mechanisms.`,
        );
      }
    }
  }
}

// Module-load side-effect: run all three invariants. A failure here
// fails the application bundle at startup, which is the intended
// behaviour — Phase 6 is a build-time refusal, not a runtime hint.
assertNoStructuredADCExport();
assertNoComputedADCFields();
assertNoOverrideMechanism();

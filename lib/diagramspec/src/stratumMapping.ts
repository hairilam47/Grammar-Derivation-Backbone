// DiagramSpec — CTAD-section → stratum mapping (frozen lookup).
//
// The five strata are NEW and INDEPENDENT of the five CTAD
// sections. Each stratum draws from a chosen subset of CTAD
// sections; this is the single source of truth for that subset.
//
// Rationale per stratum:
//
//   organization
//     Organizational concerns (business units, partner orgs,
//     governance bodies). CTAD has no parameters that capture
//     these today, so the mapping is empty. A context-view at
//     the organization stratum will therefore produce zero
//     CTAD-derived nodes; future CTAD work can populate it.
//
//   strategy
//     Strategic posture and macro choices. CTAD captures one
//     strategy-relevant signal in `crossCutting`
//     (`resiliencePosture`); we draw only from that section so
//     the strategy view stays coarse-grained and is not flooded
//     by tactical infra detail.
//
//   business
//     Business capabilities and the application style that
//     packages them. The application section's
//     `applicationStyle` and `runtimeCategory` plus the
//     integration section's `boundaryScope` describe the
//     business-facing decomposition without exposing internal
//     framework choices.
//
//   application
//     The application as a system of interacting parts. Both
//     `application` and `integration` sections feed this
//     stratum; container / component views drill into the
//     same data at different granularities.
//
//   technology
//     Underlying technology substrate: how, where, and with what
//     ops surface the application runs. Drawn from
//     `infrastructure`, `crossCutting`, and `ops`. Deployment
//     views live exclusively at this stratum.

import type { DiagramStratum } from "./types";

// CTAD section ids the compiler expects on the input
// CtadStateExport. Hard-coded as string literals so this package
// has no dependency on canvas-ui or its CTAD registry.
export type CtadSectionKey =
  | "infrastructure"
  | "application"
  | "integration"
  | "crossCutting"
  | "ops";

export const CTAD_SECTIONS_FOR_STRATUM: Readonly<
  Record<DiagramStratum, readonly CtadSectionKey[]>
> = Object.freeze({
  organization: Object.freeze([]),
  strategy: Object.freeze(["crossCutting"]),
  business: Object.freeze(["application", "integration"]),
  application: Object.freeze(["application", "integration"]),
  technology: Object.freeze(["infrastructure", "crossCutting", "ops"]),
});

// For the `business` stratum we further restrict the param ids
// pulled from the application/integration sections so the
// resulting view stays at the business-capability granularity.
// Empty array = "all params from the section pass through".
export const BUSINESS_PARAM_ALLOWLIST: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    application: Object.freeze(["applicationStyle", "runtimeCategory"]),
    integration: Object.freeze(["boundaryScope"]),
  });

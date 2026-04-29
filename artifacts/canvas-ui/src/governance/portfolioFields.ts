// Lightweight constants module for the portfolio entry allow-list.
//
// Phase 6 (PH6-HC2) — extracted from `portfolioStore.ts` so that
// `togafContainmentInvariants.ts` can import the allow-list without
// transitively pulling in Phase 1–5 derivation modules
// (`exposureDerive`, `responsibilityLens`, etc.) at app-bundle load.
// Keeping Phase 6 invariants free of derivation imports preserves
// the layer's "cleanly removable / no real coupling" guarantee.
//
// The allow-list itself is still the canonical source of truth for
// every portfolio entry's persisted field shape; `portfolioStore.ts`
// re-exports it for backwards compatibility with existing callers.
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
//
// Stage A (ADC Wizard Retrofit) extension: the allow-list grew by
// exactly one further OPTIONAL frozen-at-freeze id field —
// `requirementsContractId` — which links the portfolio entry back to
// its Requirements Contract (if any) for traceability into the SRS
// export pipeline. The field is OPTIONAL because pre-Stage-A entries
// were written without a requirements contract; existing entries
// must continue to load (read-time withDefaults() coerces undefined
// to null). The field is write-once at freeze and read-only
// thereafter. The field name carries no lifecycle / severity /
// score / trigger / event / metric / chart / ranking pattern, so it
// passes the Phase 6 forbidden-construct check at module load.
export const ALLOWED_FIELDS = [
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
  // Stage A (ADC Wizard Retrofit) — optional id linking the portfolio
  // entry to its Requirements Contract. Optional because pre-Stage-A
  // entries do not carry it; mandatory at WRITE time only when the
  // freezing session captured a requirements contract.
  "requirementsContractId",
] as const;

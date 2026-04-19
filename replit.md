# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

The flagship application is the **Architecture Decision Canvas** — a deterministic, grammar-based system that maps organisation context, capability selections, and trade-off settings to a required set of architecture components, risks, and complexity indicators. Once a decision is approved (frozen), it produces immutable governance artefacts (ADS + ECP), is recorded in a portfolio of approved decisions, and can later be referenced by leadership-recorded policy signals as part of an institutional memory layer. The system is descriptive, not prescriptive, and never makes recommendations.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture Grammar Engine

`lib/architecture-grammar` is a pure TypeScript logic library with no UI, no database, and no vendor names. It encodes:

- **7 canonical Capabilities** (frozen): External Access, Internal Admin, Case Management, Document Management, Workflow & Approval, Reporting & Analytics, Audit & Compliance
- **18 canonical Components** (frozen): each with `layer`, `complexityWeight`, and `operationalImpact`
- **Rule A**: Capability → required components (only IN_SCOPE capabilities fire)
- **Rule B**: Component → dependent components (transitive, fixed-point resolution)
- **Rule C**: Context constraints (e.g. Government + High Sensitivity always forces Immutable Audit Store)
- **Rule D**: Trade-off modifiers for `complexityScore`, `operationalOverheadScore`, `changeCostLaterScore` — no structural mutation
- **Risk detection**: fires on missing audit logging, unauthenticated external access, unprotected data stores, unmonitored government systems

Entry point: `lib/architecture-grammar/src/index.ts`
Main function: `deriveArchitecture(context, capabilitySelections, tradeOffs) → ArchitectureResult`

## Architecture Decision Canvas UI

`artifacts/canvas-ui` is a React + Vite web app (preview path: `/`) with four top-level routes, all reachable from a shared header navigation (`PortfolioHeaderNav`):

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Wizard | Five-screen flow that produces an approved Architecture Decision (Steps 1–4 of the project) |
| `/portfolio` | Portfolio Governance | Read-only board of all approved decisions across the organisation (Step 5) |
| `/signals` | Policy Signals | Leadership-recorded patterns observed across the portfolio over time (Step 6) |
| `/reflection` | Reflective Governance View | Read-only observational view of how decisions and recorded attention have evolved over time (Step 7) |

The Wizard, Portfolio, and Signals layers are strictly stratified — each upper layer only reads from the layer below it; no upper layer can influence the derivation of a lower one.

### Wizard (Steps 1–4)

The five-screen wizard at `/`:

- **Screen 1 — ContextForm**: Collects `OrganisationContext` (organisation type, sensitivity level, system intent, expected lifespan)
- **Screen 2 — CapabilitySelector**: Assigns status (IN_SCOPE / DEFERRED / OUT_OF_SCOPE) to all 7 capabilities (explicit classification required for all before proceeding)
- **Screen 3 — ArchitectureResultDisplay**: Calls `deriveArchitecture()` synchronously with baseline trade-offs (Simple / Cloud / Minimal), displays required components grouped by layer, risks with RED/AMBER/GREEN indicators, and the three numeric complexity indicators
- **Screen 4 — TradeOffExplorer**: "What-If Exploration" view. Three radio-group toggles (Architecture: Simple/Distributed, Deployment: Cloud/OnPrem, Scope: Minimal/Full) re-derive only the indicator scores. Components and risks remain frozen at baseline values. Reset to Baseline restores Simple/Cloud/Minimal.
- **Screen 5 — FreezeAndExport**: Terminal "freeze" screen reachable only via the Step 4 "Freeze Decision & Export" action. Pre-freeze inline form collects Project Name + Approving Authority (these never feed the version hash). Renders a persistent metadata banner (ADS ID / Version / Date / Authority), a read-only ADS preview (6 fixed sections), a read-only ECP preview (9 sections sorted by `sectionOrder`), and four export buttons (ADS PDF, ADS DOCX, ECP PDF, ECP DOCX). Freezing also writes the new decision into the portfolio store. From this screen the user may export, navigate to the Portfolio (read-only), or Start Over — the frozen artefact itself cannot be edited.

### Governance Export Layer (`src/governance/`)

Pure, dependency-light TypeScript layer producing two artefacts client-side:

- **ADS (Architecture Decision Snapshot)** — 6 fixed ordered sections; deterministic version hash via FNV-1a on canonical JSON of `{ context, selections, baselineTradeOffs }` only (project metadata excluded by design).
- **ECP (Execution Constraint Profile)** — 9 sections defined in `ecpSections.ts` with explicit `sectionOrder`; runtime validation enforces uniqueness + contiguity; JSX renders the resolved sections generically with no per-section branching. ECP wording is intentionally category-level (Security / Operations / Compliance / Data Protection) — no specific tools, vendors, products, or practices.
- **Exports** — `jspdf` (PDF) and `docx` (DOCX) at fixed A4. Every page carries the integrity footer "This artefact was system-generated from an approved Architecture Decision Snapshot." Filenames: `ADS_<Project>_<Version>_<Date>.{pdf,docx}` / `ECP_...` with sanitised project segment.

No backend. All derivation and exports run client-side. Imports from `@workspace/architecture-grammar` (workspace dependency).

### Portfolio Governance View (Step 5)

`/portfolio` (`src/pages/Portfolio.tsx`) is a read-only board listing every approved decision (one row per `adsId` + `adsVersion`). It:

- Renders an interpretation panel that explains the view shows approved decisions only — not delivery status, cost, effort, or progress — and that sort/filter are presentation conveniences that do not imply priority or desirability.
- Presents the decisions table with sortable columns (project name, approving authority, decision date, complexity / op overhead / change-cost-later indicators, highest risk severity) and filters (approving authority, highest risk, baseline posture).
- Offers per-row read-only viewers for the original ADS and ECP, rendered from the persisted entry — never re-derived.
- Surfaces two cross-portfolio summaries: Risk Concentration (decisions per highest severity, plus distribution of risk categories present) and Indicator Distribution (numeric ranges across the portfolio).
- Modifies no decision data. Any change to a decision requires re-entering the wizard and freezing again.

### Policy Signals & Institutional Memory (Step 6)

`/signals` (`src/pages/Signals.tsx`) is a leadership-only memory surface where patterns observed across the approved portfolio can be recorded, discussed, and acknowledged. It is descriptive memory only — never assessment, ranking, scoring, or required action.

- **Seven fixed signal categories**: Risk Accumulation, Complexity Accumulation, Dependency Concentration, Posture Drift, Control Load, Decision Volatility, Exception Normalisation. No "Other", no extension, no sub-typing.
- **Three-state lifecycle**, forward-only and human-initiated: `Observed → Under Discussion → Acknowledged`. Acknowledged is terminal. Each transition stamps `lastReviewedAt`. There are no edits, no deletes, no auto-advance, no expiry, and no reverse transitions.
- **Question-only interpretation guidance**: every entry must end with `?`. The validator runs both at create time (form rejects submission) and at read time (tampered persisted records are dropped).
- **Optional links to portfolio entries**: a signal may reference one or more `adsId` + `adsVersion` pairs from the portfolio. The link is one-directional — it does not change the referenced decision in any way.
- **Architectural isolation**: the signals module imports only `listEntries` from the portfolio store and shared UI primitives. It imports nothing from the grammar engine, the wizard, the freeze flow, or the ADS/ECP builders. No Step 1–5 module imports the signals store. The Wizard, Freeze, Portfolio, and exports are unaffected by anything that happens on the Signals page.

### Governance Read-Models (`src/governance/portfolioStore.ts`, `src/governance/signalsStore.ts`)

Both Step 5 and Step 6 persist into `localStorage` as deliberately reduced read-models — never as authoritative inputs back into the grammar or wizard.

- **Portfolio store** (`adc.portfolio.v1`): persists exactly 13 allow-listed top-level fields per decision (`adsId`, `adsVersion`, project metadata, organisation context, baseline posture, the three indicator scores, highest risk severity, and the sets of risk categories and component layers present). The full ADS is intentionally not stored — the read-only viewer renders from these fields directly. Unknown fields throw on write; tampered records are silently dropped on read. Nested `organisationContext` and `baselinePosture` are key-checked too.
- **Signals store** (`adc.policy-signals.v1`): persists exactly 11 allow-listed top-level fields per signal (`signalId`, `signalCategory`, title, description, `evidenceSummary`, `interpretationGuidance`, optional `regulatoryContext`, `reviewingBody`, `status`, `createdAt`, `lastReviewedAt`). The nested `evidenceSummary` is itself allow-listed (`observationWindow`, `relatedDecisionCount`, `qualitativePattern`, optional `relatedEntries[]`), and each `relatedEntries` item is constrained to `adsId` + `adsVersion`. The allow-list is enforced both at write time (throws on unknown keys at any depth) and at read time (drops malformed records, including entries whose interpretation guidance is empty or non-question).

These stores exist as read-models — not write-paths — because the grammar engine remains the single source of structural truth. A persisted entry can be displayed and reasoned about, but it cannot mutate the next derivation.

### Governance Language Guard (`src/governance/staticTextGuard.ts`)

Every static label rendered by the Portfolio and Signals pages is registered through a centralised guard that runs at module load and throws on forbidden vocabulary. The guard is split into two named vocabularies:

- `PORTFOLIO_FORBIDDEN` — Step 5: `should`, `recommended`, `recommend`, `optimal`, `best practice`, `best-practice`, `preferred`, `ideal`, `ought to`. These would imply judgement or recommendation.
- `SIGNALS_FORBIDDEN` — Step 5 set plus `priority`, `fix`, `resolve`, `escalate`, `mitigate`. These would imply ranking, remediation, or escalation.
- `REFLECTIVE_FORBIDDEN` — strict superset of `SIGNALS_FORBIDDEN`, additionally rejecting `optimise`, `optimize`, `improve`, `reduce`, `urgent`, `critical`, `hotspot`, `hot-spot`, `attention required`, `target`, `norm`. These would imply optimisation, urgency, or normative targets and have no place in a purely descriptive reflective view.

The split exists because the Portfolio interpretation panel must be able to say *"does not imply priority"*, while the Signals page must reject the bare word `priority` in any of its labels. Each layer asserts its own vocabulary independently via `assertAllGovernanceLanguage` / `assertAllSignalsLanguage` / `assertAllReflectiveLanguage`.

### Reflective Governance View (Step 7)

`/reflection` (`src/pages/Reflection.tsx`) is a pure read-only observational layer. It answers the single question *"How does this institution's decision-making and governance attention change over time?"* without assessment, ranking, recommendation, or required action.

- **Decision Lineage** — for each `adsId` present in the portfolio, lists its frozen versions chronologically by `decisionDate` with date and truncated version hash. Single-version decisions are rendered the same way as multi-version ones; no churn or stability framing.
- **Governance Attention Over Time** — recorded policy signals bucketed by month of `createdAt`, then by `signalCategory` in the fixed taxonomy order. Each row shows title, current state, and creation date. Months are listed chronologically; no peaks or critical periods are highlighted.
- **Memory Overview** — plain counts only: total signals, count per `SignalStatus`, count per `SignalCategory`. No thresholds, percentages, or comparisons.
- **Silence Awareness** (sub-list within Memory Overview) — lists portfolio entries by `adsId` that are not currently referenced by any policy signal. Presented as a plain alphabetical list with no labels like "uncovered" or "gap".
- **Architectural isolation** — the Reflection module imports only `listEntries` from `portfolioStore` and `listSignals` (plus the `SIGNAL_CATEGORIES` and `SIGNAL_STATUSES` constants and types) from `signalsStore`. It imports nothing from the grammar engine, the wizard, the freeze flow, or the ADS/ECP builders. No Step 1–6 module imports the Reflection page. The page mutates nothing and persists nothing.

## States & Persistence Reference

| Layer | Storage Key | Allow-listed Top-Level Fields | Owner |
|-------|------------|-------------------------------|-------|
| Wizard / Freeze | (none — in-memory only until freeze) | n/a | `pages/Wizard.tsx` |
| Portfolio (Step 5) | `adc.portfolio.v1` (localStorage) | 13 fields: `adsId`, `adsVersion`, `projectName`, `approvingAuthority`, `decisionDate`, `organisationContext`, `baselinePosture`, `complexityScore`, `operationalOverheadScore`, `changeCostLaterScore`, `highestRiskSeverity`, `riskCategoriesPresent`, `layersPresent` | `governance/portfolioStore.ts` |
| Signals (Step 6) | `adc.policy-signals.v1` (localStorage) | 11 fields: `signalId`, `signalCategory`, `signalTitle`, `signalDescription`, `evidenceSummary`, `interpretationGuidance`, `regulatoryContext` (optional), `reviewingBody`, `status`, `createdAt`, `lastReviewedAt` | `governance/signalsStore.ts` |

Signal lifecycle states (forward-only): `Observed` → `Under Discussion` → `Acknowledged` (terminal).

ADS / ECP exported files (PDF / DOCX) are not persisted by the app — they are downloaded by the user.

## End-to-End Execution Flow

A single decision moves through the system as follows:

1. **Step 1 — Context.** The user enters `OrganisationContext` on Screen 1. Nothing is persisted yet.
2. **Step 2 — Capability scope.** All 7 capabilities receive an explicit IN_SCOPE / DEFERRED / OUT_OF_SCOPE classification on Screen 2.
3. **Step 3 — Derivation.** Screen 3 runs `deriveArchitecture(context, selections, baselineTradeOffs)` — a pure, deterministic call against the grammar engine. The displayed components, risks, and indicators are reproducible: the same inputs always yield the same output.
4. **Step 4 — Trade-off exploration.** Screen 4 lets the user explore alternative trade-off settings. Only the three indicator scores re-derive; the structural results from Step 3 are frozen at baseline. "Reset to Baseline" restores the original posture.
5. **Step 5 — Freeze (one-way).** Choosing "Freeze Decision & Export" opens an inline form for Project Name + Approving Authority (these never feed the version hash). On confirmation: the wizard transitions to Screen 5, the ADS and ECP are constructed, the version hash is computed via FNV-1a on canonical JSON of `{ context, selections, baselineTradeOffs }`, and a Portfolio entry is written to `adc.portfolio.v1`. **The freeze itself is one-way** — once produced, the ADS / ECP cannot be edited from this screen. From here the user may export, navigate to the Portfolio, or Start Over.
6. **Exports.** PDF and DOCX exports for ADS and ECP are generated client-side at fixed A4 with the integrity footer on every page. The exported files are immutable artefacts of the frozen decision.
7. **Step 5 — Portfolio Governance View.** The decision now appears as a row at `/portfolio`. The read-only ADS / ECP viewers render from the persisted entry directly — never by re-running the grammar.
8. **Step 6 — Policy Signals.** Over time, leadership may notice patterns across the portfolio (for example, repeated Posture Drift across decisions of a given approving authority) and record them at `/signals`. A signal can optionally reference one or more portfolio entries by `adsId` + `adsVersion`. The signal then moves through `Observed → Under Discussion → Acknowledged` via human-initiated transitions, each stamping `lastReviewedAt`. Acknowledged is terminal.
9. **Step 7 — Reflective Governance View.** At any time, leadership may visit `/reflection` to see how the institution's recorded decisions and recorded attention have evolved. The page reads from the portfolio and signals stores only and renders Decision Lineage, Governance Attention Over Time, and Memory Overview (with an optional Silence Awareness sub-list). It produces no judgement, recommendation, or required action; it persists nothing.

At no point in this flow does Step 7 affect Step 6, Step 6 affect Step 5, Step 5 affect the wizard, or the wizard alter the grammar. Each layer reads strictly downward.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run derive-example` — run the grammar engine example and print JSON output
- `pnpm --filter @workspace/canvas-ui run typecheck` — typecheck the canvas UI in isolation

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

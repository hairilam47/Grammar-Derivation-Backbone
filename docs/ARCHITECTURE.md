# Architecture Decision Canvas — Architecture

This document describes the system as it exists today. It is descriptive,
not prescriptive: it records what is built and how the pieces fit
together. For an agent-facing summary, see `replit.md`.

---

## 1. Purpose

The Architecture Decision Canvas is a deterministic, grammar-based system
that maps an organisation's context, capability selections, and trade-off
settings to a required set of architecture components, applicable risks,
and three complexity indicators. Approved decisions are frozen as
immutable governance artefacts (ADS and ECP), recorded in a portfolio,
referenced over time by leadership-recorded policy signals, and
observed through a read-only reflective view.

The system is descriptive: it never assesses, ranks, prescribes, or
requires action.

---

## 2. Monorepo Layout

The project is a pnpm workspace.

| Location | Role |
| --- | --- |
| `artifacts/canvas-ui` | React + Vite single-page application — the entire user-facing product |
| `artifacts/api-server` | Express 5 service (health + logger; not on the decision path) |
| `artifacts/mockup-sandbox` | Vite preview server used during component prototyping |
| `lib/architecture-grammar` | Pure TypeScript grammar engine — no UI or persistence dependencies |
| `lib/db`, `lib/api-spec`, `lib/api-zod` | Infrastructure scaffolding (not exercised by the canvas flow) |
| `scripts/src/derive-example.ts` | Functional sanity script that exercises the grammar engine end to end |

Stack: Node.js 24, pnpm, TypeScript 5.9, React + Vite (canvas UI),
Express 5 (api-server), Drizzle ORM + PostgreSQL (scaffolded), Zod, jspdf,
docx.

---

## 3. Layer Diagram

```
+--------------------------------------------------------------+
|  Layer 6  Reflective Governance View                         |
|           pages/Reflection.tsx                               |
+--------------------------------------------------------------+
                          | reads
                          v
+--------------------------------------------------------------+
|  Layer 5  Policy Signals Store                               |
|           governance/signalsStore.ts, pages/Signals.tsx      |
+--------------------------------------------------------------+
                          | reads (adsId, adsVersion only)
                          v
+--------------------------------------------------------------+
|  Layer 4  Portfolio Store                                    |
|           governance/portfolioStore.ts, pages/Portfolio.tsx  |
+--------------------------------------------------------------+
                          | reads (writes once on freeze)
                          v
+--------------------------------------------------------------+
|  Layer 3  Freeze + ADS / ECP Builder                         |
|           governance/adsBuilder.ts                           |
|           governance/ecpBuilder.ts                           |
|           governance/hash.ts                                 |
|           governance/identity.ts                             |
|           governance/export.ts                               |
+--------------------------------------------------------------+
                          | calls
                          v
+--------------------------------------------------------------+
|  Layer 2  Wizard State Machine                               |
|           pages/Wizard.tsx + components/wizard/*             |
+--------------------------------------------------------------+
                          | calls
                          v
+--------------------------------------------------------------+
|  Layer 1  Grammar Engine                                     |
|           lib/architecture-grammar                           |
+--------------------------------------------------------------+
```

Each layer reads only from the layers below it. There are no upward
dependencies. The grammar engine has no knowledge of UI, persistence,
governance, or signals. The Reflection view has no knowledge of any
mutating action; it reads aggregate state and persists nothing.

---

## 4. Layer 1 — Grammar Engine (`lib/architecture-grammar`)

A pure, deterministic TypeScript library. Same inputs always yield
identical output.

### Files

- `lib/architecture-grammar/src/capabilities.ts` — the 7 canonical capabilities
- `lib/architecture-grammar/src/components.ts` — the 18 canonical components
- `lib/architecture-grammar/src/rules.ts` — derivation rules A through D and risk detection
- `lib/architecture-grammar/src/derive.ts` — the public `deriveArchitecture` entry point
- `lib/architecture-grammar/src/types.ts` — shared types
- `lib/architecture-grammar/src/index.ts` — re-exports

### Canonical taxonomy (7 capabilities)

| ID | Concern |
| --- | --- |
| `CAP_EXTERNAL_ACCESS` | External user / partner access |
| `CAP_INTERNAL_ADMIN` | Internal administration |
| `CAP_CASE_MANAGEMENT` | Case / record handling |
| `CAP_DOCUMENT_MANAGEMENT` | Document handling |
| `CAP_WORKFLOW_APPROVAL` | Workflow and approvals |
| `CAP_REPORTING_ANALYTICS` | Reporting and analytics |
| `CAP_AUDIT_COMPLIANCE` | Audit and compliance |

### Canonical taxonomy (18 components)

Grouped by layer (`UI`, `Application`, `Data`, `Integration`, `Security`,
`Operations`):

`COMP_EXTERNAL_PORTAL`, `COMP_INTERNAL_PORTAL`, `COMP_API_INTERFACE`,
`COMP_APP_SERVICE`, `COMP_WORKFLOW_ENGINE`, `COMP_RULES_ENGINE`,
`COMP_RELATIONAL_STORE`, `COMP_DOCUMENT_REPO`, `COMP_AUDIT_STORE`,
`COMP_API_GATEWAY`, `COMP_EVENT_BROKER`, `COMP_EXTERNAL_CONNECTOR`,
`COMP_AUTH_SERVICE`, `COMP_AUTHZ_ACCESS`, `COMP_AUDIT_LOGGING`,
`COMP_ENCRYPTION`, `COMP_MONITORING`, `COMP_BACKUP_DR`.

Each component carries `complexityWeight` and `operationalImpact`
attributes used by Rule D.

### Derivation pipeline

- **Rule A** — capability → required components.
- **Rule B** — transitive dependency closure (if A requires B and B
  requires C, C is included).
- **Rule C** — context enforcement (e.g. High Sensitivity adds
  `COMP_ENCRYPTION`).
- **Rule D** — trade-off-aware indicator computation. Produces the
  three indicator scores (`complexityScore`, `operationalOverheadScore`,
  `changeCostLaterScore`).
- **Risk detection** — gap analysis across the resolved component set
  (for example, an external portal without an authentication service
  produces a RED risk).

### Public entry point

```ts
deriveArchitecture(
  context: OrganisationContext,
  selections: CapabilitySelection[],
  tradeOffs: TradeOffSettings,
): ArchitectureResult
```

The result contains the required components, applicable risks, and the
three indicator scores.

---

## 5. Layer 2 — Wizard (`artifacts/canvas-ui/src/pages/Wizard.tsx`)

A linear five-screen state machine. State lives in component memory;
nothing is persisted before freeze.

### Screens (`artifacts/canvas-ui/src/components/wizard/`)

1. **`ContextForm.tsx`** — captures `OrganisationContext` (organisation
   type, sensitivity level, system intent, expected lifespan).
2. **`CapabilitySelector.tsx`** — every capability classified
   `IN_SCOPE`, `DEFERRED`, or `OUT_OF_SCOPE`.
3. **`ArchitectureResultDisplay.tsx`** — calls the grammar engine and
   renders the derived components, risks, and indicators.
4. **`TradeOffExplorer.tsx`** — what-if exploration. Only the three
   indicator scores re-derive; the structural results from Step 3
   stay frozen at baseline. Includes a "Reset to Baseline" action.
5. **`FreezeMetadataForm.tsx` → `FreezeAndExport.tsx`** — pre-freeze
   inline form for Project Name and Approving Authority, then the
   terminal freeze screen.

The header shows a five-segment progress indicator alongside the shared
nav (`PortfolioHeaderNav`).

---

## 6. Layer 3 — Freeze and ADS / ECP Builder

### Files

- `artifacts/canvas-ui/src/governance/adsBuilder.ts` — builds the Architecture Decision Snapshot (6 sections)
- `artifacts/canvas-ui/src/governance/ecpBuilder.ts` — builds the Execution Constraint Profile (9 sections)
- `artifacts/canvas-ui/src/governance/ecpSections.ts` — ECP section definitions
- `artifacts/canvas-ui/src/governance/hash.ts` — `canonicalJSON` and `fnv1aHex`
- `artifacts/canvas-ui/src/governance/identity.ts` — `slugifyAdsId` for the logical decision identity
- `artifacts/canvas-ui/src/governance/export.ts` — PDF and DOCX export
- `artifacts/canvas-ui/src/governance/types.ts` — `ADS`, `ECP`, `ProjectMetadata` types

### Version hashing

```ts
version = fnv1aHex(canonicalJSON({ context, selections, baselineTradeOffs }))
```

Project Name and Approving Authority are intentionally excluded from the
hash, so renaming a project does not bump the version. `adsId` is a slug
of the project name and is the logical decision identity. Two freezes of
the same project with revised architecture share the same `adsId` but
have different `version` strings.

### ADS sections (6, fixed order)

1. Decision Context
2. Capability Scope Declaration
3. Derived Architecture (grouped by layer)
4. Risk Acknowledgement
5. Trade-Off Exploration Summary
6. Decision Record (project name, authority, date, version, adsId)

### ECP sections (9)

Sorted by `sectionOrder` defined in `ecpSections.ts`. Each section is
category-level wording with runtime validation.

### Exports

PDF (`jspdf`) and DOCX (`docx`) for both ADS and ECP, each carrying an
integrity footer. All export work runs client-side in the browser.

### Side effect

On freeze, `addOrUpdateEntry` writes into the portfolio store. Once
written, the frozen artefact cannot be edited from the freeze screen.

---

## 7. Layer 4 — Portfolio Store and View

### Files

- `artifacts/canvas-ui/src/governance/portfolioStore.ts`
- `artifacts/canvas-ui/src/pages/Portfolio.tsx`
- `artifacts/canvas-ui/src/components/governance/EntryArtefactView.tsx`
- `artifacts/canvas-ui/src/components/governance/ReadOnlyArtefactModal.tsx`

### Storage

Key `adc.portfolio.v1` in `localStorage`. Each entry is a top-level
allow-listed object with exactly 13 fields:

`adsId`, `adsVersion`, `projectName`, `approvingAuthority`,
`decisionDate`, `organisationContext`, `baselinePosture`,
`complexityScore`, `operationalOverheadScore`, `changeCostLaterScore`,
`highestRiskSeverity`, `riskCategoriesPresent`, `layersPresent`.

### Shape contract

`isValidEntry` silently drops corrupted entries on read. `assertAllowedFields`
throws on unknown fields at write time. Nested keys for
`organisationContext` and `baselinePosture` are also allow-listed.

### View

Read-only board with sortable columns, filter selects (Approving
Authority, Highest Risk, Baseline Posture), cross-portfolio summaries
(Risk Concentration, Indicator Distribution), and a read-only modal
viewer for ADS and ECP rendered directly from the persisted entry
— never by re-running the grammar.

---

## 8. Layer 5 — Policy Signals Store and View

### Files

- `artifacts/canvas-ui/src/governance/signalsStore.ts`
- `artifacts/canvas-ui/src/pages/Signals.tsx`

### Storage

Key `adc.policy-signals.v1` in `localStorage`. Each signal is a
top-level allow-listed object with 11 fields:

`signalId`, `signalCategory`, `signalTitle`, `signalDescription`,
`evidenceSummary`, `interpretationGuidance`, `regulatoryContext`
(optional), `reviewingBody`, `status`, `createdAt`, `lastReviewedAt`.

`evidenceSummary` is itself allow-listed (`observationWindow`,
`relatedDecisionCount`, `qualitativePattern`, `relatedEntries?`), as is
each `relatedEntries` item (`adsId`, `adsVersion`).

### Categories (7, fixed taxonomy)

Risk Accumulation, Complexity Accumulation, Dependency Concentration,
Posture Drift, Control Load, Decision Volatility, Exception Normalisation.

### Lifecycle

`Observed → Under Discussion → Acknowledged`. Forward-only via
`nextStatus`; each transition stamps `lastReviewedAt`. Acknowledged is
terminal — `advanceSignal` throws on a terminal signal.

### Interpretation guidance constraint

Every `interpretationGuidance` entry must be a non-empty string ending
with a question mark (`endsWithQuestionMark`). Both the create-time
validator and the read-time `isValidSignal` enforce this.

### Architectural isolation

The signals module imports only `listEntries` from the portfolio store
plus shared UI primitives. It imports nothing from the grammar engine,
the wizard, the freeze flow, or the ADS / ECP builders. No Step 1–5
module imports the signals store.

---

## 9. Layer 6 — Reflective Governance View

### File

- `artifacts/canvas-ui/src/pages/Reflection.tsx`

### Imports

Only `listEntries`, `listSignals`, `SIGNAL_CATEGORIES`, `SIGNAL_STATUSES`
plus types. Nothing from the grammar engine, the wizard, the freeze
flow, or the ADS / ECP builders. The page mutates nothing and persists
nothing.

### Panels (in render order)

1. **Reading this view** — interpretation banner. The banner says the
   page is descriptive only and does not assess, rank, prescribe, or
   require action.
2. **Decision Lineage** — for each `adsId`, the chronological sequence of
   frozen versions (decision date and truncated version hash). A
   single-version decision is shown the same way as a multi-version one.
3. **Governance Attention Over Time** — recorded policy signals bucketed
   by month of `createdAt`, then by category in canonical taxonomy
   order. Each row shows the signal title, status, and creation date.
4. **Memory Overview** — total signals, count by current state, count by
   category. Shown only when at least one signal exists; otherwise the
   panel renders a single neutral sentence with no counts.
5. **Silence Awareness** (sub-section of Memory Overview) — portfolio
   `adsId`s for which no policy signal currently references them,
   listed alphabetically.

### Aggregation discipline

Every figure on the page is a plain count or a chronological listing.
There are no scores, thresholds, percentages, or comparisons.

---

## 10. Static-Text Governance Guard

### File

- `artifacts/canvas-ui/src/governance/staticTextGuard.ts`

Three nested forbidden vocabularies are enforced at module load. Each
page registers every static label it renders into a single dictionary
and asserts the dictionary against its own vocabulary. JSX references
only those constants, so the guard cannot be bypassed.

| Vocabulary | Relationship | Additional forbidden tokens |
| --- | --- | --- |
| `PORTFOLIO_FORBIDDEN` | base set | `should`, `recommended`, `recommend`, `optimal`, `best practice`, `best-practice`, `preferred`, `ideal`, `ought to` |
| `SIGNALS_FORBIDDEN` | strict superset of `PORTFOLIO_FORBIDDEN` | `priority`, `fix`, `resolve`, `escalate`, `mitigate` |
| `REFLECTIVE_FORBIDDEN` | strict superset of `SIGNALS_FORBIDDEN` | `optimise`, `optimize`, `improve`, `reduce`, `urgent`, `critical`, `hotspot`, `hot-spot`, `attention required`, `target`, `norm` |

### Helpers

- `assertGovernanceLanguage`, `assertAllGovernanceLanguage` — used by `Portfolio.tsx`
- `assertSignalsLanguage`, `assertAllSignalsLanguage` — used by `Signals.tsx` and by `Reflection.tsx` against the Step 6 taxonomy it echoes
- `assertReflectiveLanguage`, `assertAllReflectiveLanguage` — used by `Reflection.tsx` for its own labels

### Layering carve-out

Dynamic data echoed from a lower layer is asserted against that layer's
guard, not the stricter guard of the consuming layer. This keeps the
strict downward-read invariant intact: a layer is never forced to rename
another layer's vocabulary. The Reflection page makes this explicit by
asserting `[...SIGNAL_CATEGORIES, ...SIGNAL_STATUSES]` against the
SIGNALS guard at module load.

---

## 11. Routing

Wouter, configured in `artifacts/canvas-ui/src/App.tsx` with
`base={import.meta.env.BASE_URL}`.

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `Wizard` | Five-screen flow for creating and approving a decision |
| `/portfolio` | `Portfolio` | Read-only board of all approved decisions |
| `/signals` | `Signals` | Leadership-recorded patterns observed across the portfolio |
| `/reflection` | `Reflection` | Read-only observational view |

Header navigation (`components/governance/PortfolioHeaderNav.tsx`) is
shared across all four routes.

---

## 12. Persistence

| Layer | Storage key | Owner | Shape contract | Authoritative? |
| --- | --- | --- | --- | --- |
| Wizard (Layer 2) | (in memory only) | `pages/Wizard.tsx` state | none — discarded on reload before freeze | ephemeral |
| Portfolio (Layer 4) | `adc.portfolio.v1` (`localStorage`) | `governance/portfolioStore.ts` | 13-field top-level allow-list, nested key allow-lists for `organisationContext` and `baselinePosture`, validated by `isValidEntry` | reduced read-model only |
| Signals (Layer 5) | `adc.policy-signals.v1` (`localStorage`) | `governance/signalsStore.ts` | 11-field top-level allow-list, nested allow-list for `evidenceSummary` and `relatedEntries` items, validated by `isValidSignal` (including question-mark guidance check) | reduced read-model only |
| Reflection (Layer 6) | (none) | `pages/Reflection.tsx` | n/a — pure aggregation | persists nothing |

Neither store ever feeds back into the grammar engine. The grammar
remains the single source of structural truth.

---

## 13. End-to-End Execution Flow

1. **Step 1 — Context.** The user enters `OrganisationContext` on
   Wizard Screen 1. Nothing is persisted.
2. **Step 2 — Capability scope.** All seven capabilities receive an
   explicit IN_SCOPE / DEFERRED / OUT_OF_SCOPE classification on Screen 2.
3. **Step 3 — Derivation.** Screen 3 calls
   `deriveArchitecture(context, selections, baselineTradeOffs)`. The
   displayed components, risks, and indicators are reproducible.
4. **Step 4 — Trade-off exploration.** Screen 4 lets the user explore
   alternative trade-off settings. Only the three indicator scores
   re-derive; the structural results from Step 3 stay frozen at
   baseline. "Reset to Baseline" restores the original posture.
5. **Step 5 — Freeze (one-way).** Choosing "Freeze Decision & Export"
   opens an inline form for Project Name + Approving Authority (these
   never feed the version hash). On confirmation the wizard transitions
   to Screen 5, the ADS and ECP are constructed, the version hash is
   computed via FNV-1a on canonical JSON of
   `{ context, selections, baselineTradeOffs }`, and a portfolio entry
   is written to `adc.portfolio.v1`. The freeze itself is one-way —
   the ADS / ECP cannot be edited from this screen.
6. **Step 5b — Portfolio Governance View.** The decision now appears as
   a row at `/portfolio`. The read-only ADS / ECP viewers render from
   the persisted entry directly — never by re-running the grammar.
7. **Step 6 — Policy Signals.** Over time, leadership may notice
   patterns across the portfolio (for example, repeated Posture Drift
   across decisions of a given approving authority) and record them at
   `/signals`. A signal can optionally reference one or more portfolio
   entries by `adsId` + `adsVersion`. The signal then moves through
   `Observed → Under Discussion → Acknowledged` via human-initiated
   transitions, each stamping `lastReviewedAt`. Acknowledged is terminal.
8. **Step 7 — Reflective Governance View.** At any time, leadership may
   visit `/reflection` to see how the institution's recorded decisions
   and recorded attention have evolved. The page reads from the
   portfolio and signals stores only and renders Decision Lineage,
   Governance Attention Over Time, and Memory Overview (with an optional
   Silence Awareness sub-list). It produces no judgement, no
   recommendation, and no required action; it persists nothing.

At no point in this flow does Step 7 affect Step 6, Step 6 affect
Step 5, Step 5 affect the wizard, or the wizard alter the grammar.
Each layer reads strictly downward.

---

## 14. Design Principles

- **Strict stratification.** Upper layers only read from lower layers.
- **Immutability of frozen decisions.** Once a decision is frozen, the
  ADS and ECP cannot be edited. New work for the same project produces
  a new `version` string under the same `adsId`.
- **Deterministic derivation.** The grammar engine guarantees the same
  inputs always yield the same output.
- **Read-only views.** Portfolio, Signals, and Reflection are strictly
  read-only for decision and signal data, providing observational
  insight without mutation paths.
- **Vocabulary stratification.** Each governance layer extends the
  forbidden vocabulary of the layer below it, with explicit carve-outs
  documented in `staticTextGuard.ts` and at each consuming page.
- **Read-model persistence.** The portfolio and signals stores are
  reduced read-models. They never feed back into the grammar.

---

## 15. Tests and Verification

- `scripts/src/derive-example.ts` — functional sanity check that
  exercises the grammar engine.
- Module-load assertions in `staticTextGuard.ts` and the page-level
  `assertAll*` calls function as compile-time-style gates: forbidden
  vocabulary cannot reach the rendered DOM without throwing at import.
- `isValidEntry` and `isValidSignal` enforce the persistence shape
  contract on every read; corrupted entries are silently dropped, never
  rendered.
- End-to-end Playwright runs are used during feature development to
  validate the full wizard → portfolio → signals → reflection flow.

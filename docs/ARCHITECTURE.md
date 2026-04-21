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

Three peer surfaces sit on top of this foundation, independent and
equal:

- **ADC — Decision Canvas (`/`).** Forms, approves and records the
  formal architecture decision. Authoritative.
- **CTAD — Conceptual Technology Architecture Design (`/ctad`).** An
  interpretive, reversible, *non-authoritative* technology
  exploration plane bound to a frozen ADC decision. Adds no new
  authority and writes nothing back to the decision.
- **ACW — Architecture Composition Workspace (`/workspace/*`).** A
  structural visualisation surface (TOGAF-aligned lenses, 2D and 3D
  canvas) strictly isolated from the decision pipeline.

CTAD and ACW are siblings of, not consumers of, each other; both
read the portfolio strictly read-only and neither can mutate the
decision pipeline.

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
docx, React Three Fiber (ACW 3D canvas).

---

## 2A. Phase History / Development Timeline

The system grew in phases. Each phase is strictly additive on the
phase before it and strictly removable without affecting prior phases.
Numbering reflects build order, not architectural priority.

| Phase | Theme | Surface introduced | Removable to |
| --- | --- | --- | --- |
| Core (Steps 1–7) | Wizard, grammar engine, freeze, ADS/ECP, portfolio, signals, reflection | `/`, `/portfolio`, `/signals`, `/reflection` | n/a (foundation) |
| Phase 1 | Decision Exposure View — baseline | `/exposure/:adsId` (Governance Domains, Scrutiny Vectors, Impact Surfaces, Functions Affected); two new portfolio fields (`inScopeCapabilityIds`, `ecpConstraintCategories`) | Pre-Phase 1 (delete `/exposure`, drop two fields) |
| Phase 2 | Exposure Narratives | Per-section *"Why this exposure exists"* disclosure with four-clause grammar | Phase 1 |
| Phase 3 | Cross-Functional Responsibility Lens | Single card beneath Phase 1/2 grid, function × pressure-types | Phase 2 |
| Phase 4 | Scenario-Conditioned Reading | Lens selector + inline qualifier annotations on existing Phase 1/2/3 surface | Phase 3 |
| Phase 5 | Decision Re-Entry Lens | *"Legitimate Re-Entry"* card; two new approval-time portfolio fields (`approvalFunctionsAffected`, `approvalDominantFunctions`) | Phase 4 (drop two fields, delete card) |
| Phase 6 | TOGAF / ArchiMate Constitutional Layer | `/governance/containment`; mandatory non-authority disclaimer in PDF/DOCX exports; advisory-only misuse hint in the wizard freeze form; build-time invariants module | Phase 5 (delete files, remove disclaimer injection, remove invariants import) |
| ACW | Architecture Composition Workspace | `/workspace/*` (5 TOGAF lenses, 2D/3D canvas primitives, empty by default) | Pre-ACW (delete `src/acw/`, `src/components/acw/`, `src/pages/acw/`, route definitions) |
| CTAD | Conceptual Technology Architecture Design — third peer plane | `/ctad`, `/ctad/:adsId/:adsVersion` (state-driven, non-wizard, four collapsible categorical sections, live `CTAD_STATE` preview, references catalogues); landing page promoted from two cards to three equal peer cards; CTAD entry added to `GlobalNav` between Decision Canvas and Portfolio | Pre-CTAD (delete `src/ctad/`, `src/pages/ctad/`, the two CTAD routes + invariant side-effect imports in `App.tsx`, the CTAD nav entry in `GlobalNav.tsx`, the CTAD card in `LandingPage.tsx`, the CTAD vocabulary tier in `staticTextGuard.ts`) |

The portfolio entry allow-list grew from 13 fields (Core) to 15 (Phase 1)
to 17 (Phase 5). It has not changed since. Phase 6 explicitly refuses
to add any new portfolio field (`assertNoComputedADCFields`). The ACW
adds none.

---

## 3. Layer Diagram

> **ACW Track 3 (`/acw/derived`) sits beside the layer stack as a
> read-only derived view.** It reads CTAD_STATE (via the read-only
> named-import surface of `ctad/ctadStore`) plus a small projection
> of ADC bounds (via `governance/portfolioStore.listEntries`) and
> mechanically derives a structural diagram. It writes nothing
> back to any store. See §18D for the full design.

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

  Sibling derived lenses (read Layer 4 only, persist nothing):

  +----------------------------------------------------------+
  |  Decision Exposure View (/exposure/:adsId)               |
  |    Phase 1 baseline      governance/exposureDerive.ts    |
  |    Phase 2 narratives    governance/exposureNarratives.ts|
  |    Phase 3 responsibility governance/responsibilityLens.ts|
  |    Phase 4 scenario      governance/scenarioReading.ts   |
  |    Phase 5 re-entry      governance/decisionReentry.ts   |
  +----------------------------------------------------------+

  Constitutional layer (build-time refusals, no runtime authority):

  +----------------------------------------------------------+
  |  Phase 6 TOGAF / ArchiMate Containment                   |
  |    governance/togafContainment.ts                        |
  |    governance/misusePlaybooks.ts                         |
  |    governance/togafContainmentInvariants.test-shape.ts   |
  |    pages/Containment.tsx (route /governance/containment) |
  +----------------------------------------------------------+

  Sibling workspace shell (no read of any decision-pipeline module):

  +----------------------------------------------------------+
  |  ACW Workspace Builder (/workspace/*)                    |
  |    pages/acw/WorkspaceShell.tsx + 5 lens views           |
  |    components/acw/Canvas2D.tsx, Canvas3D.tsx             |
  |    acw/acwGrammarHooks.ts (empty stubs)                  |
  |    acw/acwIsolationInvariants.test-shape.ts              |
  +----------------------------------------------------------+

  Sibling third peer plane (read-only on portfolio, no read of
  any other decision-pipeline module):

  +----------------------------------------------------------+
  |  CTAD — Conceptual Technology Architecture Design        |
  |    (/ctad, /ctad/:adsId/:adsVersion)                     |
  |    ctad/ctadRegistry.ts          (4 sections, frozen)    |
  |    ctad/ctadStore.ts             (localStorage,          |
  |                                   per-binding,           |
  |                                   reversible, no derive) |
  |    ctad/ctadIsolationInvariants.test-shape.ts            |
  |    ctad/ctadGrammarInvariants.test-shape.ts              |
  |    pages/ctad/CtadEntry.tsx      (frozen-decision list)  |
  |    pages/ctad/CtadShell.tsx      (bound exploration)     |
  +----------------------------------------------------------+
```

Each layer reads only from the layers below it. There are no upward
dependencies. The grammar engine has no knowledge of UI, persistence,
governance, or signals. The Reflection view has no knowledge of any
mutating action; it reads aggregate state and persists nothing.

The five Decision Exposure lenses (Phases 1–5) all read a single
`PortfolioEntry` and re-derive on every render. They never write back
to the portfolio store and never feed back into the grammar engine.
The Phase 6 constitutional layer adds no derivation, no portfolio
field, and no export surface — it only classifies and refuses. The
ACW workspace is structurally isolated by a build-time decoupling
invariant: it imports nothing from the Decision Canvas decision
pipeline.

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
nav (`GlobalNav`).

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
allow-listed object with exactly 17 fields:

`adsId`, `adsVersion`, `projectName`, `approvingAuthority`,
`decisionDate`, `organisationContext`, `baselinePosture`,
`complexityScore`, `operationalOverheadScore`, `changeCostLaterScore`,
`highestRiskSeverity`, `riskCategoriesPresent`, `layersPresent`,
`inScopeCapabilityIds`, `ecpConstraintCategories`,
`approvalFunctionsAffected`, `approvalDominantFunctions`.

The last four fields are written once at freeze and read-only
thereafter: `inScopeCapabilityIds` and `ecpConstraintCategories`
were added to drive the Decision Exposure View (Phase 1);
`approvalFunctionsAffected` and `approvalDominantFunctions` were
added to drive the Decision Re-Entry Lens (Phase 5).

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

A lattice of nine forbidden vocabularies is enforced at module load.
Each page registers every static label it renders into a single
dictionary and asserts the dictionary against its own vocabulary. JSX
references only those constants, so the guard cannot be bypassed.

The lattice is not a single chain. `PORTFOLIO_FORBIDDEN` and
`SIGNALS_FORBIDDEN` form the base. Three sibling tiers
(`REFLECTIVE_FORBIDDEN`, `EXPOSURE_NARRATIVE_FORBIDDEN`,
`RESPONSIBILITY_LENS_FORBIDDEN`) each strict-superset
`SIGNALS_FORBIDDEN` independently. `SCENARIO_READING_FORBIDDEN` is a
strict superset of all three siblings. Above it sit two further
sibling tiers (`DECISION_REENTRY_FORBIDDEN` and
`TOGAF_CONTAINMENT_FORBIDDEN`), and `ACW_PLACEHOLDER_FORBIDDEN` is a
strict superset of `TOGAF_CONTAINMENT_FORBIDDEN`. None of the
sibling pairs is interchangeable in either direction.

| Vocabulary | Relationship | Additional forbidden tokens |
| --- | --- | --- |
| `PORTFOLIO_FORBIDDEN` | base set | `should`, `recommended`, `recommend`, `optimal`, `best practice`, `best-practice`, `preferred`, `ideal`, `ought to` |
| `SIGNALS_FORBIDDEN` | strict superset of `PORTFOLIO_FORBIDDEN` | `priority`, `fix`, `resolve`, `escalate`, `mitigate` |
| `REFLECTIVE_FORBIDDEN` | strict superset of `SIGNALS_FORBIDDEN` | `optimise`, `optimize`, `improve`, `reduce`, `urgent`, `critical`, `hotspot`, `hot-spot`, `attention required`, `target`, `norm` |
| `EXPOSURE_NARRATIVE_FORBIDDEN` | strict superset of `SIGNALS_FORBIDDEN` (sibling of `REFLECTIVE_FORBIDDEN` and `RESPONSIBILITY_LENS_FORBIDDEN`, not interchangeable) | `must`, `improve`, `reduce`, `optimise`, `optimize`, `high risk`, `severe`, `critical` |
| `RESPONSIBILITY_LENS_FORBIDDEN` | strict superset of `SIGNALS_FORBIDDEN` (sibling of `REFLECTIVE_FORBIDDEN` and `EXPOSURE_NARRATIVE_FORBIDDEN`, not interchangeable) | `owner`, `responsible`, `accountable`, `ensure`, `must`, `required`, `primary`, `secondary`, `lead`, `escalation`, `address`, `high`, `low`, `critical`, `significant`, `major`, `minor`, `urgent` |
| `SCENARIO_READING_FORBIDDEN` | strict superset of all three sibling tiers above | `predict`, `forecast`, `probability`, `likelihood`, `worst`, `best`, `severe`, `escalate`, `urgent` |
| `DECISION_REENTRY_FORBIDDEN` | strict superset of `SCENARIO_READING_FORBIDDEN` (sibling of `TOGAF_CONTAINMENT_FORBIDDEN`, not interchangeable) | `fix`, `change`, `update`, `revise`, `rework`, `should`, `must`, `need`, `urgent`, `critical`, `failed`, `overdue` |
| `TOGAF_CONTAINMENT_FORBIDDEN` | strict superset of `SCENARIO_READING_FORBIDDEN` (sibling of `DECISION_REENTRY_FORBIDDEN`, not interchangeable) | `mandate`, `justify`, `trigger`, `score`, `rank`, `sequence`, `prioritise`, `prioritize`, `evaluate`, `enforce` |
| `ACW_PLACEHOLDER_FORBIDDEN` | strict superset of `TOGAF_CONTAINMENT_FORBIDDEN` | `optimise`, `optimize`, `recommend`, `recommended`, `target`, `best` (each restated literally per the ACW brief; some are already present transitively via the REFLECTIVE / SCENARIO_READING chain or the PORTFOLIO base) |
| `CTAD_FORBIDDEN` | **standalone tier** (sibling of every governance tier above; it does NOT extend any of them and is NOT extended by any of them) | `approve`, `approved`, `confirm`, `recommend`, `recommended`, `best`, `optimal`, `optimise`, `optimize`, `final`, `score`, `ranked`, `ranking`, `mandate`, `justify`, `enforce`, `must` |

`CTAD_FORBIDDEN` is intentionally a sibling tier rather than an
extension of `PORTFOLIO_FORBIDDEN` or any descendant. The CTAD
plane is non-authoritative by construction (it forms no decision,
records nothing into ADC artefacts, and writes only to its own
`ctad.state.v1` localStorage document). Forbidding approval,
recommendation, ranking, scoring and obligation vocabulary in CTAD-
authored copy keeps the surface from accidentally reading as if it
were participating in the decision pipeline.

There is exactly one carve-out: the empty-state sentence "CTAD
requires an approved architectural decision." is mandated verbatim
by the brief and contains the forbidden token "approved". CTAD
handles this by **spec-equality exemption** — the entry page
asserts the literal sentence against a frozen constant and skips
`assertAllCtadLanguage` for that one string only. Every other
CTAD label, hint, parameter name, parameter option, section title
and reference label is asserted at module load.

`REFLECTIVE_FORBIDDEN`, `EXPOSURE_NARRATIVE_FORBIDDEN`, and
`RESPONSIBILITY_LENS_FORBIDDEN` all extend `SIGNALS_FORBIDDEN` in
different directions: Reflection forbids target / norm framing;
Exposure narratives forbid prescriptive and severity framing; the
Responsibility Lens forbids ownership-assignment, obligation, severity,
priority, and remediation framing. None is a strict superset of any
other.

`DECISION_REENTRY_FORBIDDEN` and `TOGAF_CONTAINMENT_FORBIDDEN` both
extend `SCENARIO_READING_FORBIDDEN` in different directions: Phase 5
forbids change-vocabulary (fix / change / update / revise / rework,
etc.) so the Re-Entry Lens cannot read as recommending change; Phase 6
forbids authority-vocabulary (mandate / justify / trigger / score /
rank / sequence / prioritise / evaluate / enforce) so the
constitutional containment surface cannot read as conferring authority
on ADC artefacts. Neither is a strict superset of the other and they
are not interchangeable.

### Helpers

- `assertGovernanceLanguage`, `assertAllGovernanceLanguage` — used by `Portfolio.tsx`
- `assertSignalsLanguage`, `assertAllSignalsLanguage` — used by `Signals.tsx` and by `Reflection.tsx` against the Step 6 taxonomy it echoes
- `assertReflectiveLanguage`, `assertAllReflectiveLanguage` — used by `Reflection.tsx` and by `pages/Exposure.tsx` for its own labels
- `assertExposureNarrativeLanguage`, `assertAllExposureNarrativeLanguage` — used by `governance/exposureNarratives.ts` for the composed Phase 2 narrative paragraphs
- `assertResponsibilityLensLanguage`, `assertAllResponsibilityLensLanguage` — used by `governance/responsibilityLens.ts` and by `pages/Exposure.tsx` for the Phase 3 lens literals
- `assertScenarioReadingLanguage`, `assertAllScenarioReadingLanguage` — used by `governance/scenarioReading.ts` for Phase 4 qualifier and lens literals
- `assertDecisionReentryLanguage`, `assertAllDecisionReentryLanguage` — used by `governance/decisionReentry.ts` and by `pages/Exposure.tsx` for the Phase 5 re-entry surface
- `assertTogafContainmentLanguage`, `assertAllTogafContainmentLanguage` — used by `governance/togafContainment.ts`, `governance/misusePlaybooks.ts`, and `pages/Containment.tsx` for the Phase 6 constitutional surface
- `assertAcwPlaceholderLanguage`, `assertAllAcwPlaceholderLanguage` — used by `acw/acwGrammarHooks.ts`, `pages/acw/WorkspaceShell.tsx`, the five ACW lens views, and the two ACW canvas primitives for every static label rendered by the ACW workspace
- `assertCtadLanguage`, `assertAllCtadLanguage` — used by `ctad/ctadRegistry.ts` (asserted over every section title, parameter label and parameter option at module load), `pages/ctad/CtadEntry.tsx` (every static label except the spec-exempt empty-state sentence), and `pages/ctad/CtadShell.tsx` (every binding-panel label, hint, button, references-panel item)

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
`base={import.meta.env.BASE_URL.replace(/\/$/, "")}` (the trailing
slash is stripped so artifacts mounted at root and at a prefix both
resolve consistently).

| Path | Component | Purpose |
| --- | --- | --- |
| `/` | `Wizard` | Five-screen flow for creating and approving a decision |
| `/portfolio` | `Portfolio` | Read-only board of all approved decisions |
| `/signals` | `Signals` | Leadership-recorded patterns observed across the portfolio |
| `/reflection` | `Reflection` | Read-only observational view |
| `/exposure/:adsId` | `Exposure` | Decision Exposure View for one approved decision (Phases 1–5 stacked) |
| `/governance/containment` | `Containment` | TOGAF / ArchiMate constitutional containment layer (Phase 6) |
| `/workspace` | `ContextDomain` | ACW workspace — defaults to the Context & Domain lens |
| `/workspace/context` | `ContextDomain` | ACW Context & Domain lens (TOGAF Business, structural only) |
| `/workspace/landscape` | `SystemLandscape` | ACW System Landscape lens (TOGAF Application; embeds 2D canvas with drill-down) |
| `/workspace/integration` | `IntegrationView` | ACW Integration lens (Application + Data; empty placeholders) |
| `/workspace/deployment` | `Deployment` | ACW Deployment & Infrastructure lens (TOGAF Technology; embeds 3D canvas) |
| `/workspace/operations` | `OperationsContinuity` | ACW Operations & Continuity lens (cross-layer, descriptive only) |
| `/ctad` | `CtadEntry` | CTAD entry — lists every frozen ADC decision; bound exploration is opened from a row |
| `/ctad/:adsId/:adsVersion` | `CtadShell` | CTAD bound exploration — read-only ADC binding panel + four collapsible state-driven sections + live `CTAD_STATE` preview + references catalogues |
| `/acw/derived` | `Track3Entry` | ACW Track 3 — lists every frozen ADC decision; the derived structural view is opened from a row (see §18D) |
| `/acw/derived/:adsId/:adsVersion` | `Track3Shell` | ACW Track 3 — derived structural view bound to one ADC. Read-only binding panel + view controls (2D/3D, perspective, layer toggles) + a structural diagram mechanically derived from CTAD_STATE + ADC bounds. Writes nothing back; the only persistent storage owned by Track 3 is `acw.track3.viewprefs.v1`. |

Header navigation (`components/governance/GlobalNav.tsx`) is
shared across all routes and exposes top-level links to Landing,
Decision Canvas, **CTAD**, Portfolio, Signals, Reflection, and
Architecture Workspace (in that order; CTAD sits between Decision
Canvas and Portfolio). Exposure is reached from a portfolio row,
not from the global nav. The five ACW lenses are reached through
the workspace shell's lens-style sub-navigation, which has no
progress indicator and no next/previous. The CTAD bound shell at
`/ctad/:adsId/:adsVersion` is reached from the CTAD entry list,
not from the global nav.

---

## 12. Persistence

| Layer | Storage key | Owner | Shape contract | Authoritative? |
| --- | --- | --- | --- | --- |
| Wizard (Layer 2) | (in memory only) | `pages/Wizard.tsx` state | none — discarded on reload before freeze | ephemeral |
| Portfolio (Layer 4) | `adc.portfolio.v1` (`localStorage`) | `governance/portfolioStore.ts` | 17-field top-level allow-list, nested key allow-lists for `organisationContext` and `baselinePosture`, validated by `isValidEntry` | reduced read-model only |
| Signals (Layer 5) | `adc.policy-signals.v1` (`localStorage`) | `governance/signalsStore.ts` | 11-field top-level allow-list, nested allow-list for `evidenceSummary` and `relatedEntries` items, validated by `isValidSignal` (including question-mark guidance check) | reduced read-model only |
| Reflection (Layer 6) | (none) | `pages/Reflection.tsx` | n/a — pure aggregation | persists nothing |
| Decision Exposure (Phases 1–5) | (none) | `pages/Exposure.tsx` + `governance/exposure*`, `responsibilityLens.ts`, `scenarioReading.ts`, `decisionReentry.ts` | n/a — pure derivation from one `PortfolioEntry` per render | persists nothing |
| TOGAF / ArchiMate Containment (Phase 6) | (none) | `pages/Containment.tsx` + `governance/togafContainment.ts`, `governance/misusePlaybooks.ts` | n/a — pure refusal validators and static tables | persists nothing |
| CTAD Bound Exploration (`/ctad/:adsId/:adsVersion`) | `ctad.state.v1` (`localStorage`) | `ctad/ctadStore.ts` (write goes through `findParam` registry validation; per-binding state is keyed by `${adsId}@${adsVersion}`) | Document is `{ schemaVersion: "ctad-1.0", bindings: { [bindingKey]: { adsId, adsVersion, params: { [paramId]: string \| string[] }, updatedAt } } }`. Binding entries are NEVER materialised empty — clearing the last param of a binding deletes the binding key entirely, and clearing a param on a binding that does not exist is a fast-path no-op. Validated against `ctadRegistry`: every persisted `paramId` must exist in the registry; every `single` value must be a string from `param.options`; every `multi` value must be an array whose every element is a string from `param.options`. The schema version is locked at module load by `ctadGrammarInvariants`. | per-binding interpretive state only; no derivation, no scoring, no recommendation, no flow back into ADC, signals, exposure, or the grammar engine |
| ACW Track 3 Derived View (`/acw/derived/*`) | `acw.track3.viewprefs.v1` (`localStorage`) | `acw/track3/track3ViewPrefs.ts` (schema-locked at `acw-track3-viewprefs-1.0`) | Document is `{ schemaVersion: "acw-track3-viewprefs-1.0", byBinding: { [bindingKey]: { viewMode: "2d"\|"3d", perspective: Track3Perspective, hiddenLayers: string[], cameraX: number, cameraY: number, cameraZoom: number } } }`. Locked top-level allow-list (`schemaVersion`, `byBinding`) and per-binding allow-list (`viewMode`, `perspective`, `hiddenLayers`, `cameraX`, `cameraY`, `cameraZoom`). Validated by `assertValidPrefsDoc` on read; the entire diagram structure itself is **not persisted** — it is recomputed on every render via `deriveACWStructure(getCtadState(binding), projectBounds(entry))`. | view preferences only; the diagram is purely derived |
| ACW Workspace (`/workspace/*`) — v1 grammar diagram | `acw.workspace.v1` (`localStorage`) | `acw/acwStore.ts` (write goes through `acwValidator.ts`; allow-list `assertAllowedFields` and read-validate `isValidWorkspace`); registry in `acw/acwGrammar.ts`; React subscription via `acw/acwGrammarHooks.ts#useAcwWorkspace`; surfaces `pages/acw/WorkspaceShell.tsx` + 5 lens views, `components/acw/AuthoringPanel.tsx`, `components/acw/LiveStructurePanel.tsx`, `components/acw/Canvas2D.tsx`, `Canvas3D.tsx` | Document is `{ schemaVersion: "acw-1.0", structureGraph: { nodes, edges } }`; node fields = `{ id, type, parentId, label, x, y }`; edge fields = `{ id, kind, fromId, toId }`. Locked allow-list at every nested level, validated by `__acwStoreInternals.isValidWorkspace` on read and `assertAllowedFields` on write. Containment is also materialised via `parentId` at node-creation time; the explicit edge kinds the user can author are CONTAINS, CONNECTS, INTERFACES_WITH, DATA_FLOW. CONTAINS is therefore representable both as the child's `parentId` and as a redundant-but-permitted edge record between the two existing nodes. | structure-only persistence; no semantics, no scoring, no ranking, no derivation |

No store ever feeds back into the grammar engine. The grammar
remains the single source of structural truth. The portfolio store
is the only authoritative governance read-model; the signals store
is a leadership read-model that may reference portfolio entries by
identity; the CTAD store is a per-binding interpretive overlay
that may reference portfolio entries by identity but writes
nothing back. ACW persists structural diagrams and reads nothing
from any decision-pipeline module. No surface added in Phase 1
onward introduces a network call or cache.

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
9. **Decision Exposure View (Phases 1–5).** From any portfolio row,
   leadership may navigate to `/exposure/:adsId` to read — for one
   approved decision — where the decision places institutional
   exposure. The view reads exclusively from a single portfolio entry
   and re-derives all five lenses on every render: Phase 1 baseline
   surfaces, Phase 2 narrative disclosures, Phase 3 responsibility
   lens, Phase 4 scenario-conditioned reading, and Phase 5
   Legitimate Re-Entry signals. It persists nothing. The page never
   mutates the entry it reads.
10. **TOGAF / ArchiMate Containment (Phase 6).** At any time,
    leadership may visit `/governance/containment` to read what ADC
    artefacts must NOT be read as doing: the verbatim mandatory
    non-authority disclaimer, the docking-class table for TOGAF
    artefacts, the misuse playbook table, and a try-phrase advisory
    input. Phase 6 does not derive, score, persist, or feed back
    anywhere; its only behaviour is classify, refuse, expose-as-text.
    The freeze-time PDF and DOCX exports for ADS and ECP both
    inject the verbatim disclaimer; the wizard's freeze-metadata
    form runs an advisory-only misuse hint against project name and
    authority inputs (never blocks, never persists).
11. **ACW Workspace Builder.** Independently of the decision pipeline,
    a user may visit `/workspace/*` to assemble or view architecture
    *structure* through five TOGAF-aligned lenses (Context & Domain,
    System Landscape, Integration, Deployment & Infrastructure,
    Operations & Continuity). The workspace is empty by default,
    consults no grammar, no portfolio, no signals, no freeze
    pipeline, and persists nothing. The System Landscape lens hosts a
    pan/zoom 2D canvas with a drill-down contract; the Deployment
    lens hosts a 3D canvas (React Three Fiber, with neutral fallback
    when WebGL is unavailable). A build-time invariant fails the
    bundle if any ACW source imports from the Decision Canvas
    decision pipeline.

At no point in this flow does Step 7 affect Step 6, Step 6 affect
Step 5, Step 5 affect the wizard, the wizard alter the grammar, the
Exposure view mutate the portfolio, the Containment view mutate
anything, or the ACW workspace touch the decision pipeline. Each
layer reads strictly downward; sibling lenses read only the
portfolio and re-derive on every render.

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
- **Constitutional non-authority (Phase 6).** ADC artefacts cannot
  recommend, mandate, justify, trigger, or rank. This is encoded as
  build-time refusals (`assertNoComputedADCFields`,
  `assertNoStructuredADCExport`, `assertNoOverrideMechanism`), the
  strictest vocabulary tier (`TOGAF_CONTAINMENT_FORBIDDEN`), the
  spec-equality + expected-throw lock on the mandatory disclaimer,
  and a default-deny TOGAF artefact docking table. Phase 6 carries
  no override flag of any kind.
- **Lens-only navigation, no sequencing.** Two surfaces in the
  system follow this principle. The ACW workspace exposes five
  sibling lenses with no progress indicator, no next/previous, no
  maturity language, and no completion signal — switching lenses
  observes the same workspace differently and does nothing
  structural. The Decision Exposure card stack (Phases 1–5 plus the
  Phase 4 scenario selector) is also strictly additive and unranked:
  every card is rendered in fixed order, each has equal visual
  weight, and no card supersedes, replaces, or is "more advanced
  than" any other.
- **Build-time invariants over runtime checks.** Architectural
  guarantees that must hold for the entire bundle's life are
  expressed as `*.test-shape.ts` modules whose side effects run at
  app startup. A failure in any such file fails the bundle, not a
  runtime feature. See section 15A.
- **Strict removability of every additive layer.** Each phase
  (Phases 1–6 and the ACW) can be removed cleanly without touching
  the prior layer. Removability is asserted in each phase's
  documentation section and tested by inspection at review time.

---

## 15. Tests and Verification

- `scripts/src/derive-example.ts` — functional sanity check that
  exercises the grammar engine.
- Module-load assertions in `staticTextGuard.ts` and the page-level
  `assertAll*` calls function as compile-time-style gates: forbidden
  vocabulary cannot reach the rendered DOM without throwing at import.
  Each governance vocabulary tier (`PORTFOLIO_FORBIDDEN`,
  `SIGNALS_FORBIDDEN`, `REFLECTIVE_FORBIDDEN`,
  `EXPOSURE_NARRATIVE_FORBIDDEN`, `RESPONSIBILITY_LENS_FORBIDDEN`,
  `SCENARIO_READING_FORBIDDEN`, `DECISION_REENTRY_FORBIDDEN`,
  `TOGAF_CONTAINMENT_FORBIDDEN`, `ACW_PLACEHOLDER_FORBIDDEN`) has its
  own `assert<Tier>Language` / `assertAll<Tier>Language` helper pair.
- `isValidEntry` and `isValidSignal` enforce the persistence shape
  contract on every read; corrupted entries are silently dropped, never
  rendered. `assertAllowedFields` throws on unknown fields at write
  time.
- **Spec-equality + expected-throw pattern.** Static sentences that
  intentionally negate the very vocabulary their tier bans (the
  Phase 1 banner, the Phase 2 framing-boundary clause, the Phase 3
  responsibility-lens prefix, the Phase 5 re-entry prefix, the
  Phase 6 mandatory non-authority disclaimer) are locked by two
  complementary checks at module load: spec-equality against a
  literal copy of the brief wording, and an expected-throw substring
  scan whose successful throw is itself the proof the negated
  banned tokens are still present. If a future edit removes the
  negated tokens the scan stops throwing and a constitutional drift
  error is raised. Together this is strictly stronger than a
  passing substring scan would be. Verified live by
  `togafContainment.ts` for the Phase 6 disclaimer.
- **`*.test-shape.ts` modules.** Negative-shape invariants ("what
  the system MUST NOT do") live in files suffixed
  `.test-shape.ts`. They export pure functions whose contract is
  the refusal itself, and run those functions at module load
  against live application introspection. Two such modules ship
  today:
  - `governance/togafContainmentInvariants.test-shape.ts` — closes
    the export module to exactly four PDF/DOCX entrypoints
    (`assertNoStructuredADCExport`), bans new portfolio fields
    matching forbidden constructs (`assertNoComputedADCFields`,
    with the Phase 5 baseline grandfathered), and bans
    override-style symbols on the Phase 6 surface
    (`assertNoOverrideMechanism`). Imported as a side effect from
    `App.tsx`.
  - `acw/acwIsolationInvariants.test-shape.ts` — uses Vite's
    `import.meta.glob` with `?raw` to read every ACW source file
    as a string at bundle time; throws if any ACW source imports
    from the Decision Canvas decision pipeline (denylist) or
    imports anything outside a positive allowlist. Imported as a
    side effect from both `App.tsx` and `WorkspaceShell.tsx`.
- End-to-end Playwright runs are used during feature development to
  validate the full wizard → portfolio → signals → reflection flow,
  and (for newer surfaces) the wizard → freeze → exposure → re-entry
  flow, the containment route, and the ACW workspace lens
  navigation.

---

## 15A. Build-Time Invariants

Architectural guarantees that must hold for the entire bundle's life
are expressed as side-effect imports that run at app startup. A
failure in any of them throws synchronously during module load and
fails the bundle. There is no runtime fallback, retry, or override.

| Invariant module | Imported from | Guarantee enforced |
| --- | --- | --- |
| `governance/staticTextGuard.ts` (per-tier `assertAll*` calls in each consuming module) | every page and deriver that renders static text | No forbidden token from any tier reaches the rendered DOM. |
| `governance/togafContainment.ts` (spec-equality + expected-throw on `MANDATORY_NON_AUTHORITY_DISCLAIMER`) | `governance/export.ts`, `pages/Containment.tsx` | The verbatim disclaimer wording is locked AND still contains the negated authority-vocabulary it must negate. |
| `governance/togafContainmentInvariants.test-shape.ts` (`assertNoStructuredADCExport`, `assertNoComputedADCFields`, `assertNoOverrideMechanism`) | `App.tsx` (side-effect import) | Phase 6 PH6-HC1 / PH6-HC2 / PH6-HC6: no structured export surface, no new computed/severity/score/lifecycle/trigger/event/metric/chart/ranking field on the portfolio entry, no override / bypass / force / escalate symbol on the Phase 6 surface. |
| `acw/acwIsolationInvariants.test-shape.ts` (denylist scan + positive allowlist over raw ACW sources via three Vite globs — `/src/acw/**/*.{ts,tsx}`, `/src/pages/acw/**/*.tsx`, `/src/components/acw/**/*.tsx` — loaded with `{ eager: true, query: '?raw', import: 'default' }`) | `App.tsx` and `pages/acw/WorkspaceShell.tsx` (side-effect imports) | The ACW workspace imports nothing from the Decision Canvas decision pipeline (`portfolioStore`, `signalsStore`, `adsBuilder`, `ecpBuilder`, `ecpSections`, `exposureDerive`, `exposureNarratives`, `responsibilityLens`, `scenarioReading`, `decisionReentry`, `export`, `hash`, `identity`, the architecture grammar package). |
| `acw/acwGrammarInvariants.test-shape.ts` (synchronous module-load assertions over the v1 grammar registry, validator, and store) | `App.tsx` and `pages/acw/WorkspaceShell.tsx` (side-effect imports) | ACW v1 grammar shape is locked: schema version is exactly `acw-1.0`; every element type carries a containment rule with at least one permitted parent; every explicit edge kind carries an edge rule with at least one permitted pair; the validator refuses unknown element types, root-only-violations, parent-type mismatches, edge-pair mismatches, and self-loop edges; one positive sanity case (Zone at the workspace root) passes. Drift in any of these surfaces fails the bundle synchronously. |
| `acw/acw3DStructureInvariants.test-shape.ts` (behavioural probe of the shared visibility enumerator + comment-stripped source-scan over both renderers) | `App.tsx` (side-effect import) | ACW v3 structural identity: 2D and 3D renderers consume the SAME `enumerateLensVisibility(nodes, edges, focusedParentId, collapsedIds)` helper, so neither can fabricate visibility the other does not surface. The source scan strips block and line comments before checking (the line-comment regex preserves `https://` style URLs by requiring the preceding character to be start-of-string or non-colon) so banner documentation that NAMES the helper or the forbidden read cannot satisfy — or trip — the gate. The scan then asserts both `InteractiveCanvas2D.tsx` and `Canvas3DStructural.tsx` import `acwLensStructure` AND contain the call-site syntax `enumerateLensVisibility(` (trailing paren required, so a re-export, type alias, or bare identifier is not enough); and that neither contains the call-site syntax `useAcwWorkspace(` (matching the call, not a mere mention). The behavioural probe walks a Zone → ComputeNode → System → Component fixture at every depth and asserts dangling-endpoint edges are dropped and collapse correctly hides children. |
| `acw/acw3DForbiddenSemantics.test-shape.ts` (case-insensitive substring scan, comment-stripped, against `Canvas3DStructural.tsx`) | `App.tsx` (side-effect import) | ACW v3 forbidden semantics: the 3D canvas source contains no animation primitive (`useFrame`, `useSpring`, `setInterval`, `requestAnimationFrame`, `easing`, `tween`, `keyframe`, `animate`), no judgement / weighting token (`priority`, `risk`, `severity`, `score`, `weight`, `urgency`, `importance`), no time token (`timeline`, `duration`, `elapsed`), and no traffic-light colour name (`warning`, `danger`). Comments are stripped before scanning so documentation that NAMES the forbidden tokens does not trip the assertion. |
| `governance/portfolioStore.ts` (`assertAllowedFields` at write, `isValidEntry` at read) | called from the freeze flow and on every portfolio read | The 17-field allow-list is the only shape that ever reaches storage; corrupted entries are silently dropped at read time. |
| `governance/signalsStore.ts` (`assertAllowedTopLevel`, `assertAllowedEvidenceInput`, `endsWithQuestionMark` validator, `isValidSignal`) | called from the signals create / advance flow and on every read | The 11-field top-level allow-list, the nested `evidenceSummary` / `relatedEntries` allow-lists, and the question-mark constraint on `interpretationGuidance` are enforced both at write and at read. |
| `ctad/ctadIsolationInvariants.test-shape.ts` (denylist + allowlist scan over raw CTAD sources via two Vite globs — `/src/ctad/**/*.{ts,tsx}` and `/src/pages/ctad/**/*.{ts,tsx}` — loaded with `{ eager: true, query: '?raw', import: 'default' }`; PLUS five hardened portfolioStore import-form scans; PLUS a module-load self-test that proves each forbidden form throws and the approved form passes) | `App.tsx` (side-effect import) | CTAD imports nothing from any decision-mutating module: the denylist forbids any import of `governance/adsBuilder`, `governance/ecpBuilder`, `governance/ecpSections`, `governance/exposureDerive`, `governance/exposureNarratives`, `governance/responsibilityLens`, `governance/scenarioReading`, `governance/decisionReentry`, `governance/signalsStore`, `governance/export`, `governance/hash`, `governance/identity`, `governance/togafContainment`, `governance/misusePlaybooks`, the architecture grammar package, and any module under `acw/`. The portfolio store is reachable only through a NAMED-IMPORT block restricted to the read-only allowlist `{ listEntries, type PortfolioEntry }`; namespace imports (`import * as`), default imports, mixed default+named imports, side-effect-only imports, and dynamic `import("...portfolioStore")` are all rejected outright with explicit error messages. The self-test exercises each forbidden shape against a synthetic source string at module load so a future loosening of the regex patterns is itself caught synchronously. |
| `ctad/ctadGrammarInvariants.test-shape.ts` (synchronous module-load assertions over the v1 CTAD registry, store schema, and an in-memory probe round-trip) | `App.tsx` (side-effect import) | CTAD v1 grammar shape is locked: schema version is exactly `ctad-1.0`; the registry contains exactly the four canonical sections in canonical order (`infrastructure`, `application`, `integration`, `crossCutting`); every section is non-empty; every parameter id is unique and matches camelCase shape; every parameter declares a non-empty options list; no parameter is marked `required` (CTAD is optional everywhere by construction). A live probe set/clear round-trip then asserts that clearing the only param of an otherwise-empty binding removes the binding from the persisted document — the empty-binding-leak path is closed at module load. |
| `governance/staticTextGuard.ts` (`assertAllCtadLanguage` invocations + spec-equality exemption for the brief-mandated empty-state sentence) | `ctad/ctadRegistry.ts` (registry assertion at module load), `pages/ctad/CtadEntry.tsx`, `pages/ctad/CtadShell.tsx` | Every CTAD-authored static label, hint, parameter name, parameter option, section title, button caption, references-panel item, and binding-panel field label is asserted against `CTAD_FORBIDDEN`. Exactly one literal sentence is exempt and is enforced by a frozen-constant equality check. |

These invariants are intentionally redundant with manual review: a
reviewer can always be persuaded; a thrown exception during
`vite build` cannot.

---

## 16. Decision Exposure View (`/exposure/:adsId`)

A read-only, derived view that surfaces — for one approved decision —
where the decision places institutional exposure. The view is
strictly observational: it does not assess, rank, recommend, or
require action. It reads exclusively from a single portfolio entry
and re-derives its content on every render.

### Files

- `artifacts/canvas-ui/src/governance/exposureCategories.ts` — the canonical 14-tag ECP constraint-category taxonomy and the freeze-time deriver
- `artifacts/canvas-ui/src/governance/exposureDerive.ts` — Phase 1 pure derivation of the four baseline sections
- `artifacts/canvas-ui/src/governance/exposureNarratives.ts` — Phase 2 pure derivation of the per-section narrative paragraphs
- `artifacts/canvas-ui/src/governance/responsibilityLens.ts` — Phase 3 pure derivation of the Cross-Functional Responsibility Lens
- `artifacts/canvas-ui/src/pages/Exposure.tsx` — the route component

### Phase 1 — Baseline exposure surfaces

Four neutral sections rendered in fixed order with equal visual
weight, no badges, no counts, no severity styling:

1. **Governance Domains** — Data Protection & Privacy, Auditability & Record Integrity, Identity & Access Oversight, Financial & Reporting Controls, Jurisdictional / Cross-Border Considerations.
2. **External Scrutiny Vectors** — External Audit Scrutiny Likely, Regulatory Inquiry Plausible, Third-Party Assurance Reliance Increases, Contractual / Partner Review Exposure.
3. **Impact Surfaces** — three side-by-side sub-groups (Institutional, Product, Infrastructure) with no ordering cue.
4. **Organisational Functions Affected** — alphabetical only.

Two new frozen-at-freeze fields on each portfolio entry —
`inScopeCapabilityIds` and `ecpConstraintCategories` — drive the
derivation. They are written once at freeze and read-only thereafter;
they never feed back into the grammar engine. Pre-existing entries
without these fields continue to load and are normalised to empty
arrays.

A permanent banner at the top of the page reads, verbatim: *"This view
shows where an approved decision places institutional exposure. It
does not assess, rank, recommend, or require action."* The banner is
checked by spec-equality, not by the substring guard, because it
intentionally negates the forbidden vocabulary. Every other static
label on the page passes the strictest reflective-language guard at
module load.

Several rules in `exposureDerive.ts` are kept structurally but stay
dormant because the current `OrganisationContext` and ECP do not
expose the signals they key on (multi-jurisdictional context,
regulated reporting environment, Regulated Enterprise organisation
type, inter-agency partner usage, residency tag). They will fire
automatically when those signals are introduced upstream — no
heuristic proxy is invented in the meantime.

### Phase 2 — Exposure Narratives

Each Phase 1 section renders a single collapsed disclosure beneath
its list, labelled *"Why this exposure exists"* (closed by default).
The disclosure expands to a single short paragraph following a strict
four-clause grammar in fixed order:

1. **Context Clause** — *"Because this decision involves …"* (organisation type, sensitivity level, system intent, expected lifespan, in-scope capabilities).
2. **Structural Cause Clause** — *"and because …"* (ECP constraint categories, the architectural layers present).
3. **Exposure Surface Clause** — *"this places sustained pressure on …"* (the items the same section's Phase 1 list contains).
4. **Framing Boundary Clause** — verbatim, mandatory in every paragraph: *"This reflects structural exposure inherent to the approved decision, not a judgement or requirement."*

Narratives are visually subordinate to the Phase 1 list above them
(smaller font, muted colour, single paragraph, no bold, no bullets,
no icons). They are non-interactive: not clickable, linkable,
searchable, or exportable; they navigate nowhere. The disclosure
toggle is the only new focusable element introduced.

#### Placement rule

Narratives render strictly inside an existing Phase 1 section, never
as a new panel, never above the section's list, and never adjacent to
multiple sections at once. One section, one disclosure, one paragraph.

#### Empty states

Two distinct empty-state sentences are emitted deterministically (no
CTA, no link):

- **PH2-EMPTY-A** — *"Exposure explanations are not yet available for this decision. This view describes exposure surfaces without additional interpretation."* — emitted per section when that section's Phase 1 list is empty but the decision still has the structural inputs (in-scope capabilities and / or ECP constraint categories) a four-clause narrative needs.
- **PH2-EMPTY-B** — *"Exposure explanations are intentionally omitted for this decision."* — emitted for **all four sections** when the decision lacks both `inScopeCapabilityIds` and `ecpConstraintCategories`. With nothing to draw the Context and Structural Cause clauses from, the omission is decision-wide and intentional rather than per-section absence.

Phase 2 never reactivates a Phase 1 dormant clause and never invents
exposure surfaces beyond what its section's Phase 1 list already
contains.

#### Vocabulary tier

`EXPOSURE_NARRATIVE_FORBIDDEN` (declared in `staticTextGuard.ts`) is
a strict superset of `SIGNALS_FORBIDDEN` and a sibling of
`REFLECTIVE_FORBIDDEN`. The narrative composer routes every produced
paragraph through the guard before returning. The Framing Boundary
Clause is also checked by spec-equality so silent paraphrasing is
caught at module load.

#### No persistence, no aggregation

Narratives are regenerated on every render. There is no new storage
key, no cache, no network call. The module accepts one decision and
returns one set of narratives; it never accepts a list of decisions
and never compares decisions.

### Phase 3 — Cross-Functional Responsibility Lens

A single additional card rendered beneath the Phase 1/2 grid, headed
*"Cross-Functional Responsibility Lens"*. The lens lists, for one
approved decision, the cross-functional areas where structural
responsibility pressure resides as a result of the decision.

Each row is a function name (one of: Customer Support, Data
Governance, Legal / Compliance, Platform / Infrastructure, Procurement
/ Vendor Management, Security Operations) followed by an alphabetical
list of noun-phrase pressure types attached to that function (e.g.
*"access monitoring obligation"*, *"recovery preparedness expectation"*).
Functions and pressure types are drawn from a fixed lookup table —
never templated at runtime — and are sorted alphabetically at both
levels. The lens makes no statement about precedence and assigns no
ownership.

The card opens with a fixed prefix sentence: *"This section describes
where responsibility pressure resides as a result of the decision. It
does not assign ownership or require action."* The prefix is checked
by spec-equality at module load (the substring guard would otherwise
flag the negated word "ownership" because it contains "owner"),
mirroring the Phase 1 banner / Phase 2 framing-boundary exemption
pattern.

#### Derivation inputs

`responsibilityLens.ts` reads only the entry's `organisationContext`,
`layersPresent`, `inScopeCapabilityIds`, `ecpConstraintCategories`,
and the Phase 1 `ExposurePayload`. Phase 2 narratives are not parsed.
Each pressure-type rule is a predicate over those inputs; a function
appears in the lens iff at least one of its rules fires.

#### Empty state

When no rule fires the lens renders a single neutral sentence:
*"No cross-functional responsibility pressure is identified for this
decision."* No CTA, no link, no fallback content.

#### Strictly additive (PH3-HC7)

Phase 3 is rendered as its own card beneath the existing four Phase 1
sections. Nothing in those sections — labels, ordering, disclosure
behaviour, empty-state sentences — is replaced or rearranged. The
lens itself is directly visible (no Phase 2-style disclosure toggle)
because it is a structural enumeration rather than an explanatory
paragraph.

#### Vocabulary tier

`RESPONSIBILITY_LENS_FORBIDDEN` (declared in `staticTextGuard.ts`)
is a strict superset of `SIGNALS_FORBIDDEN` and a sibling of
`REFLECTIVE_FORBIDDEN` and `EXPOSURE_NARRATIVE_FORBIDDEN`. It bans
ownership-assignment, obligation, severity, priority, and remediation
framing (`owner`, `responsible`, `accountable`, `ensure`, `must`,
`required`, `primary`, `secondary`, `lead`, `escalation`, `address`,
`high`, `low`, `critical`, `significant`, `major`, `minor`, `urgent`).
Every function name and pressure-type literal is asserted against this
guard at module load.

#### No persistence, no aggregation

The lens is regenerated on every render. There is no new storage key,
no cache, no network call. The module accepts one decision plus its
Phase 1 payload and returns one alphabetically-sorted list of
{functionName, pressureTypes} rows.

#### Strictly additive

Removing `exposureNarratives.ts` and the `NarrativeDisclosure` block
in `pages/Exposure.tsx` restores exact Phase 1 behaviour without any
other change.

### Phase 4 — Scenario-Conditioned Reading

A single additional card rendered beneath the Phase 3 lens, headed
*"Scenario-Conditioned Reading"*. The card contains a short helper
sentence and a single-select radio group letting a reader switch
between five reading lenses:

1. **Baseline (Approved Context)** — the default; renders Phase 1/2/3 unchanged.
2. **Limited-Scale Use** — narrow deployment, restricted audience.
3. **Organisation-Wide Use** — broad internal adoption.
4. **External Partner Exposure** — use beyond the organisational boundary.
5. **Extended Lifespan** — use significantly longer than initially planned.

Switching lenses does not change the underlying exposure; it changes
how the same exposure reads. Under a non-baseline lens, a fixed table
of (lens × element → qualifier) rules attaches a contextual qualifier
phrase — drawn from a closed list (*"persists"*, *"broadens"*,
*"concentrates"*, *"becomes more continuous"*, *"remains episodic"*,
*"becomes more distributed"*) — to existing Phase 1 list items, Phase
2 narrative paragraphs, and Phase 3 pressure-type entries that are
actually present for the current decision. Qualifiers render inline
as *" → &lt;phrase&gt;"* in muted colour with no badge, no icon, no new
focusable element, and never replace or visually outrank the
underlying label.

#### Derivation inputs

`scenarioReading.ts` reads only the `PortfolioEntry`, the Phase 1
`ExposurePayload`, and the selected lens. Phase 2 narratives and the
Phase 3 lens are not parsed; the deriver instead checks the same
upstream payload conditions Phase 3 uses, so a qualifier never lands
on a Phase 3 row that did not render or on a Phase 2 empty-state
sentence.

#### Empty state

When a non-baseline lens fires no qualifiers for the current decision,
the section renders one neutral sentence: *"This scenario does not
change how the existing exposure reads."* Baseline never shows the
empty-state sentence (it returns an empty annotations object by
design).

#### Vocabulary tier

`SCENARIO_READING_FORBIDDEN` (declared in `staticTextGuard.ts`) is
the strictest tier in the system: a strict superset of all three
sibling upper tiers (`RESPONSIBILITY_LENS_FORBIDDEN`,
`EXPOSURE_NARRATIVE_FORBIDDEN`, `REFLECTIVE_FORBIDDEN`) plus the
Phase 4-specific bans (`predict`, `forecast`, `probability`,
`likelihood`, `worst`, `best`, `severe`, `escalate`, `urgent`).
Every qualifier phrase, lens label, helper sentence, selector label,
and empty-state sentence is asserted against this guard at module
load and re-asserted at the emission boundary inside the deriver.

#### No persistence, no aggregation

The selected lens is component-local React state. Switching lenses
recomputes the annotations object purely from inputs; there is no new
storage key, no cache, no network call, and the lens is never written
back to the portfolio entry.

#### Strictly additive (PH4-HC7)

Phase 4 is rendered as its own card beneath the Phase 3 lens. The
qualifier props threaded through `ListSection`, `ImpactSubgroup`,
`NarrativeDisclosure`, and `ResponsibilityLensSection` are optional
and default to undefined; under the default Baseline lens every
existing render path takes its existing branch. Removing
`scenarioReading.ts`, the `ScenarioReadingSection` component, and the
optional qualifier props at each call site restores exact Phase 3
behaviour without any other change.

### Phase 5 — Decision Re-Entry Lens

A single additional card rendered beneath the Phase 4 scenario-reading
section, headed *"Legitimate Re-Entry"*. The lens signals — for one
approved decision — when reconsideration of the decision becomes
*procedurally* legitimate. It says nothing about correctness, urgency,
quality, or what (if anything) the reader ought to do.

The card opens with a fixed prefix sentence: *"This section indicates
when reconsideration of a decision may be procedurally legitimate. It
does not recommend or initiate change."* The prefix intentionally
contains the bare words "change" and "recommend" inside a negating
phrase, so it is verified by spec-equality at module load and exempt
from the substring guard (mirroring the Phase 1 banner / Phase 2
framing-boundary / Phase 3 prefix exemption pattern).

Beneath the prefix, the card renders either an alphabetically-stable
list of present-indicative signal sentences drawn from a closed set,
or — when no condition fires — the empty-state sentence: *"No
procedural conditions for reconsideration are currently evident."*

#### Closed signal set (PH5-HC4)

Four sentences, drawn verbatim, emitted in fixed render order. The
two lifespan sentences are mutually exclusive (the more inclusive
subsumes the less inclusive); the responsibility-shift and
scope-breadth signals fire independently:

1. *"The elapsed time since approval has reached the decision's originally expected lifespan."*
2. *"The elapsed time since approval has crossed the midpoint of the decision's originally expected lifespan."*
3. *"Responsibility pressure now appears in organisational functions that were not part of the approval-time profile."*
4. *"Currently-derived exposure spans organisational functions beyond the approval-time profile."*

Sentences are never templated at runtime.

#### Derivation inputs (PH5-HC2 / PH5-HC3)

`decisionReentry.ts` accepts exactly one `PortfolioEntry`, the live
Phase 1 `ExposurePayload`, the live Phase 2 `ExposureNarratives`, the
live Phase 3 `ResponsibilityLens`, and one `now: Date`. The deriver
does NOT consume the Phase 4 scenario lens state, runtime metrics,
viewing telemetry, incident data, or external feeds.

- The lifespan rules read `entry.decisionDate` and
  `entry.organisationContext.expectedLifespanYears`.
- The responsibility-pressure-shift rule compares the live
  responsibility-lens function set against
  `entry.approvalDominantFunctions` (the approval-time snapshot).
- The exposure-scope-breadth rule compares the live
  `payload.functionsAffected` against
  `entry.approvalFunctionsAffected` (the approval-time snapshot).

The `narratives` parameter is part of the contract for future rules
but unused by any rule today (Phase 2 narratives are assembled from
the same frozen inputs as the entry, so they cannot diverge from the
payload on their own).

The "now" Date is captured once on mount in `pages/Exposure.tsx`
(`useState(() => new Date())`). The deriver itself stays pure: same
inputs always yield the same signal set.

#### Approval-time markers

Two new fields were added to the portfolio entry allow-list in
service of the Phase 5 deriver. Both are written ONCE at freeze (in
`entryFromADS`), are read-only thereafter, and never feed back into
the grammar engine:

- `approvalFunctionsAffected: string[]` — alphabetical snapshot of
  `payload.functionsAffected` taken at freeze.
- `approvalDominantFunctions: string[]` — alphabetical snapshot of
  the responsibility-lens function set taken at freeze.

The portfolio entry now carries 17 allow-listed top-level fields.
Pre-existing entries written before Phase 5 are accepted at read
time and normalised to empty arrays for the two new fields. The
responsibility-shift and scope-breadth rules suppress themselves
when the corresponding snapshot is empty so that legacy decisions
are not retroactively flagged.

#### Latent rules (no remaining dormant rules)

Every condition family from the Phase 5 spec is now implemented:
lifespan-vs-approval-window (rules 1–2),
responsibility-pressure-shift (rule 3), and
exposure-scope-breadth (rule 4). Rules 3 and 4 are *latent* for
brand-new decisions — they fire only when the live derivers diverge
from the approval-time snapshot, which can happen after a future
derivation upgrade or after upstream-context evolution introduces
new functions. They are NOT dormant in the Phase 1 sense (no
documented condition is left unimplemented).

#### Empty state

When no condition fires the section renders one neutral sentence:
*"No procedural conditions for reconsideration are currently evident."*
No CTA, no link, no fallback content. The section never disappears;
the empty-state sentence is itself the legitimate observation that
no procedural condition is present.

#### Vocabulary tier

`DECISION_REENTRY_FORBIDDEN` (declared in `staticTextGuard.ts`) is
now the strictest tier in the system: a strict superset of
`SCENARIO_READING_FORBIDDEN` (which is itself a strict superset of
every preceding tier) plus the Phase 5-specific bans (`fix`, `change`,
`update`, `revise`, `rework`, `should`, `must`, `need`, `urgent`,
`critical`, `failed`, `overdue`). The closed signal sentences, the
section heading, and the empty-state sentence are asserted against
this tier at module load AND re-asserted at the emission boundary
inside the deriver. The interpretive prefix is exempted as documented
above.

#### No persistence, no aggregation, human-initiated (PH5-HC1 / PH5-HC7)

The lens persists nothing, caches nothing, and makes no network call.
The card itself is non-interactive — no buttons, no links, no
affordances of any kind. Phase 5 produces no automatic transitions
and never calls into the freeze flow, the wizard, or the signals
store. Whether to act on a signal is a procedural decision left
entirely to the reader.

#### Strictly additive (PH5-HC6)

Phase 5 is rendered as its own card beneath the Phase 4 section.
Removing `decisionReentry.ts`, the `DecisionReentrySection`
component, the `reEntrySignals` `useMemo`, the captured `reEntryNow`
state, and the `assertAllDecisionReentryLanguage` import in
`pages/Exposure.tsx` restores exact Phase 4 behaviour without any
other change.

---

## 17. Phase 6 — TOGAF / ArchiMate Constitutional Layer

A read-only constitutional / guardrail layer that records the
position of Architecture Decision Canvas (ADC) artefacts in relation
to TOGAF artefacts, ArchiMate models, EA tooling, and delivery
pipelines. Phase 6 adds **no** new decision logic, derivation,
portfolio fields, computed signals, or exports. It only documents
and asserts what ADC artefacts must NOT be read as doing.

### Hard constraints (PH6-HC1..PH6-HC7)

These are quoted verbatim from the brief. Each is enforced by one
or more concrete modules / assertions listed at the end of this
section.

- **PH6-HC1 — Non-authority.** No code path may allow ADC content to
  recommend an action, mandate change, justify funding/sequencing,
  trigger a workflow, or rank/score options. Any such surface is a
  Phase 6 violation.
- **PH6-HC2 — Reference-only serialisation.** ADC data may leave the
  application only as: (a) the existing PDF/DOCX text artefacts, or
  (b) the `ADC_REF: <adsId> · <date>` short-form token. No structured
  export surface may be introduced.
- **PH6-HC3 — Mandatory disclaimer.** Every external-facing surface
  carrying ADC content must render the verbatim
  `MANDATORY_NON_AUTHORITY_DISCLAIMER`. Asserted at module load and
  at emission boundary.
- **PH6-HC4 — Strictest vocabulary tier.** `TOGAF_CONTAINMENT_FORBIDDEN`
  is a strict superset of `SCENARIO_READING_FORBIDDEN`. Every Phase 6
  sentence is registered and asserted at module load.
- **PH6-HC5 — Advisory only.** Misuse detection is advisory: it may
  *suggest* re-anchoring language, never block, never escalate, never
  invalidate input, never persist a violation record.
- **PH6-HC6 — No override.** No constant, function, or flag in Phase 6
  may permit bypassing PH6-HC1..PH6-HC5. The
  `assertNoOverrideMechanism` invariant enforces this at build time.
- **PH6-HC7 — Strictly removable.** Deleting `togafContainment.ts`,
  `misusePlaybooks.ts`, `togafContainmentInvariants.test-shape.ts`,
  the Containment page, the Wizard advisory affordance, and the
  disclaimer lines from `export.ts` must restore Phase 5 behaviour
  with no other code change required.

### Mandatory disclaimer (verbatim)

> *This material references Architecture Decision Canvas artefacts
> for contextual understanding only. It does not mandate action,
> justify change, or substitute for human judgment.*

This is the only Phase 6 surface string that contains the bare
words `mandate` and `justify`. Two complementary checks at module
load lock it (PH6-HC3 + PH6-HC4):

1. **Spec-equality.** The exported constant is compared to a literal
   `SPEC_DISCLAIMER` copy of the brief wording.
2. **Expected-throw substring scan.** The disclaimer is run through
   `assertTogafContainmentLanguage`; the scan MUST throw, and that
   throw is the proof the negated authority-vocabulary is still
   present. If a future edit removes the bare words, the scan stops
   throwing and a constitutional drift error is raised.

Together these are strictly stronger than a passing substring scan
would be.

### TOGAF artefact docking table

| Artefact | Docking class |
| --- | --- |
| Architecture Vision | `REFERENCE_ONLY` |
| Architecture Definition Document | `REFERENCE_ONLY` |
| Architecture Contract | `REFERENCE_ONLY` |
| Business Architecture Catalogs | `INTERPRETIVE_ATTACHMENT` |
| Application Architecture Catalogs | `INTERPRETIVE_ATTACHMENT` |
| Data Architecture Catalogs | `INTERPRETIVE_ATTACHMENT` |
| Technology Architecture Catalogs | `INTERPRETIVE_ATTACHMENT` |
| Requirements Specification | `FORBIDDEN` |
| Architecture Roadmap | `FORBIDDEN` |
| Implementation Governance Plan | `FORBIDDEN` |
| Statement of Architecture Work | `FORBIDDEN` |
| Migration Plan | `FORBIDDEN` |
| Architecture Change Management Plan | `FORBIDDEN` |
| *(any artefact not listed above)* | `FORBIDDEN` (default-deny) |

`REFERENCE_ONLY` payloads may carry only `adsId` and `decisionDate`.
`INTERPRETIVE_ATTACHMENT` payloads may additionally carry
`narrativeParagraphs: string[]` and the verbatim disclaimer.
`assertReferenceOnly` and `assertInterpretiveAttachment` throw on
any field exceeding these shapes.

### Misuse intents and correction sentences

| Intent | Re-anchoring sentence |
| --- | --- |
| `MANDATING` | This artefact records institutional context; it does not direct what people are obliged to do. |
| `JUSTIFYING` | This artefact does not provide the basis for funding decisions or delivery ordering. |
| `EVALUATING` | This artefact does not assess, compare, or judge options. |
| `TRIGGERING` | This artefact does not initiate processes or set off downstream activity. |
| `NORMALISING` | This artefact does not establish baselines or institutional defaults to be matched. |

`detectMisuseIntent(text)` returns the first matching intent or
`null`. The Containment page renders the same five sentences in a
static table plus a try-phrase input that surfaces the matched
correction live. The wizard's `FreezeMetadataForm` reuses the same
detector against its two free-text inputs and renders the same
correction below the form when an intent is matched.

### Non-goals (explicit)

- No analytics, dashboards, charts, lifecycle states, or metrics on
  ADC data.
- No structured (JSON / CSV / XML / GraphQL / schema / YAML / TOML
  / OpenAPI) export of ADC data.
- No integration with a real TOGAF or ArchiMate tool — Phase 6 only
  codifies how ADC behaves *if* such a tool consumes it.
- No blocking / escalation / approval-workflow primitives in misuse
  detection.
- No server-side enforcement, organisational policy storage, or
  remote validation. All checks are pure, local, module-load
  assertions.
- No change to the grammar engine, deriver outputs, portfolio entry
  semantics, or signals store.
- No override mechanism of any kind.

### Acceptance criteria → enforcement mapping

The five acceptance criteria from the brief each map to one or more
Phase 6 modules:

| Acceptance criterion | Enforced by |
| --- | --- |
| ADC cannot mandate action. | `MANDATING` re-anchoring sentence in `misusePlaybooks.ts`; `MANDATORY_NON_AUTHORITY_DISCLAIMER` (PH6-HC3); `TOGAF_CONTAINMENT_FORBIDDEN` substring guard banning `mandate` / `enforce`; `assertNoOverrideMechanism` banning `mandate`-named symbols. |
| ADC cannot rank or score anything. | `TOGAF_CONTAINMENT_FORBIDDEN` substring guard banning `score` / `rank` / `prioritise` / `evaluate`; `assertNoComputedADCFields` banning new portfolio fields whose names contain `score` / `severity` / `metric` / `ranking` (Phase 5 baseline grandfathered). |
| ADC cannot trigger workflows. | `TRIGGERING` re-anchoring sentence in `misusePlaybooks.ts`; `TOGAF_CONTAINMENT_FORBIDDEN` substring guard banning `trigger` / `sequence`; `assertNoComputedADCFields` banning new fields whose names contain `trigger` / `event`. |
| ADC cannot justify funding or sequencing. | `JUSTIFYING` re-anchoring sentence in `misusePlaybooks.ts`; `TOGAF_CONTAINMENT_FORBIDDEN` substring guard banning `justify` / `sequence`; docking table marking Architecture Roadmap / Implementation Governance Plan / Statement of Architecture Work as `FORBIDDEN`. |
| ADC remains readable, revisitable, and non-executable. | `formatADCReference` plus `assertReferenceOnly` / `assertInterpretiveAttachment` (PH6-HC2); `assertNoStructuredADCExport` (PH6-HC2) closing the export module to exactly four PDF/DOCX entrypoints; PH6-HC7 removability guarantee. |

### Files

- `artifacts/canvas-ui/src/governance/togafContainment.ts` — the
  verbatim mandatory non-authority disclaimer (spec-equality +
  expected-throw substring scan), the docking table, the
  `formatADCReference` short-form formatter, and the
  `assertReferenceOnly` / `assertInterpretiveAttachment` validators.
- `artifacts/canvas-ui/src/governance/misusePlaybooks.ts` — the five
  misuse intents, their detection keyword sets, and the one
  re-anchoring sentence each. Every correction sentence is asserted
  against `TOGAF_CONTAINMENT_FORBIDDEN` at module load.
- `artifacts/canvas-ui/src/governance/togafContainmentInvariants.test-shape.ts`
  — module-load negative assertions
  (`assertNoStructuredADCExport(exportFns)`,
  `assertNoComputedADCFields(entryShape)`,
  `assertNoOverrideMechanism()`) imported as a side effect from
  `App.tsx`. Closes the export module surface to exactly the four
  PDF/DOCX entrypoints (`exportADSPdf`, `exportADSDocx`,
  `exportECPPdf`, `exportECPDocx`); the internal
  `sanitiseFilenameSegment` helper is module-private.
- `artifacts/canvas-ui/src/governance/portfolioFields.ts` — extracted
  `ALLOWED_FIELDS` constants module so the invariants do not
  transitively import Phase 1–5 derivation modules at startup.
- `artifacts/canvas-ui/src/governance/staticTextGuard.ts` — adds
  `TOGAF_CONTAINMENT_FORBIDDEN` (strict superset of
  `SCENARIO_READING_FORBIDDEN`, sibling of
  `DECISION_REENTRY_FORBIDDEN`) plus the
  `assertTogafContainmentLanguage` helper pair.
- `artifacts/canvas-ui/src/pages/Containment.tsx` — read-only route
  `/governance/containment` rendering the disclaimer, docking table,
  misuse playbook table, try-phrase advisory input, and ArchiMate
  containment statement. Every static label asserted at module load.
- `artifacts/canvas-ui/src/components/wizard/FreezeMetadataForm.tsx`
  — advisory-only misuse hint on project name / authority inputs;
  never blocks submission, never persists.
- `artifacts/canvas-ui/src/governance/export.ts` — injects the
  verbatim disclaimer once on PDF first page (italic + muted grey
  matching the integrity footer register) and once as the paragraph
  after the project line in DOCX.

---

## 18. ACW Workspace Builder (Architecture Composition Workspace)

A separate, structurally-only workspace shell for assembling and
viewing architecture *structure*. The ACW is **a sibling lens**, not
a successor of the Decision Canvas. It is empty by default and ships
no architecture content, no recommendations, no derivation logic.

### Non-goals (intentional, documentary)

- The ACW does **not** generate, recommend, score, rank, or evaluate
  architecture. It does not consult the grammar engine. It does not
  read the portfolio, signals, or freeze pipeline.
- The ACW does **not** introduce new persistence. No new
  `localStorage` key, no cache, no network call.
- The ACW does **not** influence Phase 6 constitutional containment.
  It does not export, serialise, or attach ADC content. The ACW
  surface carries no ADC narrative and would not require the
  mandatory non-authority disclaimer because there is nothing to
  reference.

### Files

- `artifacts/canvas-ui/src/pages/acw/WorkspaceShell.tsx` — workspace
  shell + lens-style sub-navigation across the five lenses.
- `artifacts/canvas-ui/src/pages/acw/views/ContextDomain.tsx` —
  Context & Domain lens (TOGAF Business, structural only).
- `artifacts/canvas-ui/src/pages/acw/views/SystemLandscape.tsx` —
  System Landscape lens (TOGAF Application; embeds 2D canvas).
- `artifacts/canvas-ui/src/pages/acw/views/Integration.tsx` —
  Integration lens (Application + Data; empty interfaces and
  data-exchange placeholders).
- `artifacts/canvas-ui/src/pages/acw/views/Deployment.tsx` —
  Deployment & Infrastructure lens (TOGAF Technology; embeds 3D
  canvas; empty zones).
- `artifacts/canvas-ui/src/pages/acw/views/OperationsContinuity.tsx`
  — Operations & Continuity lens (cross-layer, descriptive only).
- `artifacts/canvas-ui/src/components/acw/Canvas2D.tsx` — reusable
  2D canvas primitive with pan / zoom; renders empty by default.
- `artifacts/canvas-ui/src/components/acw/Canvas3D.tsx` — reusable
  3D canvas primitive (React Three Fiber); inert by default; falls
  back to a neutral hint when WebGL is unavailable.
- `artifacts/canvas-ui/src/acw/acwGrammarHooks.ts` — empty
  extension-point stubs for canonical-structure schema, forbidden-
  element checks, and Phase 6 authority hook. No logic today.
- `artifacts/canvas-ui/src/acw/acwIsolationInvariants.test-shape.ts`
  — build-time decoupling invariant. Loads every ACW source as a
  raw string via `import.meta.glob` and fails the bundle if any
  ACW file imports from the Decision Canvas decision pipeline.

### Five lenses (TOGAF-aligned, lens-only — no sequence)

| Lens | TOGAF layer | Primary surface |
| --- | --- | --- |
| Context & Domain | Business (structural) | Empty Business Domain panels |
| System Landscape | Application | 2D canvas (pan / zoom) |
| Integration | Application + Data | Empty Interface and Data Exchange placeholders |
| Deployment & Infrastructure | Technology | 3D canvas + empty Zone / Compute / Network / Storage slots |
| Operations & Continuity | Cross-layer (descriptive) | Empty Redundancy containers + plain-text annotations |

The sub-navigation has no progress indicator, no next / previous, no
maturity or completion language. The same workspace is observed
through five different lenses; switching does nothing structural.

### Vocabulary tier

`ACW_PLACEHOLDER_FORBIDDEN` (declared in `staticTextGuard.ts`) is a
strict superset of `TOGAF_CONTAINMENT_FORBIDDEN`. Per the brief it
explicitly restates `optimise`, `optimize`, `recommend`,
`recommended`, `target`, `best` (each already present transitively
via the REFLECTIVE / SCENARIO_READING chain or PORTFOLIO tier). The
restatement makes the brief's ban literal at the source level. Every
static label rendered by an ACW view, container, or canvas primitive
is asserted against this tier at module load. The ACW vocabulary
forbids generative / prescriptive language outright; the surface
uses only generic structural nouns (`Domain`, `System`, `Connection`,
`Zone`, `Interface`) and neutral instructional empty-state copy.

### Build-time decoupling invariant

`acwIsolationInvariants.test-shape.ts` is imported as a side effect
from both `App.tsx` and `WorkspaceShell.tsx`. It uses Vite's
`import.meta.glob` with `?raw` to read every ACW source file as a
string at bundle time and scans `from "..."` / `import "..."`
specifiers for forbidden module paths (`portfolioStore`,
`signalsStore`, `adsBuilder`, `ecpBuilder`, `exposureDerive`,
`exposureNarratives`, `responsibilityLens`, `scenarioReading`,
`decisionReentry`, `export`, `hash`, `identity`, the architecture
grammar package). Any match throws at module load and fails the
bundle.

### Non-influence guarantee on Phase 6

Phase 6 is unchanged. No Phase 6 source file (`togafContainment.ts`,
`misusePlaybooks.ts`, `togafContainmentInvariants.test-shape.ts`,
`pages/Containment.tsx`, the export disclaimer injection, the wizard
advisory hint) references the ACW. The ACW does not produce ADC
content, does not export anything, and does not surface the
mandatory non-authority disclaimer (PH6-HC3 requires the disclaimer
on surfaces *carrying ADC content*; the ACW carries none). The
strictly-removable guarantee for Phase 6 (PH6-HC7) is preserved: the
ACW directory tree can be deleted independently and Phase 6 is
unaffected; conversely deleting Phase 6 leaves the ACW unaffected.

### Strictly removable

Removing `src/acw/`, `src/components/acw/`, `src/pages/acw/`, the
ACW route definitions in `App.tsx`, the three ACW side-effect imports
in `App.tsx` (`acwGrammarHooks`, `acwIsolationInvariants`,
`acwGrammarInvariants`), the `Workspace` link in
`GlobalNav`, and the `ACW_PLACEHOLDER_FORBIDDEN` block in
`staticTextGuard.ts` restores the pre-ACW behaviour with no other
change required. The `acw.workspace.v1` `localStorage` key (added by
the v1 grammar diagram, see below) becomes orphan data and is never
read again; the platform never produced a writer outside `acwStore`.

## 18A. ACW v1 — Grammar Diagram

The v1 layer of the Progressive Diagram Builder turns the ACW
workspace from an empty shell into an authored, but still purely
*structural*, diagram. It introduces a canonical element registry, a
pure validator, a schema-locked persistent store, and a shared
authoring panel. The grammar layer is additive: every guarantee from
Section 18 (no recommendation, no derivation, no scoring, no Phase 6
influence, no decision-pipeline coupling) continues to hold. A v1
node has no semantics — it is just a typed placeholder with a label
and a parent.

### Canonical registry — `acw/acwGrammar.ts`

A frozen registry of element types, edge kinds, containment rules,
and edge rules. Element types are exactly the v3 zoom-through chain
the master prompt names: `Zone`, `ComputeNode`, `System`, `Component`
(the surface label for `ComputeNode` is `Compute node`). The four
authorable edge kinds (`ACW_EXPLICIT_EDGE_KINDS`) are `CONTAINS`,
`CONNECTS`, `INTERFACES_WITH`, `DATA_FLOW`. `CONTAINS` is
representable in two redundant ways: as the child's `parentId` (set
at node-creation time) and / or as an explicit `CONTAINS` edge
record between the two existing nodes. The `DATA_FLOW` kind renders
to the surface as `Data exchange` because the literal word `flow`
embeds `low`, which is forbidden by `ACW_PLACEHOLDER_FORBIDDEN`.
Containment is the v3 chain: Zone → ComputeNode → System →
Component, with `System` also permitted at the workspace root for
the lightweight case; the `CONTAINS` edge rule mirrors that chain
exactly.

Rules are direction-agnostic for edges (a permitted unordered pair
satisfies the rule whichever way the user adds it), but containment
is single-parent: a node has exactly one `parentId`, possibly the
workspace root. The registry is the single source of truth; the
validator and the store both consult it.

### Pure validator — `acw/acwValidator.ts`

`validateNode` and `validateEdge` are pure functions that return
`{ ok: true } | { ok: false, refusalCode, message }`. Refusal codes
are restricted, structural, and deterministic:

- `UNKNOWN_TYPE` — element type is not in the registry.
- `ROOT_ONLY` — the type cannot live at the workspace root.
- `PARENT_NOT_PERMITTED` — the parent's type is not on the
  containment allow-list for the child's type.
- `UNKNOWN_EDGE_KIND` — edge kind is not in the registry.
- `EDGE_ENDPOINT_MISSING` — `fromId` or `toId` does not resolve.
- `EDGE_PAIR_NOT_PERMITTED` — the (fromType, toType) pair is not on
  the edge rule's allow-list, in either direction.
- `EDGE_SELF_LOOP` — `fromId === toId`.

The validator is consulted twice on every authoring action: once by
`AuthoringPanel` to render an in-place refusal banner
(`data-testid="acw-refusal-banner"`), and once again by `acwStore` at
mutation time. The store is the constitutional gate: if validation
fails inside the store, the mutation throws and the workspace is
not modified.

### Schema-locked persistent store — `acw/acwStore.ts`

Backed by `localStorage` under the key `acw.workspace.v1`. The
document shape is locked at the top level
(`{ schemaVersion: "acw-1.0", structureGraph: { nodes, edges } }`)
and at every nested level (node fields = `{ id, type, parentId,
label, x, y }`; edge fields = `{ id, kind, fromId, toId }`). Writes
go through `assertAllowedFields`; reads go through `isValidWorkspace`
(both exposed via the test-only `__acwStoreInternals` namespace) and
silently drop corrupted documents back to an empty workspace, mirroring
`portfolioStore` and `signalsStore`.

The store exposes a tiny subscribe API (`subscribe(listener)`,
`getWorkspace()`) and validator-gated mutations (`createNode`,
`createEdge`). v1 is intentionally append-only: there are no
remove / clear operations on the store yet. React surfaces consume
the store through `acw/acwGrammarHooks.ts#useAcwWorkspace`, which
keeps the hooks file as the only React-aware shim and the store
itself UI-free.

### Authoring panel — `components/acw/AuthoringPanel.tsx`

A single shared panel embedded once at the top of `WorkspaceShell`.
It renders two forms — *Add element* and *Add relationship* — both
derived from the registry (no element type or edge kind is
hard-coded in the UI). On submission it asks the validator first;
on failure it surfaces the refusal in the
`acw-refusal-banner` and leaves the workspace untouched. The shell's
five lenses share this one authoring source — there is no per-lens
authoring forking.

### Live structure renderer — `components/acw/LiveStructurePanel.tsx`

Each lens view embeds `LiveStructurePanel` with a TOGAF-aligned
filter over the v3 element types (e.g. Technology lens →
`Zone` + `ComputeNode`; Application lens → `System` + `Component`;
cross-layer → all). The filter is *display only* — the underlying
structure graph is the same for every lens.
The System Landscape lens additionally renders the live nodes / edges
on the 2D canvas (with depth-path filtering so a drilled-down view
shows only the descendants of the focused node).

### Build-time invariants — `acw/acwGrammarInvariants.test-shape.ts`

Invariants asserted synchronously at module load (see Section 15A):
registry shape (`ACW_REGISTRY` frozen, top-level collections
non-empty, every type referenced by a containment or edge rule is a
member of `ACW_ELEMENT_TYPES`); schema-version lock (`acw-1.0`);
containment coverage (every element type has at least one permitted
parent); edge-rule coverage (every explicit edge kind has at least
one permitted pair); refusal behaviour (each refusal class —
ROOT_ONLY containment violation, illegal edge pair, self-loop, and
illegal CONTAINS pair — is reached and asserts a distinguishing
substring of the refusal reason so semantic drift is caught); a
positive sanity case (Zone at the workspace root passes); and a
read-validation probe that fails the bundle if the store ever
accepts a persisted document with an orphan parent reference.
Imported from `App.tsx` and `WorkspaceShell.tsx` so the bundle
fails synchronously on drift.

### What v1 still does **not** do

- No recommendation, scoring, ranking, lifecycle, severity, trigger,
  or evaluation. A node is a typed placeholder; an edge is a typed
  pair.
- No interaction with the Decision Canvas pipeline. The build-time
  decoupling invariant (`acwIsolationInvariants.test-shape.ts`)
  continues to enforce this against the v1 source files as well.
- No Phase 6 surface change. The ACW carries no ADC content and so
  the mandatory non-authority disclaimer is not required (see
  Section 18, *Non-influence guarantee on Phase 6*).
- No new vocabulary tier. Every static label introduced by v1 is
  asserted against `ACW_PLACEHOLDER_FORBIDDEN` (the existing ACW
  tier).

## 18B. ACW v2 — 2D visual usability

The v2 layer of the Progressive Diagram Builder makes the
structural graph from §18A directly *manipulable on a 2D canvas*
without giving any visual operation new meaning. The schema, the
registry, the validator, and the persisted document shape are
unchanged: workspace persistence remains `{ schemaVersion:
"acw-1.0", structureGraph: { nodes, edges } }` under
`acw.workspace.v1`. Every visual operation that touches structure
is validator-gated; every visual concern that does not is moved
out of the workspace document into a separate, allow-listed,
schema-versioned view-state document.

### New store mutations — `acw/acwStore.ts`

Two additive, validator-gated mutations:

- `updateNodePosition(nodeId, x, y)` — refuses non-finite values;
  refuses unknown ids; otherwise rewrites only the `x` / `y` of
  the named node. The mutation never alters `parentId`, `type`,
  `label`, or any edge. Snap-to-grid is *not* applied at this
  layer (the canvas decides whether the value it submits has been
  snapped); the store records the canonical coordinates the
  caller supplies.
- `updateNodeParent(nodeId, newParentId)` — gated by the v1
  validator's `canCreateNode(node.type, newParentId)`. The
  mutation also enforces a cycle check by walking the new
  parent's ancestor chain: a node may not be made a descendant of
  itself. Refusals carry a neutral reason string that satisfies
  the v1 vocabulary tier (`ACW_VALIDATOR_FORBIDDEN`).

Both mutations route their resulting workspace through
`writeToStorage`, which re-runs `assertAllowedFields` and
`isValidWorkspace`, so a tampered call still cannot smuggle a
disallowed field past the storage boundary.

### Per-lens view-state — `acw/acwViewState.ts`

Backed by `localStorage` under the *separate* key
`acw.workspace.view.v1`, with the *separate* schema version
`acw-view-1.0`. Document shape:
`{ schemaVersion: "acw-view-1.0", collapseByLens: { [lensId]:
string[] } }`. Allow-list at every level; corrupted documents
silently revert to the empty view-state (mirroring the workspace
store). The hook surface is intentionally tiny:
`getCollapsedIds(lensId)`, `isCollapsed(lensId, nodeId)`,
`toggleCollapsed(lensId, nodeId)`, `clearViewState()`,
`subscribeViewState(fn)`. Collapse is keyed by lens path so each
lens has its own folding state without ever touching the
structure graph (master prompt §11: grammar always wins over
visuals).

### Refusal channel — `acw/acwRefusalChannel.ts`

A trivial pub/sub that transports a *neutral refusal string only*
— no codes, no severities, no remediation. The interactive
canvas's drag handlers and the group affordance publish into the
channel when their validator-gated mutation refuses; the existing
`AuthoringPanel` refusal banner subscribes once and surfaces the
message verbatim. This routes visual-layer refusals through the
single shared `acw-refusal-banner` without prop-threading.

### Interactive canvas — `components/acw/InteractiveCanvas2D.tsx`

A drop-in replacement for `Canvas2D` used by the System Landscape
lens. Adds:

- *Selection* — single (click) and additive (shift-click).
  Background click clears.
- *Drag with snap-to-grid* — pointer drag updates a
  per-component `drag` state that snaps the final position to a
  fixed `GRID = 24` lattice. On mouseup the snapped position is
  committed via `updateNodePosition`; failure publishes the
  refusal and the in-memory drag falls away (the persisted
  position is unchanged).
- *Transient alignment guides* — while dragging, vertical and
  horizontal guide lines appear when the dragged node's centre is
  within `ALIGN_TOLERANCE = 4 px` of any sibling's centre. Pure
  visual aid; no auto-arrange.
- *Manual grouping* — a *Group into Zone* affordance is enabled
  only when the user is at the workspace root and the selection
  is two-or-more `ComputeNode` siblings. The action creates a
  fresh `Zone` at the selection centroid via `createNode` and
  reparents every selected `ComputeNode` under it via
  `updateNodeParent`. Each step is validator-gated; a refusal
  publishes through the refusal channel.
- *Per-lens collapse / expand* — every container renders a small
  toggle in its header strip. Collapse hides the container's
  direct children and any edges that would have crossed the
  boundary; expansion restores them. Collapse touches *only* the
  `acw-view-1.0` document — the workspace document is byte-
  identical before and after.
- *Nested containment cues* — non-collapsed containers render a
  dashed bounding box around their direct children with a header
  strip stating the type, label, and `n contained` count. Nested
  containers compose recursively.
- *Forbidden visual semantics* — no colour mapped to judgement
  (every container outline is the same neutral grey; selection is
  the same blue regardless of node type), no size mapped to
  importance (every node renders at a fixed `NODE_W × NODE_H`
  box), no temporal cues / arrowheads / animation suggesting
  flow, sequence, or future / past.

### System Landscape integration — `pages/acw/views/SystemLandscape.tsx`

The lens passes the live workspace's Application-typed nodes
(`System` + `Component`) and edges through to
`InteractiveCanvas2D` along with the current `focusedParentId`
(derived from the existing depth path). An `useEffect` auto-
positions any sibling at the focus level whose stored coordinates
are still `(0, 0)` by writing back through `updateNodePosition`,
so freshly-created nodes are visible without any per-render
fabrication.

### Build-time invariants — `acw/acwGrammarV2Invariants.test-shape.ts`

Synchronous module-load assertions, additive to §18A:

1. `ACW_VIEW_SCHEMA_VERSION` is exactly `acw-view-1.0`.
2. The view-state read-validator drops documents that smuggle
   graph fields (e.g. `nodes`) into the view-state allow-list.
3. `updateNodeParent` is validator-gated: a refused reparent
   (e.g. `Component` into `Zone`) leaves the persisted
   `structureGraph` byte-identical and surfaces a neutral reason.
4. `updateNodeParent` rejects cycles: a node may not be made a
   descendant of itself; the refusal reason mentions `itself`.
5. `updateNodePosition` is structurally inert: across every
   node, `id` / `type` / `parentId` / `label` are unchanged and
   the edge set is `JSON.stringify`-identical.
6. `toggleCollapsed` is structurally inert: the workspace
   `JSON.stringify` snapshot is byte-identical before and after.

The probes mutate the live store, so the module *snapshots
localStorage on entry and restores it byte-for-byte on exit*
(via `__acwStoreInternals.reloadFromStorageForTest` and the
matching helper on the view-state module). This is essential:
without snapshot-and-restore, every page load would silently
wipe the user's persisted workspace.

Imported from `WorkspaceShell.tsx` so any drift fails the bundle
synchronously.

### What v2 still does **not** do

- No recommendation, scoring, ranking, lifecycle, severity, or
  evaluation. A box is still a typed placeholder; an edge is
  still a typed pair.
- No new vocabulary tier. Every static label introduced by v2 is
  asserted against `ACW_PLACEHOLDER_FORBIDDEN`; the canvas-
  originated refusal strings are produced by the v1 validator and
  satisfy `ACW_VALIDATOR_FORBIDDEN`.
- No interaction with the Decision Canvas pipeline; the
  decoupling invariant continues to apply to the v2 source files.
- No structural meaning carried by visual choice. Position,
  collapse state, and selection live entirely outside the
  workspace document; group inference reduces to validator-gated
  `createNode` + `updateNodeParent` calls.

---

## 18C. ACW v3 — Full-Scale 3D Diagram (depth-as-containment, zoom-through)

v3 adds a per-lens 3D rendering of the SAME structure that the v2
2D canvas already shows, plus a per-lens 2D/3D toggle. Master
prompt v3 brief: depth represents decomposition only — never
priority, risk, severity, or any computed weight. The 3D canvas
must therefore be visually as inert as its 2D twin.

### Single source of truth — `acw/acwLensStructure.ts`

A pure function `enumerateLensVisibility(nodes, edges,
focusedParentId, collapsedIds)` produces, for a given lens depth
and collapse set, the canonical `(directSiblings, drawables,
visibleNodeIds, visibleEdges)` triple that both renderers consume.
This is the build-time guarantee that 2D and 3D cannot diverge:
both `InteractiveCanvas2D.tsx` and `Canvas3DStructural.tsx`
import the helper and call it; the structural-identity invariant
(see Section 15A) verifies the import and behaviour.

One deliberate asymmetry survives the refactor.
`InteractiveCanvas2D` keeps a small `totalChildCount` map
(direct-children count per parent across `nodes`, computed
locally in the component) used ONLY to render the "+N" label on
a collapsed container. The enumerator's per-drawable
`childRefs` list is empty when a container is collapsed — by
design, since collapsed containers do not surface their
children — so it cannot tell the label how many children are
hidden. Replacing `totalChildCount` with `childRefs.length`
would silently make every collapsed container display "+0".
The structural-identity invariant is unaffected: the count is
a label decoration, not a visibility decision.

Visibility rules:

1. Direct siblings of the focused parent.
2. For each direct sibling that has children AND is not collapsed
   in this lens: the direct children too.
3. Edges whose endpoints are both in (1) ∪ (2). Dangling edges
   are silently dropped.

The helper performs no IO, owns no state, and depends only on the
workspace types — so invariant modules can call it from a
synchronous module-load context.

### View-mode slice — `acw/acwViewState.ts`

The per-lens 2D/3D selection lives in the existing `acw-view-1.0`
view-state document under a new optional field `viewModeByLens:
Record<string, "2d" | "3d">`. `getViewMode(lensId)` returns `"2d"`
when no entry exists (default), so v2-persisted documents read
cleanly under v3. `setViewMode(lensId, mode)` validates the mode
against `["2d", "3d"]` and persists.

The schema version stays `acw-view-1.0`. The brief explicitly
forbids introducing a new schema in v3, and the field is strictly
additive: presence is forwards-compatible, absence is backwards-
compatible. The view-state document continues to contain NO graph
fields; the read-validator drops any document that contains
`nodes`, `edges`, or `parentId` (proven by the v2 invariants).

### 3D structural canvas — `components/acw/Canvas3DStructural.tsx`

Containment rendered as translucent rectangular volumes whose
extent is derived from their visible direct children's bounding
box. Children sit deeper on the z axis inside their parent's
volume. Leaves are uniform cubes regardless of type, child
count, or any computed quantity. Edges between visible endpoints
are straight `THREE.Line` segments with no arrowheads (which
would imply direction / sequence / time).

Camera is fixed at `[0, 0, 8]` with a 50° FOV (the constant from
the v2 `Canvas3D` primitive). There is no camera animation, no
useFrame loop, no easing, no tween. Lighting is a single
directional light plus the primitive's ambient light. The
forbidden-semantics invariant (Section 15A) source-scans this
file for any animation primitive, judgement token, or
traffic-light colour name.

Zoom-through (`Zone → ComputeNode → System → Component`):
clicking a container's mesh invokes `onDrillDown(nodeId)`, which
the host lens uses to advance its depth path. The next render
simply shows that container's children at the focus level —
direct, no transition. Because both renderers share the depth
model and the visibility enumerator, drilling in via 3D produces
exactly the same focus state as drilling in via 2D.

### Lens-canvas wrapper — `components/acw/LensCanvas.tsx`

Hosts the per-lens 2D/3D toggle and dispatches to either
`InteractiveCanvas2D` or `Canvas3DStructural`, passing the
IDENTICAL `(lensId, nodes, edges, focusedParentId, onDrillDown,
emptyHint, height, permitContainerType)` props to whichever
branch renders. This is what makes the structural-identity
invariant meaningful at runtime: there is exactly one place where
the props originate, so neither branch can be handed a different
graph slice.

Headless / no-WebGL fallback: the wrapper probes WebGL on mount
via the `detectWebGL` helper exported from `Canvas3D.tsx`. When
WebGL is unavailable, the effective mode is forced to `"2d"`
silently regardless of the user's stored preference. The toggle
still surfaces the user's pick so it persists across devices.

### Wired lenses

`SystemLandscape.tsx` (TOGAF Application) and `Deployment.tsx`
(TOGAF Technology) replace their direct `<InteractiveCanvas2D>`
mount with `<LensCanvas>`. The other three lenses (Context &
Domain, Integration, Operations & Continuity) remain on their v1
placeholder layouts; they will adopt the canvas in a future
iteration if needed.

### What v3 still does **not** do

- No new schema. Persistence stays `acw-1.0`; view-state stays
  `acw-view-1.0` with one strictly-additive optional field.
- No 3D-only primitive. Every node, edge, and container shown in
  3D is also visible in 2D at the same depth.
- No animation, no camera flight, no easing, no transition.
  Mode flips and depth changes are instantaneous.
- No semantic colour. Containers and leaves use neutral hex
  codes; the forbidden-semantics invariant rejects any
  traffic-light name.
- No coupling to the Decision Canvas pipeline. The isolation
  invariant continues to scan v3 source files; the only new
  external imports are `three` and `@react-three/fiber`, both
  already on the ACW allowlist.

---

## 19. CTAD — Conceptual Technology Architecture Design

The third peer plane of the Architecture Decision Canvas. Sits
alongside ADC (decision authority) and ACW (structural
visualisation). Surfaces an interpretive, reversible categorical
exploration of the technology configurations that *would be
permitted* by an already-frozen architecture decision, without
ever participating in the decision itself.

### Position in the system

CTAD is **not** a wizard, **not** a builder, **not** a recommender,
and **not** an authority. It records nothing into ADS, ECP, the
portfolio entry, the policy signals store, the exposure surface,
the constitutional containment surface, or the grammar engine. It
holds a per-binding state document in its own localStorage key
(`ctad.state.v1`) and exposes that state as a deterministic
`CTAD_STATE` snapshot that downstream surfaces (a future ACW
intake, a future export, etc.) can read read-only.

CTAD reads from exactly one place: `governance/portfolioStore.ts`,
restricted by build-time invariant to the named-import allowlist
`{ listEntries, type PortfolioEntry }`. Every other import form
of the portfolio store is rejected at module load.

### Files

- `artifacts/canvas-ui/src/ctad/ctadRegistry.ts` — frozen
  4-section registry with all categorical parameters; deep-frozen
  at module load; every label and option asserted against the
  CTAD vocabulary tier.
- `artifacts/canvas-ui/src/ctad/ctadStore.ts` — `localStorage`
  store at `ctad.state.v1`, per-binding write API, deterministic
  `CTAD_STATE` export, monotonic store-version counter for React
  `useSyncExternalStore` consumers.
- `artifacts/canvas-ui/src/ctad/ctadIsolationInvariants.test-shape.ts`
  — module-load denylist + allowlist scan over raw CTAD sources
  PLUS hardened multi-form portfolioStore read-only scan PLUS a
  self-test fixture proving each forbidden import shape throws and
  the approved shape passes.
- `artifacts/canvas-ui/src/ctad/ctadGrammarInvariants.test-shape.ts`
  — module-load grammar shape lock + empty-binding leak probe.
- `artifacts/canvas-ui/src/pages/ctad/CtadEntry.tsx` — frozen
  decisions list at `/ctad`; empty state shows the brief-mandated
  verbatim sentence and no other affordance.
- `artifacts/canvas-ui/src/pages/ctad/CtadShell.tsx` — bound
  exploration at `/ctad/:adsId/:adsVersion`: read-only ADC
  binding panel, four collapsible state-driven sections, live
  `CTAD_STATE` JSON preview, references catalogues panel.

### Registry — four canonical sections

The registry is the single source of truth for what CTAD lets a
user explore. It is deep-frozen at module load and every label /
option is asserted against `CTAD_FORBIDDEN`.

| Section id | TOGAF-aligned theme | Examples of parameters |
| --- | --- | --- |
| `infrastructure` | Compute, storage, network, runtime | compute model, storage class, network components (multi), deployment fabric, runtime platform |
| `application` | Application platform, framework, data plane | application style, framework family, data store class, processing pattern |
| `integration` | Integration style, protocols, contracts | integration style, transport protocol, contract style, async pattern |
| `crossCutting` | Cross-cutting concerns | observability surface, identity model, secrets handling, packaging |

Each parameter is one of:

- `single` — exactly one option (or unspecified).
- `multi` — zero or more options (used only for `networkComponents`
  in v1).

No parameter is `required`. The registry is intentionally
permissive: every parameter defaults to "Not specified" and the
user may leave the entire shell blank.

### Store contract

```
localStorage["ctad.state.v1"] =
  {
    schemaVersion: "ctad-1.0",
    bindings: {
      "<adsId>@<adsVersion>": {
        adsId, adsVersion,
        params: { [paramId]: string | string[] },
        updatedAt: ISO8601
      },
      ...
    }
  }
```

Invariants enforced in code:

1. **Schema lock** — `schemaVersion` is exactly `"ctad-1.0"`; any
   other value causes the store to read as empty.
2. **Registry validation on write** — `setCtadParam(b, paramId, v)`
   throws if `paramId` is not in the registry, or if `v` is not a
   permitted option (single) / not an array of permitted options
   (multi).
3. **No empty-binding leak** — clearing the only param of a binding
   removes the binding key from the document; clearing a param on
   a binding that does not exist is a fast-path no-op. The grammar
   invariant exercises a probe round-trip at module load to prove
   this.
4. **Deterministic export** — `exportCtadState(b)` (and its alias
   `getCtadState(b)`) walks `CTAD_SECTIONS` in registry order and,
   for every parameter in registry order, writes either the stored
   value or `null`. Output is grouped by section id and is safe to
   `JSON.stringify` for downstream consumers.
5. **Subscription is contract-correct** — views adapt the store
   to React via `useSyncExternalStore(subscribe, getStoreVersion)`.
   `getStoreVersion` is a monotonic counter incremented inside
   `writeDoc`, satisfying React's snapshot-stability requirement.
   Returning `Date.now()` or any fresh-identity value from the
   snapshot function is documented as a banned pattern in the
   store source.

### Vocabulary tier

CTAD has its own **standalone** vocabulary tier
`CTAD_FORBIDDEN`, sibling to every existing governance tier and
not a strict superset of any of them (see §10). Forbidden tokens:
`approve`, `approved`, `confirm`, `recommend`, `recommended`,
`best`, `optimal`, `optimise`, `optimize`, `final`, `score`,
`ranked`, `ranking`, `mandate`, `justify`, `enforce`, `must`.

Asserted at module load via `assertAllCtadLanguage` over:

- every section title and option in `ctadRegistry.ts`,
- every static label, hint, button caption, and references-panel
  item in `CtadShell.tsx`,
- every static label in `CtadEntry.tsx` *except* the
  brief-mandated sentence "CTAD requires an approved
  architectural decision." (spec-equality exemption — see §10).

The bound shell deliberately labels the underlying portfolio
field `approvingAuthority` as **"Decision authority"** to keep
CTAD-authored copy free of "approving"-family tokens. The
`LandingPage.tsx` CTAD card uses denial vocabulary
("approved decision", "No approval, no recommendation, no
scoring") to describe what CTAD is NOT; that copy lives outside
`src/ctad/**` and `src/pages/ctad/**` and is intentionally not
asserted against the CTAD tier — the rationale is documented
inline in `LandingPage.tsx`.

### UI behaviour

- **`/ctad` (entry).** Lists every frozen ADC entry returned by
  `listEntries()`, with project name, decision authority, decision
  date, and ADS id/version. Clicking a row opens the bound shell.
  When `listEntries()` is empty, the page shows the verbatim
  brief-mandated sentence and no CTA.
- **`/ctad/:adsId/:adsVersion` (bound shell).** Renders four
  panels in fixed order:
  1. **ADC binding (read-only)** — project, decision authority,
     decision date, ADS id, ADS version, organisation type,
     sensitivity level, system intent, expected lifespan,
     in-scope capability count. Hint copy makes the read-only
     contract explicit.
  2. **Technology parameters** — four collapsible sections from
     the registry. Each parameter renders as a single-select or
     multi-select control with explicit "Not specified"
     semantics. Selections are reversible at any time.
  3. **`CTAD_STATE` (live preview)** — pretty-printed JSON of
     `exportCtadState(binding)`, refreshed on every store
     mutation via the `useSyncExternalStore` adapter.
  4. **References** — plain-link catalogues for vendor-neutral
     reference reading; the panel description carries no
     ranking, scoring or selection signal.
- **No wizard, no progress, no submit, no finalise.** There is no
  "submit" button, no "approve" button, no "validate" call, no
  step counter, no progress bar.

### Routes and navigation

- `/ctad` → `pages/ctad/CtadEntry.tsx`
- `/ctad/:adsId/:adsVersion` → `pages/ctad/CtadShell.tsx`

`App.tsx` mounts both routes and side-effect-imports both CTAD
invariant modules so a corrupted registry, a regressed isolation
boundary, or a regressed grammar shape fails the bundle
synchronously at module load.

`GlobalNav.tsx` adds a CTAD entry between *Decision Canvas* and
*Portfolio*. `LandingPage.tsx` is updated from two cards to three
equal peer cards (ADC | CTAD | ACW) with the heading copy "Three
surfaces are available".

### Non-goals (intentional, documentary)

- CTAD does **not** recommend, score, rank, approve, finalise,
  weight, evaluate, or validate technology choices.
- CTAD does **not** mutate ADC artefacts (ADS, ECP, portfolio
  entry).
- CTAD does **not** import from `governance/adsBuilder`,
  `governance/ecpBuilder`, `governance/ecpSections`,
  `governance/exposureDerive`, `governance/exposureNarratives`,
  `governance/responsibilityLens`, `governance/scenarioReading`,
  `governance/decisionReentry`, `governance/signalsStore`,
  `governance/export`, `governance/hash`, `governance/identity`,
  `governance/togafContainment`, `governance/misusePlaybooks`,
  the architecture grammar package, or any module under `acw/`.
  The isolation invariant rejects each of these at module load.
- CTAD does **not** participate in the Phase 6 constitutional
  refusal surface; it is a plane *under* the constitutional layer
  in the same sense ACW is.
- CTAD does **not** have a 3D rendering, animation, or live
  derivation. The live preview is a pretty-print of stored state.

### Strictly removable

CTAD is strictly removable to the pre-CTAD bundle. To remove:

- delete `src/ctad/`, `src/pages/ctad/`,
- remove the two CTAD route definitions and the two CTAD
  invariant side-effect imports from `App.tsx`,
- remove the CTAD entry from `GlobalNav.tsx`,
- remove the CTAD card from `LandingPage.tsx` (and revert the
  heading copy to "Two surfaces are available"),
- remove the `CTAD_FORBIDDEN` tier and the
  `assertCtadLanguage` / `assertAllCtadLanguage` helpers from
  `governance/staticTextGuard.ts`,
- delete the `ctad.state.v1` localStorage key for every user
  (optional cleanup; the bundle will not read it once the store
  is removed).

No other surface depends on CTAD. ADC, ACW, the Reflection view,
the Decision Exposure View, and the Phase 6 Containment surface
all continue to function unchanged.

---

## 18D. ACW Track 3 — Derived Structural Visualisation

A **strictly read-only** workspace at `/acw/derived` that
mechanically derives a structural diagram from `CTAD_STATE` plus
a small projection of ADC bounds. Track 3 is not authored, has
no save/freeze/export/share affordance, never mutates any
upstream store, and cannot influence ADC, CTAD, signals, the
Reflective view, or the Decision Exposure View.

### Position in the system

CTAD is the interpretive technology overlay (§19). Track 3 is
the *derived view* of that overlay: it answers "what would the
structure look like if we drew the selections we have so far?"
without forming, recommending, or finalising anything. The same
diagram is rendered by both a 2D and a 3D renderer; the two
renderers consume the same in-memory graph through the shared
helper `enumerateLensVisibility(...)` so they cannot diverge.

### Files

```
src/acw/track3/
  track3Types.ts             — Track3Layer, Track3Perspective, AdcBounds,
                               AcwTrack3Structure, stable-id helpers
                               (nodeIdForLayer, nodeIdForParamValue, edgeId,
                               optionSlug). Imports AcwNode/AcwEdge types
                               via the re-export from acw/acwLensStructure.
  track3LabelRegistry.ts     — Generic, vendor-free display labels for layers,
                               params, and option overrides (e.g. "React-like"
                               option key → "Component-tree frontend" label).
                               assertNoVendorNames denylist enforced at module
                               load.
  track3Adjacency.ts         — Pure adjacency-rule table (param-value pairs
                               that imply a CONNECTS edge in the derived
                               structure). Canonicalises edge id ordering.
  track3AdcBounds.ts         — projectBounds(entry: PortfolioEntry): AdcBounds.
                               Reads only the read-only surface of the
                               portfolio store.
  track3Derive.ts            — deriveACWStructure(ctadState, bounds):
                               AcwTrack3Structure. Pure, total, deterministic.
                               Empty input → empty output (no synthesised
                               defaults). Stable ids of the form
                               node:<sectionId>:<paramId>:<optionSlug>.
  track3ViewPrefs.ts         — Schema-locked persistence of per-binding view
                               preferences only (acw.track3.viewprefs.v1).
                               Validated by assertValidPrefsDoc on read.
  acwTrack3IsolationInvariants.test-shape.ts
                             — Build-time isolation: denylist of decision-
                               pipeline modules and ACW write surfaces;
                               positive allowlist of permitted import
                               specifiers; per-store named-import allowlists
                               (portfolio = { listEntries, PortfolioEntry };
                               CTAD = { getCtadState, exportCtadState,
                               CtadStateExport } — strictly the read-only
                               trio; subscribe, getStoreVersion, and
                               CtadBinding are explicitly NOT permitted
                               (Track 3 re-reads CTAD on render and via a
                               "Refresh from CTAD" button instead, keeping
                               the surface inert and side-effect-free);
                               lens-structure helper =
                               { enumerateLensVisibility, LensVisibility,
                               LensDrawable, AcwNode, AcwEdge }). Includes a
                               module-load self-test exercising every
                               forbidden form.
  acwTrack3DerivationInvariants.test-shape.ts
                             — Module-load assertions that derive is
                               deterministic (same input → same output),
                               empty-in → empty-out (no fabricated defaults),
                               and sensitive to input (different input →
                               different output).
  acwTrack3StructureInvariants.test-shape.ts
                             — Both Track 3 renderers must call
                               enumerateLensVisibility(...) and must NOT
                               import the authored ACW store, view-state,
                               validator, or grammar hooks. ONLY comments
                               are stripped before scanning; string
                               literals ARE scanned so a smuggled string-
                               literal import path is still caught.
  acwTrack3ForbiddenSemantics.test-shape.ts
                             — Both renderers must contain ZERO of the
                               animation, judgement, time, traffic-light, or
                               recommendation tokens enumerated in the
                               invariant. ONLY comments are stripped; string
                               literals are scanned so a banned token
                               smuggled as a runtime label (e.g. `"red"`,
                               `"recommended"`) is caught.
  acwTrack3FocusIsolationInvariants.test-shape.ts
                             — Module-load assertions over the pure
                               `isolateAroundNode(nodes, edges, selectedId)`
                               function: null selection passes through;
                               layer-root selection keeps root + direct
                               children + edge-neighbours; leaf selection
                               keeps the leaf + one-hop neighbours + the
                               layer-root parent of every kept node;
                               disconnected-leaf selection still keeps
                               {leaf, parent root} so the canvas is never
                               empty for an existing node. The shell uses
                               this function to pre-filter the structure
                               before it reaches the renderers, so
                               enumerateLensVisibility is invoked with
                               focusedParentId=null inside each renderer.

src/components/acw/track3/
  Track3Canvas2D.tsx         — SVG-based 2D renderer. Neutral hex palette,
                               no animation, no easing, no per-frame hooks.
  Track3Canvas3D.tsx         — R3F-based 3D renderer. Depth represents
                               containment only (layer roots at z=0,
                               param-value children at z=1). No camera
                               motion, no useFrame, no easing.

src/pages/acw/track3/
  Track3Entry.tsx            — Entry list of frozen ADC decisions; each row
                               opens the derived view. Read-only.
  Track3Shell.tsx            — Bound shell. Read-only ADC binding panel,
                               view controls (2D/3D, perspective, layer
                               toggles), and the chosen renderer. Re-reads
                               CTAD_STATE on every render (CTAD selections
                               are picked up automatically), and exposes a
                               "Refresh from CTAD" button that bumps an
                               internal tick. There is no subscription to
                               ctadStore; subscribe / getStoreVersion /
                               CtadBinding are explicitly forbidden by the
                               isolation invariant. The shell also owns the
                               selectedNodeId state and runs
                               `isolateAroundNode` BEFORE handing the
                               structure to the chosen renderer, so leaf-
                               click focus works correctly.
```

### The four hardened invariants

1. **Track 3 isolation invariant** —
   `acwTrack3IsolationInvariants.test-shape.ts`. Track 3 sources
   may only import from a closed allowlist; every read-only
   store import is constrained to a per-store named-import
   allowlist; namespace, default, side-effect, and dynamic
   imports of read-only stores are all rejected. A self-test
   proves each forbidden shape throws and each approved shape
   passes.
2. **Track 3 derivation-purity invariant** —
   `acwTrack3DerivationInvariants.test-shape.ts`. `deriveACWStructure`
   is asserted at module load to be (a) deterministic, (b) empty-in
   → empty-out, and (c) sensitive to input. Closes regressions to
   `Date.now`, `Math.random`, mutable closures, or silent default-
   synthesis.
3. **Track 3 structural-identity invariant** —
   `acwTrack3StructureInvariants.test-shape.ts`. Both Track 3
   renderers must call `enumerateLensVisibility(...)` and must
   not reference the authored ACW store / view-state / validator /
   grammar hooks. Comments and string literals are stripped
   before the scan.
4. **Track 3 forbidden-semantics invariant** —
   `acwTrack3ForbiddenSemantics.test-shape.ts`. Both renderers
   must contain ZERO animation primitives (`useFrame`,
   `setInterval`, `requestAnimationFrame`, easing, tween,
   keyframe, animate), ZERO judgement / weighting tokens
   (priority, risk, severity, score, weight, urgency, importance,
   health, maturity, correctness), ZERO time tokens (timeline,
   duration, elapsed), ZERO traffic-light colour names, and ZERO
   recommendation tokens (recommended, optimal, optimised,
   optimized, best, validated, approved). Comments and string
   literals are stripped before scanning.

All four are imported as side effects from `App.tsx` so any
regression fails the application bundle at module load.

### Vocabulary tier

`ACW_TRACK3_FORBIDDEN` (in `governance/staticTextGuard.ts`) is a
**standalone sibling tier** — not derived from the ACW
placeholder tier or from CTAD. Every static label, hint, control
caption, and label-registry string rendered by a Track 3 module
file is asserted against this tier at module load via
`assertAllAcwTrack3Language`. The tier bans judgement,
traffic-light, recommendation, prescription, and ranking tokens.
A complementary vendor-name denylist (`assertNoVendorNames` in
`track3LabelRegistry.ts`) bans product / vendor names so labels
remain generic ("Component-tree frontend", not "React-like
frontend").

### Stable ids

Every node and edge in the derived structure has a stable,
content-addressable id of the form
`node:<sectionId>:<paramId>:<optionSlug>` (or `node:<sectionId>`
for layer roots) and `edge:<fromId>::<toId>` (with canonical
ordering of the two endpoints). The same input therefore always
produces the same id set, which is what makes the derivation
invariant assertable.

### View preferences

Track 3 owns **only** `acw.track3.viewprefs.v1`. The diagram
itself is never persisted — it is recomputed on every render from
the live `CTAD_STATE` of the bound binding plus
`projectBounds(entry)`. This is what allows Track 3 to remain
strictly read-only: there is no write path back into CTAD or the
portfolio.

### Strictly removable

Removing the entire Track 3 surface is a four-step delete:
- delete the directories `src/acw/track3/`,
  `src/components/acw/track3/`, and `src/pages/acw/track3/`,
- remove the four side-effect imports of the Track 3 invariants
  and the two component imports / route declarations from
  `src/App.tsx`,
- remove the "Derived view" entry from
  `components/governance/GlobalNav.tsx` and the per-row
  "Open derived view" CTA from `pages/ctad/CtadEntry.tsx`,
- delete `acw.track3.viewprefs.v1` from localStorage (optional
  cleanup; the bundle stops reading it once Track 3 is gone).

No other surface depends on Track 3. ADC, CTAD, ACW Tracks 1–2,
the Reflection view, the Decision Exposure View, and the Phase 6
Containment surface all continue to function unchanged.

# Overview

This project is a pnpm workspace monorepo using TypeScript, centred on the **Architecture Decision Canvas (ADC)** — a deterministic, grammar-based system that maps an organisation's context, capability selections, and trade-off settings to a required set of architecture components, applicable risks, and complexity indicators. Approved decisions are frozen as immutable governance artefacts (Architecture Decision Snapshot — ADS, and Execution Constraint Profile — ECP), recorded in a portfolio, and referenced over time by leadership-recorded policy signals. Two peer planes sit beside ADC: **CTAD** (Conceptual Technology Architecture Design) for reversible categorical technology exploration, and **ACW** (Architecture Composition Workspace) for TOGAF-aligned structural visualisation. The system is descriptive, not prescriptive — it never assesses, ranks, prescribes, or requires action.

> For the canonical architecture reference — including the layer diagram, every module path, persistence contracts, vocabulary tiers, build-time invariants, and the end-to-end flow — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is a pnpm workspace monorepo. Each top-level package belongs to either `artifacts/*` (deployable surfaces) or `lib/*` (shared libraries). Workspace conventions and shared dev-tooling live in `pnpm-workspace.yaml` (catalog, supply-chain `minimumReleaseAge: 1440`, esbuild Linux-only override).

## Stack

| Concern | Choice |
| --- | --- |
| Monorepo tool | pnpm workspaces (catalog + project references) |
| Node.js | 24 |
| TypeScript | ~5.9.2 (strict, project references via `tsconfig.base.json`) |
| Frontend | React 19.1.0 + Vite 7 + Tailwind 4 + lucide-react |
| 3D / canvas | React Three Fiber, three.js, ELK (`@workspace/diagram-layout`) |
| API framework | Express 5 (`artifacts/api-server`) |
| Database (scaffolded) | PostgreSQL + Drizzle ORM 0.45 |
| Validation | Zod 3.25 (`zod`), `drizzle-zod` |
| API codegen | Orval (from `lib/api-spec/openapi.yaml`) |
| Client export | `jspdf` (PDF), `docx` (DOCX) — fully client-side |
| Mockup preview | Vite preview server (`artifacts/mockup-sandbox`) |
| Build | esbuild for server bundle; Vite for browser |
| Format / lint | Prettier 3.8 |

## Repository Layout

```
.
├─ artifacts/
│  ├─ canvas-ui/         React + Vite SPA — the entire user-facing product (ADC, CTAD, ACW, governance views)
│  ├─ api-server/        Express 5 service (health + logger; not on the decision path)
│  └─ mockup-sandbox/    Vite preview server for component prototyping (one URL per component)
├─ lib/
│  ├─ architecture-grammar/  Pure TS grammar engine (7 capabilities, 18 components, Rules A–D, risk detection)
│  ├─ diagramspec/       Pure TS DiagramSpec compiler (CTAD_STATE → strict DiagramSpec graph)
│  ├─ diagram-layout/    ELK-based layout (DiagramSpec → PositionedDiagram), used by 2D/3D renderers
│  ├─ cncf-catalog/      Frozen CNCF reference cards (maturity, category, binding hints) — vendor-neutral
│  ├─ api-spec/          OpenAPI source-of-truth + Orval config
│  ├─ api-zod/           Drizzle-derived Zod schemas (scaffolded; not on decision path)
│  ├─ api-client-react/  Generated React Query client (Orval output) + custom fetcher
│  └─ db/                Drizzle schema + Postgres bindings (scaffolded)
├─ scripts/              Functional sanity scripts (e.g. derive-example) and post-merge.sh
├─ docs/ARCHITECTURE.md  Canonical architecture reference
├─ pnpm-workspace.yaml   Catalog, packages, supply-chain settings
└─ replit.md             This file
```

## Surfaces (routes inside `artifacts/canvas-ui`)

- **`/` (Wizard)** — five-screen ADC flow: ContextForm → CapabilitySelector → ArchitectureResultDisplay → TradeOffExplorer → FreezeMetadataForm → FreezeAndExport. Generates ADS (6 sections) + ECP (9 sections), exports PDF + DOCX with integrity footer, writes to portfolio on freeze.
- **`/portfolio`** — read-only board of approved decisions; sortable, filterable, with cross-portfolio summaries (Risk Concentration, Indicator Distribution) and ADS/ECP modal viewers rendered from the persisted entry (never re-derived).
- **`/signals`** — leadership-only policy-signal recorder; 7 fixed categories, lifecycle `Observed → Under Discussion → Acknowledged`; every `interpretationGuidance` entry must end with `?`.
- **`/reflection`** — read-only observational view: decision lineage, governance attention over time, memory overview, silence awareness. Plain counts only — no scores, thresholds, percentages, or comparisons.
- **`/exposure/:adsId`** — Decision Exposure View covering Phases 1–5 (baseline, exposure narratives, cross-functional responsibility lens, scenario-conditioned reading, decision re-entry lens). All re-derived on every render from a single `PortfolioEntry`; never writes back.
- **`/governance/containment`** — Phase 6 Constitutional Layer: TOGAF / ArchiMate non-authority docking table, mandatory non-authority disclaimer, advisory misuse playbook.
- **`/workspace/*` (ACW)** — TOGAF-aligned workspace shell with five lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity) **plus a sixth EAStudio canvas lens at `/workspace/studio` (Task #90, Phase 1)** and reusable 2D and 3D canvas primitives. Build-time isolation invariant — imports nothing from the decision pipeline.
  - **EAStudio Phase 1 (Task #90).** Additive grammar extension at schema `acw-1.0`. ACW grammar gains `BusinessEntity` as an extra root-only element type and widens `Zone`, `System`, and `Component` to permit a `Zone` parent (so `Zone` can nest as Department-in-Business → OrgUnit-in-Department, and the existing System / Component containment continues to work for Application / Technology). The four immutable sealed domain containers (Business / Data / Application / Technology) are seeded once via `ensureDomainContainers()` keyed by `acw.studio.domain.{business,data,application,technology}`; the Business container is a `BusinessEntity`, the others are `Zone`. The palette registry (`acw/palette/paletteRegistry.ts`) ships per-domain tile sets with vendor-neutral `lucide-react` icons (no emoji) and has no edge tiles in Phase 1. The 2×2 grid embeds an `InteractiveCanvas2D` per quadrant under its own studio lens id (`studio-{domain}`), so drag-to-move / drag-to-reparent / marquee-select / group / collapse-expand all work without re-implementing any rendering primitive; a thin wrapping div adds palette drop intake and a per-quadrant drill-down breadcrumb. The strict Business chain (BusinessEntity → Department → Org unit → Business process) is enforced at the *validator* level — `canCreateNode` walks the parent chain when a `System` is placed under a `Zone` and refuses the placement when the topmost ancestor is a `BusinessEntity` and the immediate parent Zone is itself the BusinessEntity's child (Department-tier). The same gate fires for `updateNodeParent`, so drag-to-reparent cannot bypass the chain. The Application quadrant — whose top container is a domain Zone — is unaffected, so Application-as-System under any Zone continues to validate. `acwViewState` gains a `currentDomainByLens` slice (key `acw.workspace.view.v1`) so the active domain tab is per-lens. The `PalettePanel` ships with a chevron-driven collapse / expand affordance for horizontal real-estate. The ACW isolation invariant is intact, the existing five lenses are preserved, and the surface is documented as strictly removable in `docs/ARCHITECTURE.md` §20. **Task #86 — authored fullscreen lenses:** the System Landscape and Deployment & Infrastructure lenses now run in a per-lens fullscreen layout by default. The lens canvas mounts inside a `fixed inset-0 z-0` container while the shell's sticky header (`z-10`) and the new sticky lens sub-nav (`top-14 z-10`) stay reachable above it; all non-canvas UI floats over the canvas as a `WorkspaceLensFloatingOverlay` component (top-left identity + exit-fullscreen, right-edge collapsible authoring drawer, bottom-right collapsible structure drawer, bottom-centre depth breadcrumb pill, with a `top-28` clearance to clear both sticky bars). The shell exposes a `hideShellChrome` prop so the fullscreen branch can suppress the inline body chrome (hint paragraph + always-on `AuthoringPanel`). Pressing `Escape` toggles fullscreen in either direction, suppressed while focus is inside an editable target (input / textarea / select / contentEditable) or when the event has already been `preventDefault()`'d by an upstream dismiss handler. Per-lens fullscreen state persists in the new `acw.workspace.viewprefs.v1` slice (schema `acw-workspace-viewprefs-1.0`), kept independent from the existing `acw-view-1.0` slice and from the Track 3 viewprefs slice on purpose. The overlay component is intentionally NOT abstracted with the Track 3 overlay despite visual similarity — the authored ACW and the derived Track 3 view sit on opposite sides of an isolation contract.
- **`/ctad`, `/ctad/:adsId/:adsVersion`, `/ctad/arch/:architectureId` (CTAD)** — third peer plane. State-driven, non-wizard, reversible categorical exploration of technology configurations. Two coexisting modes share the same five collapsible sections (`infrastructure`, `application`, `integration`, `crossCutting`, `ops`), the same live `CTAD_STATE` JSON preview, the same reference catalogues, and the same first-class environments panel: (a) **ADC-bound** workspaces at `/ctad/:adsId/:adsVersion` keyed by `${adsId}@${adsVersion}` and anchored to a frozen ADC decision (binding-mode also surfaces the CNCF Applied-Cards panel and contextual constraints), and (b) **standalone Architecture Workspaces** at `/ctad/arch/:architectureId` keyed by an opaque `<slug>-<8-hex>` id, with no ADS/ECP coupling at all. The `/ctad` landing page exposes both via a tab bar. Per-document `localStorage` blob at `ctad.state.v1` with schema **`ctad-1.2`** (deterministic read-time migration from `ctad-1.1` adds an empty top-level `architectures` map; bindings shape unchanged). Records nothing back into ADS, ECP, the portfolio entry, signals, exposure, containment, or the grammar engine, in either mode.
- **ACW Phase 5 — Technology-aware semantic node binding (Task #82)** — ACW nodes can now optionally carry a `boundParam` (`{sectionId, paramId, optionValue: string|null}`) and a `boundTechnologyCategory` string. The read-validator accepts both as optional fields and rejects malformed shapes (covered by the v2 grammar invariants probe (7)). A new `updateNodeBinding(nodeId, {boundParam?, boundTechnologyCategory?})` mutation re-validates before commit. The `acw/icons/iconRegistry.ts` module ships a vendor-neutral `lucide-react` icon table keyed by technology category, guarded by a vendor denylist invariant. The `acw/semantic/techNodeBinding.ts` helper is the **only** ACW module permitted to import `@/ctad/ctadRegistry` (a one-way read of the frozen registry, explicitly added to the ACW isolation allowlist; the CTAD store is still forbidden). Every resolution gates through the registry: `findRegistryParam(sectionId, paramId)` cross-checks the binding's section against `findSectionForParam(paramId)`, and `resolveBoundOption` only returns an `optionValue` that appears on the registry's declared option set — so stale, mis-sectioned, or out-of-set bindings collapse to a no-op fallback (`node.label`, no icon) instead of rendering a misleading label. `acw/semantic/ctadToAcwSeed.ts` exposes a pure `seedAcwWorkspace(input)` that derives a deterministic seed id and category-maps section/param ids → boundTechnologyCategory. The `AuthoringPanel` now renders a "Bound parameters" subsection listing every node with a `boundParam` and an option dropdown sourced via `resolveBoundOptions(node)`; changes route through `updateNodeBinding`. ACW writes never flow back into CTAD/ADS/ECP.
- **`/acw/derived`, `/acw/derived/arch/:architectureId` (ACW Track 3)** — strictly read-only derived structural view. The compiler in `@workspace/diagramspec` mechanically derives a `DiagramSpec` from `CTAD_STATE` (including first-class environments); `@workspace/diagram-layout` runs ELK; two renderers (2D SVG, 3D R3F) consume the same in-memory graph through `enumerateLensVisibility(...)` so they cannot diverge. Phase 3 (Task #80) decoupled Track 3 from ADC bounds: the entry lists CTAD architectures (no portfolio), and the shell loads the architecture's CTAD state via `exportArchitectureState(architectureId)`. Phase 4 (Task #81) introduced a full-page architecture canvas with a `Track3FloatingOverlay` component: when `prefs.isFullscreen === true` (the new default) the canvas renders inside a `fixed inset-0 z-0` container (intentionally below the route's sticky header at `z-10`, so navigation chrome remains visible while the canvas covers the body) with all controls shown as quadrant overlays (top-left identity + refresh + exit; bottom-right collapsible mode/perspective/layers cluster; bottom-centre stratum-legend pill). Pressing `Escape` toggles full-screen on and off (suppressed while focus is inside an input / textarea / select / contentEditable element so it does not interfere with browser-native dismiss semantics). Per-architecture view preferences persist as `acw.track3.viewprefs.v1` under schema `acw-track3-viewprefs-1.1`, with a deterministic v1.0 → v1.1 migration that injects `isFullscreen: true` into every entry; the diagram itself is never persisted.

## CTAD Subsystem (current state)

CTAD owns the following `localStorage` documents, each per-binding and bumpable independently:

| Key | Schema | Owned by | Contents |
| --- | --- | --- | --- |
| `ctad.state.v1` | `ctad-1.2` | `ctad/ctadStore.ts` | Section param values + `environments: EnvironmentDef[]`, scoped per binding (`bindings`) and per standalone Architecture Workspace (`architectures`) |
| `ctad.applied-cards.v1` | `ctad-applied-cards-1.0` | `ctad/ctadAppliedCardsStore.ts` | Audit log of CNCF cards applied (with set / constrain / justify effects) |
| `ctad.constraints.v1` | `ctad-constraints-1.0` | `ctad/ctadConstraintsStore.ts` | Annotation-only constraint contributions per param (allowed-option subsets, with source card id) |
| `acw.track3.viewprefs.v1` | `acw-track3-viewprefs-1.1` | `acw/track3/track3ViewPrefs.ts` | View mode, perspective, hidden layers, camera, `isFullscreen` (per architecture; legacy `byBinding` map still validated for back-compat). Deterministic v1.0 → v1.1 read-time migration injects `isFullscreen: true` into every entry. |
| `acw.workspace.viewprefs.v1` | `acw-workspace-viewprefs-1.0` | `acw/acwWorkspaceViewPrefs.ts` | Per-authored-lens visual preferences for the ACW workspace (Task #86). Allow-listed shape `{ schemaVersion, byLens: { [lensPath]: { isFullscreen: boolean } } }` — `isFullscreen` is the only per-lens field; the validator drops any document with extra structural fields. Independent slice from Track 3 viewprefs by design. |

An additional document is owned by the governance plane and read by CTAD architecture mode (read-only on portfolio):

| Key | Schema | Owned by | Contents |
| --- | --- | --- | --- |
| `adc.architecture-attachments.v1` | `att-1.0` | `governance/architectureAttachmentStore.ts` | Many-to-many links `{ linkId → { architectureId, adsId, adsVersion, attachedAt } }` between standalone CTAD architectures and frozen ADC decisions; idempotent attach, empty-leak rule on detach |

### Environments (first-class, Task #77)

`EnvironmentDef = { id: string; name: string; kind: EnvironmentKind; hostingModel: HostingModel | null }`. Authored through the **EnvironmentsPanel** in `pages/ctad/CtadShell.tsx`. CRUD goes through `ctad/ctadStore.ts` (`addEnvironment`, `renameEnvironment`, `setEnvironmentKind`, `setEnvironmentHostingModel`, `removeEnvironment`). Validators reject duplicate ids, non-canonical identifier shape, and empty names. The legacy synthesis path (`synthesizeEnvironments.ts` + `env:default` fallback) is **deleted** — the `@workspace/diagramspec` compiler reads `ctadState.environments ?? []` directly and fans hosts out per environment when a non-empty list is present, otherwise emits a flat host listing under `parentId: null`.

### CNCF Apply Layer

`@workspace/cncf-catalog` ships frozen, vendor-neutral cards. `src/cncf/cncfBindingEngine.ts` evaluates cards against the live binding (read-only). `ctad/cncfApplyService.ts` is the **only** module that mutates the applied-cards and constraints stores in tandem; this asymmetric placement (`@/ctad`, not `@/cncf`) keeps the CNCF module surface read-only with respect to CTAD state and gives the CTAD store exclusive ownership of all writes.

### Architectural rule — environments are adjacent, not a sixth section

Environments are a first-class CTAD concept but deliberately not a member of `CTAD_SECTIONS`. Sections are categorical *parameter* groups (single/multi-select over a fixed vocabulary) whose grammar invariant pins exactly five canonical sections. Environments are *named records* with a different shape (`{ id, name, kind, hostingModel }`); modelling them as a section would break the grammar invariant and the CTAD_STATE block-serialisation contract. They live as a peer field on `CtadStateExport` and are read by downstream consumers (compiler, renderers) directly, never through `findParam` / `CTAD_REGISTRY` traversal. Documented in `ctad/ctadRegistry.ts`.

## Governance & Persistence (decision plane)

- **Governance Export Layer** — Client-side TS layer in `src/governance/`. `adsBuilder.ts` builds the ADS (6 sections, fixed order). `ecpBuilder.ts` + `ecpSections.ts` build the ECP (9 sections, sorted by `sectionOrder`). Version hash: `fnv1aHex(canonicalJSON({ context, selections, baselineTradeOffs }))` — Project Name and Approving Authority are intentionally excluded so renaming does not bump the version. `adsId` is a slug of project name. `export.ts` produces PDF (jspdf) and DOCX (docx) with integrity footer. All exports run client-side.
- **Portfolio store** — `governance/portfolioStore.ts`, key `adc.portfolio.v1`, allow-listed entries with exactly 17 fields. `assertAllowedFields` throws on unknown fields at write; `isValidEntry` silently drops corrupted entries on read. Phase 6 enforces `assertNoComputedADCFields` — no new portfolio field may be added.
- **Signals store** — `governance/signalsStore.ts`, key `adc.policy-signals.v1`, 11-field allow-listed signals over 7 fixed categories with forward-only lifecycle and read-only-after-acknowledged terminality.
- **Static-text governance guard** — `governance/staticTextGuard.ts` enforces nine vocabulary tiers (lattice, not chain). Each page registers every static label into a single dictionary asserted against its own tier at module load; JSX references only those constants so the guard cannot be bypassed.
  - Base: `PORTFOLIO_FORBIDDEN` ⊂ `SIGNALS_FORBIDDEN`.
  - Sibling tier 1: `REFLECTIVE_FORBIDDEN`, `EXPOSURE_NARRATIVE_FORBIDDEN`, `RESPONSIBILITY_LENS_FORBIDDEN` (all strict supersets of `SIGNALS_FORBIDDEN`, not interchangeable).
  - Sibling tier 2: `SCENARIO_READING_FORBIDDEN` (strict superset of all three above).
  - Sibling tier 3: `DECISION_REENTRY_FORBIDDEN`, `TOGAF_CONTAINMENT_FORBIDDEN`, `ACW_PLACEHOLDER_FORBIDDEN` (the last is a strict superset of TOGAF Containment).
  - Standalone siblings: `CTAD_FORBIDDEN` and `ACW_TRACK3_FORBIDDEN` — intentionally outside the chain because both planes are non-authoritative by construction. Both ban `must`, `approve`, `recommend`, `score`, `rank`, `mandate`, `optimal`, `best`, `final`, etc. A complementary `assertNoVendorNames` denylist on the ACW Track 3 label registry keeps labels generic.

## Build-Time Invariants

The system uses **`*Invariants.test-shape.ts`** modules that run at module load (side-effect imported from `App.tsx`). A regression makes the bundle fail to start. Current invariant modules:

- `ctad/ctadGrammarInvariants.test-shape.ts` — schema is exactly `ctad-1.2`; exactly five canonical sections in canonical order; every paramId unique; every option non-empty; environments vocabulary (`KIND`, `HOSTING`) frozen; live probe round-trip closes the empty-binding-leak path AND the parity empty-architecture-leak path; architecture identity helpers (regex, generator, slug extractor) round-trip; an architecture create→export→remove round-trip asserts no `adsId`/`adsVersion`/`binding` leakage into standalone exports.
- `ctad/ctadIsolationInvariants.test-shape.ts` — CTAD module surface only imports `{ listEntries, getEntry, type PortfolioEntry }` from the portfolio store (read-only); every other import form is rejected at module load. The CTAD allowlist also permits `@/governance/architectureAttachmentStore` (Phase 2 — many-to-many ADC ↔ architecture links; the store mutates only its own document and carries no decision-pipeline coupling).
- `governance/architectureAttachmentInvariants.test-shape.ts` — locks the attachment-store schema (`att-1.0`), runs an isolated-storage probe asserting attach idempotency, many-to-many independence, the empty-binding-leak detach rule, and rejection of malformed identifiers.
- `acw/acwIsolationInvariants.test-shape.ts` — ACW workspace imports nothing from the decision pipeline.
- `acw/acwGrammar*Invariants.test-shape.ts`, `acw3DStructureInvariants.test-shape.ts`, `acw3DForbiddenSemantics.test-shape.ts` — ACW grammar / structure / vocabulary locks.
- `acw/track3/acwTrack3IsolationInvariants.test-shape.ts`, `…StructureInvariants…`, `…ForbiddenSemantics…`, `…RendererIsolationInvariants…`, `…FocusIsolationInvariants…`, `…ViewPrefsInvariants…` — Track 3 isolation, derivation purity, structural identity, forbidden semantics.
- `governance/togafContainmentInvariants.test-shape.ts` — Phase 6 refusal lattice + no-new-portfolio-field.
- `cncf/cncfIsolationInvariants.test-shape.ts` — CNCF module is read-only with respect to CTAD; only `cncfApplyService.ts` may mutate the applied-cards / constraints stores.

## Design Principles

- **Strict stratification** — upper layers only read from lower layers; no upper layer influences lower-layer derivation.
- **Immutability of frozen decisions** — once frozen, ADS/ECP cannot be edited.
- **Deterministic derivation** — same inputs always yield identical output (grammar engine and DiagramSpec compiler).
- **Read-only views** — Portfolio, Signals, Reflection, Exposure, Containment, Track 3 derived view are strictly read-only on the decision plane.
- **Non-authority of CTAD** — CTAD never writes back to ADS/ECP/portfolio/signals/exposure/containment/grammar engine.
- **Strict removability** — every phase / sibling plane is documented as a finite delete sequence that returns the bundle to its pre-phase state.
- **Structural identity** — both 2D and 3D Track 3 renderers consume the same in-memory `DiagramSpec` through a single helper so they cannot diverge.
- **Build-time refusals over runtime checks** — invariants run at module load; regressions fail the bundle.

# External Dependencies

- **PostgreSQL** — primary database (scaffolded; not on decision path).
- **Drizzle ORM** — database interactions.
- **Orval** — generates the React Query client (`lib/api-client-react`) from `lib/api-spec/openapi.yaml`.
- **jspdf** — client-side PDF generation for ADS / ECP exports.
- **docx** — client-side DOCX generation for ADS / ECP exports.
- **ELK (`elkjs`)** — automatic graph layout for Track 3 derived diagrams.
- **React Three Fiber + three.js** — 3D canvas for ACW and Track 3 3D renderer.

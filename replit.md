# Overview

This project is a pnpm workspace monorepo using TypeScript, centered around the **Architecture Decision Canvas**. This system provides a deterministic, grammar-based approach to map organizational context, capability selections, and trade-off settings to a required set of architecture components, risks, and complexity indicators. Upon approval, it generates immutable governance artifacts (Architecture Decision Snapshot - ADS, and Execution Constraint Profile - ECP), records them in a portfolio, and allows for referencing by leadership-recorded policy signals, forming an institutional memory layer. The system is descriptive, not prescriptive, and does not make recommendations.

> For the canonical, full architecture reference — including the layer diagram, every module path, persistence contracts, and the end-to-end flow — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is structured as a pnpm workspace monorepo.

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

## Core Components

### Architecture Grammar Engine
`lib/architecture-grammar` is a pure TypeScript library encoding the core logic. It defines 7 canonical Capabilities and 18 canonical Components, along with rules for deriving architecture components, identifying dependencies, applying context constraints, and modifying complexity scores based on trade-offs. It also includes risk detection mechanisms. The main function `deriveArchitecture(context, capabilitySelections, tradeOffs)` serves as the entry point.

### Architecture Decision Canvas UI
`artifacts/canvas-ui` is a React + Vite web application with four main routes:
- **`/` (Wizard)**: A five-screen flow for creating and approving an Architecture Decision.
  - **ContextForm**: Collects `OrganisationContext`.
  - **CapabilitySelector**: Classifies all 7 capabilities.
  - **ArchitectureResultDisplay**: Displays derived components, risks, and complexity indicators based on baseline trade-offs.
  - **TradeOffExplorer**: Allows "What-If Exploration" of indicator scores based on alternative trade-off settings, while components and risks remain frozen.
  - **FreezeAndExport**: Terminal screen to freeze a decision, collect project metadata, generate ADS and ECP previews, and export artifacts. Freezing also writes the decision to the portfolio store.
- **`/portfolio` (Portfolio Governance)**: A read-only board of all approved decisions, offering sortable columns, filters, cross-portfolio summaries (Risk Concentration, Indicator Distribution), and viewers for ADS and ECP.
- **`/signals` (Policy Signals)**: A leadership-only interface for recording and tracking patterns observed across the approved portfolio using seven fixed signal categories with a three-state lifecycle (`Observed → Under Discussion → Acknowledged`). Signals can optionally link to portfolio entries.
- **`/reflection` (Reflective Governance View)**: A read-only observational view showing decision lineage, governance attention over time, and memory overview (including silence awareness), without making judgments or recommendations.
- **`/governance/containment` (Phase 6 Constitutional Layer)**: Read-only documentation of the TOGAF / ArchiMate non-authority position of ADC artefacts (docking table, mandatory disclaimer, advisory misuse playbook).
- **`/workspace/*` (ACW — Architecture Composition Workspace)**: An empty TOGAF-aligned workspace shell with five lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity) plus reusable 2D and 3D canvas primitives. Strictly isolated from the Decision Canvas pipeline by a build-time invariant; ships no architecture content.
- **`/ctad`, `/ctad/:adsId/:adsVersion` (CTAD — Conceptual Technology Architecture Design)**: The third peer plane alongside ADC and ACW. State-driven, non-wizard, reversible categorical exploration of the technology configurations permitted by an already-frozen architecture decision. Four collapsible sections (infrastructure, application, integration, cross-cutting), live `CTAD_STATE` JSON preview, and reference catalogues. Per-binding `localStorage` document at `ctad.state.v1` keyed by `${adsId}@${adsVersion}` with schema `ctad-1.0`. Records nothing back into ADS, ECP, the portfolio entry, signals, exposure, containment, or the grammar engine. Reads only `{ listEntries, type PortfolioEntry }` from the portfolio store; every other import form is rejected at module load by the CTAD isolation invariant. Has its own standalone vocabulary tier `CTAD_FORBIDDEN` (no approve / recommend / score / rank / mandate / must language) with a single spec-equality exemption for the brief-mandated empty-state sentence. Strictly removable to the pre-CTAD bundle. Reachable from `GlobalNav` between Decision Canvas and Portfolio, and from the third peer card on the landing page.
- **`/acw/derived`, `/acw/derived/:adsId/:adsVersion` (ACW Track 3 — Derived Structural Visualisation)**: A strictly read-only derived view that mechanically derives a structural diagram from `CTAD_STATE` plus a small projection of ADC bounds. Two renderers (2D SVG and 3D R3F) consume the same in-memory graph through the shared helper `enumerateLensVisibility(...)` so they cannot diverge. Per-binding view preferences (mode, perspective, hidden layers, camera) persist as `acw.track3.viewprefs.v1` (schema `acw-track3-viewprefs-1.0`); the diagram itself is never persisted — it is recomputed on every render. Four hardened invariants (isolation, derivation purity, structural identity, forbidden semantics) fail the bundle at module load if any regression is introduced. Standalone sibling vocabulary tier `ACW_TRACK3_FORBIDDEN` (no judgement / traffic-light / recommendation / prescription / ranking language) plus a vendor-name denylist on the label registry (so labels are generic, e.g. "Component-tree frontend" not "React-like frontend"). Stable, content-addressable node ids of the form `node:<sectionId>:<paramId>:<optionSlug>`. Strictly removable to the pre-Track-3 bundle. Reachable from `GlobalNav` ("Derived view") and from a per-row "Open derived view" CTA on the CTAD entry page.

## Governance & Persistence

- **Governance Export Layer**: Client-side TypeScript layer generating two artifacts:
    - **ADS (Architecture Decision Snapshot)**: 6 fixed sections, with a deterministic version hash based on core decision parameters.
    - **ECP (Execution Constraint Profile)**: 9 sections, category-level wording, with runtime validation.
    - **Exports**: PDF and DOCX generation using `jspdf` and `docx` libraries, including an integrity footer. All derivation and exports run client-side.
- **Governance Read-Models**: Decisions and signals are persisted into `localStorage` as reduced read-models (`adc.portfolio.v1` and `adc.policy-signals.v1` respectively). The ACW workspace persists a structural diagram document (`acw.workspace.v1`), and CTAD persists per-binding interpretive state (`ctad.state.v1`, schema `ctad-1.0`). None of these stores feed back into the grammar engine, ensuring it remains the single source of structural truth.
- **Governance Language Guard**: `src/governance/staticTextGuard.ts` enforces vocabulary constraints for static labels across the Portfolio, Signals, Reflective, Exposure, Containment, ACW, and CTAD surfaces, preventing judgmental or prescriptive language. Most tiers are stacked extensions of `PORTFOLIO_FORBIDDEN`; the `CTAD_FORBIDDEN` tier is intentionally standalone (sibling of every governance tier) because the CTAD plane is non-authoritative by construction.

## Design Principles

- **Strict Stratification**: Upper layers only read from lower layers; no upper layer influences lower layer derivation.
- **Immutability of Frozen Decisions**: Once a decision is frozen, it cannot be edited.
- **Deterministic Derivation**: The grammar engine guarantees the same inputs always yield the same output.
- **Read-Only Views**: Portfolio, Signals, and Reflection pages are strictly read-only for decision and signal data, providing observational insights without mutation capabilities.

# External Dependencies

- **PostgreSQL**: Used as the primary database.
- **Drizzle ORM**: Object-relational mapper for database interactions.
- **Orval**: API code generator from OpenAPI specifications.
- **jspdf**: Client-side library for generating PDF documents.
- **docx**: Client-side library for generating DOCX documents.
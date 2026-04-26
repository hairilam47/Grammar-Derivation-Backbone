# Overview

This project is a pnpm workspace monorepo centered on the Architecture Decision Canvas (ADC), a deterministic, grammar-based system for mapping organizational context and trade-offs to architecture components, risks, and complexity indicators. It generates immutable governance artifacts (Architecture Decision Snapshot - ADS, and Execution Constraint Profile - ECP) recorded in a portfolio. Alongside ADC, it features CTAD (Conceptual Technology Architecture Design) for reversible categorical technology exploration and ACW (Architecture Composition Workspace) for TOGAF-aligned structural visualization. The system is descriptive, not prescriptive.

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is a pnpm workspace monorepo, separating deployable surfaces (`artifacts/*`) from shared libraries (`lib/*`).

**Stack:**
- **Monorepo:** pnpm workspaces
- **Node.js:** 24
- **TypeScript:** ~5.9.2 (strict, project references)
- **Frontend:** React 19.1.0, Vite 7, Tailwind 4, lucide-react
- **3D/Canvas:** React Three Fiber, three.js, ELK (`@workspace/diagram-layout`)
- **API Framework:** Express 5 (`artifacts/api-server`)
- **Database (scaffolded):** PostgreSQL + Drizzle ORM 0.45
- **Validation:** Zod 3.25, `drizzle-zod`
- **API Codegen:** Orval (from `lib/api-spec/openapi.yaml`)
- **Client Export:** `jspdf` (PDF), `docx` (DOCX)
- **Build:** esbuild (server), Vite (browser)

**Key Features & Components:**

- **ADC Workflow:** A five-screen wizard (`/`) for generating ADS and ECP documents, including ContextForm, CapabilitySelector, ArchitectureResultDisplay, TradeOffExplorer, and FreezeMetadataForm. Exports PDF/DOCX and records to a portfolio.
- **Portfolio (`/portfolio`):** Read-only board of approved decisions with filtering, sorting, cross-portfolio summaries (Risk Concentration, Indicator Distribution), and modal viewers for ADS/ECP.
- **Signals (`/signals`):** Leadership-only policy signal recorder with fixed categories and a defined lifecycle.
- **Reflection (`/reflection`):** Read-only observational view of decision lineage and governance.
- **Decision Exposure View (`/exposure/:adsId`):** Renders dynamic views of decisions from a single `PortfolioEntry`.
- **Governance Containment (`/governance/containment`):** Constitutional layer for TOGAF/ArchiMate non-authority docking and misuse guidance.
- **Architecture Composition Workspace (ACW) (`/workspace/*`):** TOGAF-aligned workspace with multiple lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity, EAStudio canvas). It supports 2D and 3D canvas primitives and includes features like fullscreen lenses, semantic node binding, and a four-domain Studio canvas (Business, Data, Application, Technology). ACW nodes can carry `boundParam` and `boundTechnologyCategory` for semantic binding to CTAD.
- **Conceptual Technology Architecture Design (CTAD) (`/ctad`):** A state-driven, non-wizard interface for reversible categorical exploration of technology configurations. It supports both ADC-bound and standalone Architecture Workspaces, sharing five collapsible sections and environments. CTAD manages its state in `localStorage` and integrates with a CNCF Apply Layer for evaluating technology cards. Environments are first-class citizens in CTAD.
- **ACW Track 3 (`/acw/derived`):** A strictly read-only derived structural view that compiles `DiagramSpec` from `CTAD_STATE`, performs ELK layout, and renders in 2D SVG or 3D R3F. It supports full-page architecture canvases and architecture-specific view preferences.
- **Governance & Persistence:** Client-side TS layers for building ADS/ECP, client-side PDF/DOCX export, and dedicated `localStorage` stores for portfolio entries, policy signals, and architecture attachments. A static-text governance guard enforces vocabulary tiers.
- **Build-Time Invariants:** Uses `*Invariants.test-shape.ts` modules to enforce strict architectural rules and isolation at module load, ensuring structural integrity and preventing regressions.

**Design Principles:**
- **Strict stratification:** Upper layers only read from lower layers.
- **Immutability:** Frozen decisions cannot be edited.
- **Deterministic derivation:** Consistent outputs from identical inputs.
- **Read-only views:** Most governance views are strictly read-only.
- **Non-authority of CTAD:** CTAD never writes back to governance artifacts.
- **Strict removability:** Phased features can be removed without affecting core functionality.
- **Structural identity:** 2D and 3D renderers use the same data for consistency.
- **Build-time refusals:** Invariants fail the build on regressions.

# External Dependencies

- **PostgreSQL:** Primary database (scaffolded).
- **Drizzle ORM:** For database interactions.
- **Orval:** Generates API client code.
- **jspdf:** Client-side PDF generation.
- **docx:** Client-side DOCX generation.
- **ELK (`elkjs`):** Automatic graph layout for diagrams.
- **React Three Fiber + three.js:** For 3D canvas rendering.
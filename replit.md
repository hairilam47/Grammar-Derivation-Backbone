# Overview

This project is a pnpm workspace monorepo built with TypeScript, centered around the **Architecture Decision Canvas (ADC)**. ADC is a deterministic, grammar-based system that translates an organization's context, capability choices, and trade-off settings into architectural components, risks, and complexity indicators. Approved decisions are stored as immutable governance artifacts (Architecture Decision Snapshot - ADS, and Execution Constraint Profile - ECP) within a portfolio. Complementing ADC are **CTAD** (Conceptual Technology Architecture Design) for reversible technology exploration, and **ACW** (Architecture Composition Workspace) for TOGAF-aligned structural visualization. The system is descriptive, not prescriptive.

The project's vision is to provide a robust and auditable system for managing architectural decisions, enabling clear governance, reducing architectural drift, and facilitating communication across technical and business stakeholders.

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is structured as a pnpm workspace monorepo, separating deployable surfaces (`artifacts/*`) from shared libraries (`lib/*`).

## Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** React 19.1.0, Vite 7, Tailwind 4, `lucide-react`, React Three Fiber, three.js
- **Backend:** Express 5 (for `artifacts/api-server`)
- **Database (scaffolded):** PostgreSQL, Drizzle ORM 0.45
- **TypeScript:** ~5.9.2 (strict, project references)
- **Validation:** Zod 3.25
- **API Codegen:** Orval (from OpenAPI spec)
- **Client Export:** `jspdf` (PDF), `docx` (DOCX)
- **Build:** esbuild (server), Vite (browser)

## Repository Layout

- `artifacts/`: Contains deployable applications (e.g., `canvas-ui` for the main product, `api-server`, `mockup-sandbox`).
- `lib/`: Houses shared libraries (e.g., `architecture-grammar` for the core engine, `diagramspec`, `diagram-layout`, `cncf-catalog`, `api-spec`).
- `docs/ARCHITECTURE.md`: Canonical architecture reference.

## Key Features & Design Patterns

### Architecture Decision Canvas (ADC)
- **Wizard Flow:** Guides users through Context, Capability selection, Result Display, Trade-off exploration, and Freeze metadata to generate ADS/ECP.
- **Output:** Exports PDF and DOCX with integrity footer; records to portfolio.
- **Read-Only Views:** Portfolio, Signals, Reflection, Exposure, Containment views are strictly read-only after decisions are frozen.
- **Governance:** Immutability of frozen decisions; deterministic derivation of ADS/ECP.

### Architecture Composition Workspace (ACW)
- **TOGAF-aligned Workspace:** Provides multiple lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity) and an EAStudio canvas.
- **EAStudio Canvas:** Supports interactive editing with business entities, zones, systems, and components. Features include node properties, connection management (CONNECTS), and multiple view tabs (Design, Matrix, Export).
- **EAStudio Visual Theme (Task #99):** `/workspace/studio` aligns to the prototype HTML in `attached_assets/ea_studio_full_platform_*.html`. CSS lives in `artifacts/canvas-ui/src/index.css` under the `.eastudio-root` scope using `es-*` class names and CSS variables (`--bg`, `--bg2`, `--border3`, `--accent`, `--danger`, etc.). Restyling is render-side only — store, grammar, validator, invariants, and the `acw-1.0` schema are unchanged. Iconography is `lucide-react` only (no emoji). Phase 1–3 functionality (palette, four-zone canvas, properties panel, matrix, export, sample seed) is preserved. The Sample seed in `acw/studioActions.ts` emits the prototype-exact four CONNECTS pairs and aborts on the first validator refusal, surfacing the refusal verbatim through the existing channel. The studio palette is collapsible via a chevron in the title row; the right-side global nav is unaffected. The Export view shows three cards (JSON, CSV, Architecture Summary) plus a meta line `Architecture snapshot · n components · n connections`. The connect-mode arms a dashed temporary line from the source-node centre to the live cursor (`StudioEdgeOverlay` `.es-edge-temp`). Edge deletion is two-step: click selects, then explicit Delete/Cancel buttons confirm. Zone count badges flatten all recursive descendants of the domain container.
- **Technology-aware Semantic Binding:** ACW nodes can be semantically bound to CTAD parameters and technology categories, with icons sourced from a vendor-neutral registry.
- **Isolation Invariant:** ACW workspace modules are strictly isolated from the decision pipeline to prevent unintended influence.

### Conceptual Technology Architecture Design (CTAD)
- **State-driven Exploration:** Non-wizard, reversible categorical exploration of technology configurations.
- **Modes:** Supports ADC-bound workspaces (anchored to frozen ADC decisions) and standalone Architecture Workspaces.
- **Environments:** First-class concept for defining and managing different environments (e.g., development, production) with hosting models.
- **CNCF Apply Layer:** Integrates vendor-neutral CNCF reference cards for contextual constraints and audit logging.
- **Non-Authority:** CTAD never writes back to ADC/governance artifacts.

### Derived Views (ACW Track 3)
- **Read-Only Structural View:** Compiles `CTAD_STATE` into `DiagramSpec`, uses ELK for layout, and renders in both 2D SVG and 3D R3F.
- **Decoupled:** Can operate on CTAD architectures independently of ADC bounds.
- **Full-page Canvas:** Features a full-page architecture canvas with floating overlays for controls.
- **Derivation Purity:** Strictly read-only, ensuring that derived views cannot influence the source state.

### Design Principles
- **Strict Stratification:** Upper layers only read from lower layers.
- **Immutability:** Frozen decisions (ADS/ECP) cannot be edited.
- **Deterministic Derivation:** Same inputs always yield identical output.
- **Read-Only Views:** All governance and derived views are strictly read-only.
- **Non-Authority of CTAD:** CTAD does not influence ADC or governance.
- **Strict Removability:** Each feature or phase is designed for independent removal.
- **Build-Time Refusals:** Invariants are checked at module load, failing the build on regression.

# External Dependencies

- **PostgreSQL:** Primary database.
- **Drizzle ORM:** Database interaction.
- **Orval:** API client generation.
- **jspdf:** Client-side PDF generation.
- **docx:** Client-side DOCX generation.
- **ELK (elkjs):** Graph layout algorithm.
- **React Three Fiber / three.js:** 3D rendering.
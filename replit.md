# Overview

This project is a pnpm workspace monorepo built with TypeScript, designed to manage architectural decisions systematically. It provides a robust and auditable system for architectural governance, aiming to reduce architectural drift and enhance communication among stakeholders.

The system comprises three main components:
- **Architecture Decision Canvas (ADC):** A decision-recording discipline that generates immutable architecture decision snapshots (ADS) and execution constraint profiles (ECP) based on organizational context and capability selections.
- **Conceptual Technology Architecture Design (CTAD):** A conceptual abstraction layer for reversible, categorical exploration of technology configurations, independent of ADC artifacts.
- **Architecture Composition Workspace (ACW):** An architecture description surface providing various viewpoints aligned with TOGAF domains, facilitating interactive design and validation against correspondence rules.

The project's vision is to provide a robust and auditable system for managing architectural decisions, enabling clear governance, reducing architectural drift, and facilitating communication across technical and business stakeholders.

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is structured as a pnpm workspace monorepo, separating deployable applications (`artifacts/`) from shared libraries (`lib/`).

## Stack

- **Monorepo:** pnpm workspaces
- **Frontend:** React 19.1.0, Vite 7, Tailwind 4, `lucide-react`, React Three Fiber, three.js
- **Backend:** Express 5
- **Database (scaffolded):** PostgreSQL, Drizzle ORM 0.45
- **TypeScript:** ~5.9.2
- **Validation:** Zod 3.25
- **API Codegen:** Orval
- **Client Export:** `jspdf`, `docx`
- **Build:** esbuild (server), Vite (browser)

## Key Features & Design Patterns

### Architecture Decision Canvas (ADC)
- **Wizard Flow:** Guides users through context, capability selection, trade-off analysis, and freezing decisions to generate ADS/ECP.
- **Output:** Exports PDF and DOCX; records decisions to a portfolio.
- **Immutability:** Frozen decisions are read-only to ensure governance and traceability.

### Architecture Composition Workspace (ACW)
- **TOGAF-aligned Workspace:** Offers multiple lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity) and an EAStudio canvas.
- **EAStudio Canvas:** Supports interactive editing of business entities, zones, systems, and components with node properties and connection management.
- **Semantic Binding:** ACW nodes can be bound to CTAD parameters and technology categories.
- **Right-click Technology Swap:** Allows dynamic swapping of bound technologies on nodes.
- **Organizational Unit (OU) Overlay:** Visualizes organizational unit assignments on nodes with categorical color-coding.
- **Level of Specification (LoS) Framework:** Toggles between L1 (Business), L2 (Application), and L3 (Technology) views, with an L3 generator for technology-specific nodes.
- **Palette Tile-level Technology Bindings:** Default technology bindings for palette tiles, applied on drop.
- **Stepwise Authoring Wizards:** Guided wizards for adding elements and relationships.
- **Isolation Invariant:** ACW modules are strictly isolated from the decision pipeline.

### Conceptual Technology Architecture Design (CTAD)
- **State-driven Exploration:** Non-wizard, reversible exploration of technology configurations.
- **Workspaces:** Supports ADC-bound and standalone architecture workspaces.
- **Environments:** Manages different environments and hosting models.
- **Non-Authority:** CTAD does not influence ADC or governance artifacts.

### Derived Views (ACW Track 3)
- **Read-Only Structural View:** Compiles `CTAD_STATE` into `DiagramSpec`, using ELK for layout, rendered in 2D SVG and 3D R3F.
- **Decoupled:** Operates independently of ADC bounds.
- **Derivation Purity:** Strictly read-only to prevent state modification.

### Dev-only seeding
- **`/seed-all`** (development builds only): a deterministic fixture seeder that populates ADC portfolio (3 frozen decisions: Customer Portal Modernization, Enterprise Data Lake, Regulatory Compliance Hub), CTAD (1 ADC-bound binding on `customer-portal-modernization@v1` + 2 standalone architectures `nextgen-platform-deadbeef` and `mobile-first-architecture-cafef00d`), 2 CNCF apply-cards on the bound binding (`cncf:kubernetes`, `cncf:vitess`), ACW workspace (4 sealed domain quadrants + 9 palette-tile children + 2 CONNECTS edges + 2 OU bindings + 1 boundParam rebinding), 2 organisational units (`ou-engineering`, `ou-compliance`), per-lens view-state (Application domain pre-selected at LoS L2, Technology container collapsed; OU overlay intentionally OFF), Track 3 per-architecture view-prefs (3D mode, `all` perspective, infrastructure + ops layers hidden), and 3 policy signals across the three lifecycle stages (Risk Accumulation → Under Discussion; Posture Drift → Observed; Dependency Concentration → Acknowledged). Routes EXCLUSIVELY through validator-gated store APIs — no raw localStorage write for any governance / CTAD / ACW state. **Determinism contract:** running the seeder twice produces a byte-identical localStorage snapshot. Achieved via hard-coded ids (architecture ids carry an 8-hex stable suffix satisfying `ARCHITECTURE_ID_REGEX`) plus a `withFrozenClock()` wrapper that, for the duration of the synchronous run, freezes `Date`, `Date.now()`, `Math.random()`, and `crypto.randomUUID()` to deterministic counter-driven outputs. A module-load probe (`src/dev/seedAllInvariants.test-shape.ts`, gated to `import.meta.env.DEV`) snapshots-and-restores the seeded keys, runs `seedAll()` twice, and asserts byte-identical persisted state across both runs. The page exposes a `Run probe` button that wraps the same snapshot/restore probe so visual checks can verify the seeder runs cleanly without polluting the developer's browser state. The route is gated on `import.meta.env.DEV` and is not registered or bundled in production builds.

### Design Principles
- **Strict Stratification:** Upper layers read only from lower layers.
- **Immutability:** Frozen decisions are uneditable.
- **Deterministic Derivation:** Consistent output from identical inputs.
- **Read-Only Views:** All governance and derived views are strictly read-only.
- **Non-Authority of CTAD:** CTAD does not influence ADC.
- **Build-Time Refusals:** Invariants are checked at module load to prevent regressions.

### Visual System
- **Typography:** Inter sans and JetBrains Mono.
- **Surface Tokens:** Multi-stop shadow ramp, restrained accent gradients, and surface gradients.
- **Motion Tokens:** Configurable motion durations and ease functions, with reduced motion preference support.
- **Glass Utilities:** `glass-surface`, `glass-header`, `glass-rail` for overlays and chrome.
- **Interaction Utilities:** `lift`, `interactive`, `ui-transition`, `nav-active-bar`, `brand-mark`, `route-fade-in`.
- **Shared Header:** Canonical `AppHeader.tsx` for brand mark, page title/subtitle.
- **App Shell:** Collapsible left sidebar (`AppSidebar` + `AppShell`) for navigation, with persistence to `localStorage`.

# External Dependencies

- **PostgreSQL:** Primary database.
- **Drizzle ORM:** Database interaction.
- **Orval:** API client generation.
- **jspdf:** Client-side PDF generation.
- **docx:** Client-side DOCX generation.
- **ELK (elkjs):** Graph layout algorithm.
- **React Three Fiber / three.js:** 3D rendering.
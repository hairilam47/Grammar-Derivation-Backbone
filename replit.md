# Overview

This project is a pnpm workspace monorepo centered on the **Architecture Decision Canvas (ADC)**, a deterministic, grammar-based system for mapping organizational context, capability selections, and trade-off settings to architecture components, risks, and complexity indicators. Approved decisions are stored as immutable governance artifacts (Architecture Decision Snapshot - ADS, and Execution Constraint Profile - ECP) in a portfolio. Two peer systems, **CTAD** (Conceptual Technology Architecture Design) for reversible categorical technology exploration, and **ACW** (Architecture Composition Workspace) for TOGAF-aligned structural visualization, complement ADC. The system is descriptive, focusing on information presentation rather than prescriptive actions.

# User Preferences

I prefer iterative development. Ask before making major changes. I prefer detailed explanations. I do not want any changes to the `lib/architecture-grammar` library that would alter the 7 canonical Capabilities or the 18 canonical Components, or the core derivation rules (Rule A, B, C, D, and risk detection mechanisms).

# System Architecture

The project is a pnpm workspace monorepo. It adheres to a strict stratification design principle where upper layers only read from lower layers, ensuring no influence on lower-layer derivations. Decisions, once frozen, are immutable. The system emphasizes deterministic derivation, ensuring identical outputs for identical inputs. Most views (Portfolio, Signals, Reflection, Exposure, Containment, Track 3) are strictly read-only on the decision plane. CTAD is non-authoritative and does not write back to the core decision engine.

## Stack

- **Monorepo:** pnpm workspaces
- **Node.js:** 24
- **TypeScript:** ~5.9.2 (strict)
- **Frontend:** React 19.1.0, Vite 7, Tailwind 4, lucide-react
- **3D/Canvas:** React Three Fiber, three.js, ELK (`@workspace/diagram-layout`)
- **API Framework:** Express 5
- **Database (scaffolded):** PostgreSQL + Drizzle ORM 0.45
- **Validation:** Zod 3.25, `drizzle-zod`
- **API Codegen:** Orval (from `lib/api-spec/openapi.yaml`)
- **Client Export:** `jspdf` (PDF), `docx` (DOCX)
- **Build:** esbuild (server), Vite (browser)
- **Formatting/Linting:** Prettier 3.8

## Repository Layout

- **`artifacts/`:** Deployable surfaces (e.g., `canvas-ui` for the main application, `api-server`, `mockup-sandbox`).
- **`lib/`:** Shared libraries (e.g., `architecture-grammar` for the core engine, `diagramspec` compiler, `diagram-layout`, `cncf-catalog`, `api-spec`, `api-zod`, `api-client-react`, `db`).
- **`scripts/`:** Functional sanity scripts.
- **`docs/ARCHITECTURE.md`:** Canonical architecture reference.

## Key Features

- **ADC Workflow (`/`):** A five-screen wizard for context definition, capability selection, architecture result display, trade-off exploration, and decision freezing/exporting (ADS, ECP).
- **Portfolio (`/portfolio`):** Read-only board of approved decisions with cross-portfolio summaries.
- **Signals (`/signals`):** Leadership-only policy signal recorder with fixed categories and lifecycle.
- **Reflection (`/reflection`):** Observational view of decision lineage and governance attention.
- **Decision Exposure View (`/exposure/:adsId`):** Covers Phases 1-5 of decision exposure, re-derived on every render.
- **Governance Containment (`/governance/containment`):** Constitutional layer for TOGAF/ArchiMate non-authority docking.
- **ACW (`/workspace/*`):** TOGAF-aligned workspace with multiple lens views and 2D/3D canvas primitives. It includes an EAStudio canvas for interactive editing with specific node properties, validations, and view-state management. ACW nodes can carry `boundParam` and `boundTechnologyCategory` for semantic linking.
- **CTAD (`/ctad`, `/ctad/:adsId/:adsVersion`, `/ctad/arch/:architectureId`):** Third peer plane for reversible categorical technology exploration. It supports both ADC-bound and standalone architecture workspaces. Environments are first-class concepts, distinct from categorical sections.
- **ACW Track 3 (`/acw/derived`, `/acw/derived/arch/:architectureId`):** Strictly read-only derived structural view of CTAD states, compiled into `DiagramSpec` and laid out by ELK for 2D/3D rendering.

## Governance & Persistence

- **Governance Export Layer:** Client-side generation of ADS and ECP documents (PDF/DOCX) with integrity footers. Versioning is based on core decision inputs, not project metadata.
- **Portfolio Store (`adc.portfolio.v1`):** Stores approved decisions with strict field validation.
- **Signals Store (`adc.policy-signals.v1`):** Records policy signals with a forward-only lifecycle and strict field validation.
- **Static-text governance guard:** Enforces vocabulary tiers across the application to maintain consistent and appropriate language.

## Build-Time Invariants

The system utilizes `*Invariants.test-shape.ts` modules that run at module load to enforce architectural rules and prevent regressions. These invariants ensure strict isolation between different subsystems (e.g., CTAD from the decision pipeline, ACW from the decision pipeline), grammar correctness, structural integrity, and adherence to forbidden semantics.

# External Dependencies

- **PostgreSQL:** Primary database (scaffolded).
- **Drizzle ORM:** Used for database interactions.
- **Orval:** API client generation from OpenAPI specifications.
- **jspdf:** Client-side PDF generation.
- **docx:** Client-side DOCX generation.
- **ELK (`elkjs`):** Graph layout algorithm for diagrams.
- **React Three Fiber + three.js:** For 3D canvas rendering.
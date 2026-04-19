# Overview

This project is a pnpm workspace monorepo using TypeScript, centered around the **Architecture Decision Canvas**. This system provides a deterministic, grammar-based approach to map organizational context, capability selections, and trade-off settings to a required set of architecture components, risks, and complexity indicators. Upon approval, it generates immutable governance artifacts (Architecture Decision Snapshot - ADS, and Execution Constraint Profile - ECP), records them in a portfolio, and allows for referencing by leadership-recorded policy signals, forming an institutional memory layer. The system is descriptive, not prescriptive, and does not make recommendations.

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

## Governance & Persistence

- **Governance Export Layer**: Client-side TypeScript layer generating two artifacts:
    - **ADS (Architecture Decision Snapshot)**: 6 fixed sections, with a deterministic version hash based on core decision parameters.
    - **ECP (Execution Constraint Profile)**: 9 sections, category-level wording, with runtime validation.
    - **Exports**: PDF and DOCX generation using `jspdf` and `docx` libraries, including an integrity footer. All derivation and exports run client-side.
- **Governance Read-Models**: Decisions and signals are persisted into `localStorage` as reduced read-models (`adc.portfolio.v1` and `adc.policy-signals.v1` respectively). These stores are for display and reasoning only and do not feed back into the grammar engine, ensuring it remains the single source of structural truth.
- **Governance Language Guard**: `src/governance/staticTextGuard.ts` enforces vocabulary constraints for static labels across the Portfolio, Signals, and Reflective views, preventing judgmental or prescriptive language.

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
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
- **5-Step Wizard Flow:** Context → Modules → Requirements Capture → Trade-Offs → Freeze. The Modules step CRUDs the Module Catalogue (`moduleCatalogStore`, schema `mod-1.0`); the Requirements Capture step CRUDs Requirements (`requirementsStore`, schema `req-1.0`) with type / Urgency tags, optional hardware details, module links, and approval gating; capability selections for the trade-off step are auto-derived from each module's `relatedCapabilityIds`.
- **Dual Freeze (Step 5):** "Freeze Requirements" calls `requirementsContractStore.freezeContract` (schema `rc-1.0`) — atomic with the requirements-store approved → frozen flip and idempotent on the same approved set. "Freeze Decision" builds the ADS/ECP and persists a portfolio entry via `addOrUpdateEntry(entryFromADS(ads, contractId?))`, optionally linking the requirements contract.
- **Urgency Vocabulary:** UI labels Routine / Standard / Elevated / Acute (internal enum stays `low` / `medium` / `high` / `critical`); a dedicated `URGENCY_FORBIDDEN` tier in `staticTextGuard.ts` bans Severity / Priority / Blocker / ASAP framing.
- **Build-Time Invariants:** All three governance stores ship `*.test-shape` modules wired into `App.tsx` as side-effect imports (allow-list shape, schema-version lock, validator-rejection probes, idempotent-freeze, isolated-storage snapshots).
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

### Multi-tenant Scoping (SaaS Onboarding)
- **Onboarding flow:** OrgSelector → WorkItemDashboard → WorkspaceHub. Every tool route is gated on an active `(orgId, workItemId)` scope; localStorage keys for tenant-scoped stores are prefixed `<orgId>:<base>` or `<orgId>:<workItemId>:<base>`.
- **Organisation registry:** `orgStore` (schema `org-1.0`). Supports `createOrganisation`, `renameOrganisation` (preserves slug across renames), and `deleteOrganisation` (sweeps every `<orgId>:*` key and clears the active-scope pointer when it targets the deleted org). Idempotent on repeat calls.
- **Work-Item registry:** `workItemStore` (schema `wi-1.0`). Supports `createWorkItem`, `renameWorkItem`, `archiveWorkItem` / `unarchiveWorkItem`. Archived rows are hidden from the dashboard but retain their scoped data; the EA Blueprint cannot be archived. The `archived` field is optional on the wire (pre-archive documents validate without a schema-version bump) and read-side normalised to `false`.
- **UI surfaces:** Topbar org chip carries a Rename / Delete dropdown; the WorkItemDashboard offers per-row Rename + Archive (Unarchive when archived) menus and a "Show archived" toggle. Delete-Organisation requires typing the exact org name to enable the destructive submit.
- **Build-time invariants:** `orgStoreInvariants.test-shape.ts` and `workItemStoreInvariants.test-shape.ts` cover rename / archive / delete idempotency, scoped-key sweep, unrelated-org isolation, and the EA-Blueprint-cannot-be-archived rule.

### Dev-only seeding
- **`/seed-all`** (dev builds only, gated on `import.meta.env.DEV`): a deterministic fixture seeder that populates ADC, CTAD, ACW, OUs, view-state, Track 3 prefs, and governance signals, all routed through validator-gated public store APIs. Determinism contract: re-running the seeder produces a byte-identical localStorage snapshot, via hard-coded ids and a synchronous `withFrozenClock()` wrapper that freezes `Date`, `Date.now`, `Math.random`, and `crypto.randomUUID`. A module-load probe (`src/dev/seedAllInvariants.test-shape.ts`) snapshots-and-restores the seeded keys, runs `seedAll()` twice, and asserts byte-identical persisted state. Append `?auto=1` to auto-run on mount.

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

# Design-Time Tooling (.agents/skills/)

Separate from the runtime ADC / CTAD / ACW stack above, the project hosts an eight-skill **cross-layer design-model family** under `.agents/skills/`. These are author-time tools that read and write a single shared file, `designs/system-model.yaml`, and emit PlantUML diagrams plus markdown reports into `designs/`. They never touch the runtime app, never write to `localStorage`, and never ship in any browser bundle.

The family:

- `design-model` — foundation skill. Owns the YAML schema, the cross-layer ID grammar (`actor:`, `entity:`, `process:`, `service:`, `function:`, `module:`, `flow:`, `node:`, `usecase:`, `story:`), and the validator that checks ID uniqueness, grammar conformance, and cross-reference resolution.
- `erd-design` — `entities[]` (data layer).
- `bpmn-design` — `processes[]` (business / process layer).
- `system-design` — `services[]`, `functions[]`, `flows[]` (application layer, runtime view).
- `code-structure-design` — `modules[]` (application layer, code-organisation view).
- `use-case-design` — `usecases[]` (UML-style goal layer).
- `user-story-design` — `stories[]` (agile-backlog layer; new in Task #130).
- `enterprise-architecture` — capstone orchestrator. Owns `technology.nodes[] / environments[] / runtimes[]` and emits the layered overview diagram (`designs/diagrams/ea-overview.puml`) plus the end-to-end traceability report (`designs/ea-traceability.md`).

## Task #130 update — User Story Design Skill + EA Requirements layer

The most recent additions to the family:

- **New `user-story-design` skill.** Validator-first generator that emits `designs/stories.md` (always) and per-epic `designs/features/<epic>.feature` files (with `--gherkin`). Stories use the Connextra template (`role` / `goal` / `benefit` are required), MoSCoW priority, and optional Fibonacci or t-shirt points. Acceptance criteria are written as Gherkin `given / when / then` triples that round-trip directly into Cucumber-family BDD tooling.
- **EA orchestrator promoted to five layers.** Requirements → Business → Data → Application → Technology, replacing the prior four-layer stack. The overview diagram now opens with a Requirements rectangle on top (stories nested by epic, use cases nested by system) and draws transitive `usecase → task` arrows that terminate at the specific BPMN task being implemented. The traceability report opens each process with a Requirements subsection listing the stories and use cases that trace down into it.
- **Foundation widening.** `validate.mjs` gained the `story:` kind and four new cross-references: `story.role → actor`, `story.realizes[] → usecase`, `story.implementedBy[] → function`, `story.dependsOn[] → story`.
- **Two new informational gap categories.** `storiesWithoutUsecase` and `usecasesWithoutStory` are reported in the EA gap summary but are explicitly excluded from `--strict`'s exit-1 total — a story can intentionally trace to no use case (pure-plumbing work), and an early-stage use case can sit story-less without breaking the build.
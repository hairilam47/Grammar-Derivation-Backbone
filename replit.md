# Overview

This project is a pnpm workspace monorepo designed to systematically manage architectural decisions, reduce architectural drift, and enhance communication among stakeholders. It provides a robust and auditable system for architectural governance. The system comprises three main components: the **Architecture Decision Canvas (ADC)** for generating immutable architectural snapshots, the **Conceptual Technology Architecture Design (CTAD)** for exploring technology configurations, and the **Architecture Composition Workspace (ACW)** for interactive design and validation against TOGAF domains. The vision is to provide clear governance and facilitate communication across technical and business stakeholders.

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
- **5-Step Wizard Flow:** Guides users through Context, Modules, Requirements Capture, Trade-Offs, and Freeze steps.
- **Dual Freeze:** Freezes requirements and decisions, persisting immutable architecture decision snapshots (ADS) and execution constraint profiles (ECP).
- **Urgency Vocabulary:** Uses specific terms (Routine, Standard, Elevated, Acute) for urgency, avoiding terms like Severity or Priority.
- **Immutability:** Frozen decisions are read-only to ensure governance and traceability.

### Architecture Composition Workspace (ACW)
- **TOGAF-aligned Workspace:** Offers multiple lens views (Context & Domain, System Landscape, Integration, Deployment & Infrastructure, Operations & Continuity) and an EAStudio canvas for interactive editing.
- **Semantic Binding:** Nodes can be bound to CTAD parameters and technology categories, allowing dynamic technology swapping.
- **Level of Specification (LoS) Framework:** Toggles between L1 (Business), L2 (Application), and L3 (Technology) views.
- **Isolation Invariant:** ACW modules are strictly isolated from the decision pipeline.

### Conceptual Technology Architecture Design (CTAD)
- **State-driven Exploration:** Enables reversible exploration of technology configurations without wizards.
- **Workspaces:** Supports both ADC-bound and standalone architecture workspaces.
- **Non-Authority:** CTAD does not influence ADC or governance artifacts.

### Derived Views (ACW Track 3)
- **Read-Only Structural View:** Compiles `CTAD_STATE` into `DiagramSpec` for 2D SVG and 3D R3F rendering, using ELK for layout.
- **Decoupled:** Operates independently of ADC bounds, ensuring derivation purity.

### Multi-tenant Scoping (SaaS Onboarding)
- **Onboarding Flow:** Manages organizations and work items, with all tool routes gated on an active `(orgId, workItemId)` scope.
- **Organisation and Work-Item Registry:** Manages creation, renaming, archiving, and deletion of organizations and work items, with mechanisms for data integrity and isolation.
- **Server-backed Tenant Storage:** `api-server` (Express + Fastify-pino) persists tenants and scoped documents to a JSON store at `artifacts/api-server/.data/tenant-store.json` (path resolved from the bundle's location, not from cwd; gitignored).
- **Browser Storage Client (`scopedStorageClient.ts`):** Three-tier storage — L1 in-memory cache, L2 localStorage, L3 api-server. Reads are sync (L1 with L2 fallback). Writes update L1+L2 immediately and fire-and-forget to L3. Scope changes trigger an async `hydrateScope()` that GETs the whole bag for the active scope, writes returned docs into L1+L2, AND prunes any L1/L2 keys under that scope that the server did not return — so a doc deleted on another device cannot resurrect from a stale local cache. The org-scope prune is surgical: only `<org>:<baseKey>` keys are touched, never `<org>:<wi>:<…>` keys.
- **Store Wiring:** Every tenant-scoped store reads/writes through `readScoped` / `writeScoped` instead of `localStorage` directly, and uses `onScopeOrHydrationChange()` to invalidate its cache + notify React subscribers when EITHER the active scope flips OR a server hydration completes — so a fresh-device boot renders the server payload immediately instead of waiting for a manual scope toggle.
- **Legacy Migration:** One-shot `app:serverUpload.v1` sentinel uploads pre-existing localStorage tenants and scoped docs to the server on first run.

### Design Principles
- **Strict Stratification:** Upper layers read only from lower layers.
- **Immutability:** Frozen decisions are uneditable.
- **Deterministic Derivation:** Consistent output from identical inputs.
- **Read-Only Views:** All governance and derived views are strictly read-only.
- **Non-Authority of CTAD:** CTAD does not influence ADC.
- **Build-Time Refusals:** Invariants are checked at module load to prevent regressions.

### Visual System
- **Typography:** Inter sans and JetBrains Mono.
- **Surface Tokens:** Multi-stop shadow ramp, accent gradients, and surface gradients.
- **Motion Tokens:** Configurable motion durations and ease functions with reduced motion preference support.
- **Glass Utilities:** `glass-surface`, `glass-header`, `glass-rail` for overlays and chrome.
- **Interaction Utilities:** `lift`, `interactive`, `ui-transition`, `nav-active-bar`, `brand-mark`, `route-fade-in`.
- **App Shell:** Collapsible left sidebar for navigation with persistence to `localStorage`.

# External Dependencies

- **PostgreSQL:** Primary database.
- **Drizzle ORM:** Database interaction.
- **Orval:** API client generation.
- **jspdf:** Client-side PDF generation.
- **docx:** Client-side DOCX generation.
- **ELK (elkjs):** Graph layout algorithm.
- **React Three Fiber / three.js:** 3D rendering.
# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

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

## Architecture Grammar Engine

`lib/architecture-grammar` is a pure TypeScript logic library with no UI, no database, and no vendor names. It encodes:

- **7 canonical Capabilities** (frozen): External Access, Internal Admin, Case Management, Document Management, Workflow & Approval, Reporting & Analytics, Audit & Compliance
- **18 canonical Components** (frozen): each with `layer`, `complexityWeight`, and `operationalImpact`
- **Rule A**: Capability → required components (only IN_SCOPE capabilities fire)
- **Rule B**: Component → dependent components (transitive, fixed-point resolution)
- **Rule C**: Context constraints (e.g. Government + High Sensitivity always forces Immutable Audit Store)
- **Rule D**: Trade-off modifiers for `complexityScore`, `operationalOverheadScore`, `changeCostLaterScore` — no structural mutation
- **Risk detection**: fires on missing audit logging, unauthenticated external access, unprotected data stores, unmonitored government systems

Entry point: `lib/architecture-grammar/src/index.ts`  
Main function: `deriveArchitecture(context, capabilitySelections, tradeOffs) → ArchitectureResult`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run derive-example` — run the grammar engine example and print JSON output

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

---
name: design-model
description: Foundation for the cross-layer design-model family of skills. Defines the shared `designs/system-model.yaml` file, the cross-layer ID grammar (`entity:`, `process:`, `service:`, `function:`, `module:`, `actor:`, `flow:`, `node:`, `usecase:`, `story:`), and a validator that checks ID uniqueness, grammar conformance, and cross-reference resolution. Use this skill whenever the user mentions "design model", "shared model", "cross-layer model", "design schema", "design IDs", "system model", architecture-modelling that needs to span data, process, system, and code layers, or whenever any of the sibling skills (erd-design, bpmn-design, system-design, code-structure-design, use-case-design, user-story-design, enterprise-architecture) need to read or write the model. Use it even if the user asks to "set up architecture documentation that links business processes to functions to entities" — that's exactly what this skill seeds.
---

# Design Model Foundation

The seven design skills (`erd-design`, `bpmn-design`, `system-design`, `code-structure-design`, `use-case-design`, `user-story-design`, `enterprise-architecture`) all read from and write to one file: **`designs/system-model.yaml`**. This skill owns that file's schema, the ID grammar that links objects across layers, and the validator that keeps it honest.

Without this foundation, the focused skills produce isolated diagrams. With it, every business process can be traced down through the functions that implement it, the entities those functions read and write, the services that contain the functions, the modules those services live in, and (via the EA orchestrator) the deployment nodes those modules run on.

## When to load this skill

- The user mentions "design model", "shared model", "cross-layer model", "design schema", "design IDs", "system model".
- A sibling design skill is about to read or write `designs/system-model.yaml`.
- The user asks for end-to-end architecture documentation that ties business → data → application → code.
- An ID-grammar validation error needs to be diagnosed.

You do **not** need this skill for one-off ad-hoc diagrams that have no cross-layer references — use `mermaid-diagrams` or `c4-architecture` directly for those.

## What this skill produces (and does not)

| Produces | Does not produce |
|---|---|
| `designs/system-model.yaml` (created from the bundled template if missing). | Any diagrams. Each focused sibling skill emits its own PlantUML. |
| Validation reports listing exact unresolved cross-references. | Generated source code, migrations, ORM mappings, or scaffolding. |
| Documentation of every section, field, and ID kind. | Round-tripping from `.puml` files back into the model. |
| A reusable schema that drops cleanly into other repositories. | A UI inside the host project for editing the model. |

## Workflow

### 1. Bootstrap the model file

If `designs/system-model.yaml` does **not** exist in the project root, create it by copying the bundled template:

```bash
mkdir -p designs
cp .agents/skills/design-model/templates/system-model.template.yaml designs/system-model.yaml
```

Then edit `designs/system-model.yaml`:
- Replace the `metadata.name` with the host project's name.
- Delete the example actors/entities/processes/etc. or leave one as a worked example to extend.

If the file already exists, **do not overwrite it**. Read it, summarise what's there (counts per section, top-level IDs), and report back to the user before changing anything.

### 2. Add or modify sections

Each focused skill owns specific sections (see "Section ownership" below). When this foundation skill is loaded directly (no focused skill in play), make minimal changes that preserve cross-references. If a change would orphan a referenced ID, surface that to the user before writing.

### 3. Validate

After any write, run the validator:

```bash
node .agents/skills/design-model/scripts/validate.mjs designs/system-model.yaml
```

The validator exits non-zero on any error. Fix every error before declaring the model valid; warnings (e.g., orphan entities) can be left for the user to decide on.

### 4. Report

Tell the user exactly what changed: counts, new IDs, removed IDs, and the validator result. Never silently restructure existing IDs — that would break cross-references in any sibling skill's diagrams.

## Section ownership

| Section | Owned by skill | Foundation rule |
|---|---|---|
| `metadata` | this skill | Required. `name` and `version` are mandatory. |
| `actors` | this skill | Shared by `bpmn-design` and `system-design`. |
| `entities` | `erd-design` | This skill validates IDs and cross-refs only. |
| `processes` | `bpmn-design` | This skill validates IDs and cross-refs only. |
| `services`, `functions`, `flows` | `system-design` | This skill validates IDs and cross-refs only. |
| `modules` | `code-structure-design` | This skill validates IDs and cross-refs only. |
| `usecases` | `use-case-design` | This skill validates IDs and cross-refs only. |
| `stories` | `user-story-design` | This skill validates IDs and cross-refs only. |
| `technology` (deployment nodes, environments) | `enterprise-architecture` | Reserved here; the orchestrator owns its content. |

When this skill is loaded standalone (no sibling skill is active), it can scaffold any section but should keep edits minimal and clearly labelled in its summary back to the user.

## ID grammar

Every object has an ID of the form `<kind>:<name>`. The kind tags the object's type so any layer can reference any other layer unambiguously.

### Allowed kinds and naming

| Kind | Name style | Regex (after the colon) | Example |
|---|---|---|---|
| `actor` | PascalCase | `[A-Z][A-Za-z0-9]*` | `actor:Customer` |
| `entity` | PascalCase, optional namespace | `([a-z0-9-]+/)?[A-Z][A-Za-z0-9]*` | `entity:Order`, `entity:billing/Invoice` |
| `process` | kebab-case | `[a-z][a-z0-9-]*` | `process:place-order` |
| `pool` | kebab-case | `[a-z][a-z0-9-]*` | `pool:customer` |
| `lane` | kebab-case | `[a-z][a-z0-9-]*` | `lane:customer-self-service` |
| `task` | kebab-case | `[a-z][a-z0-9-]*` | `task:enter-cart` |
| `gateway` | kebab-case | `[a-z][a-z0-9-]*` | `gateway:payment-method` |
| `event` | kebab-case | `[a-z][a-z0-9-]*` | `event:order-submitted` |
| `service` | PascalCase | `[A-Z][A-Za-z0-9]*` | `service:OrderService` |
| `function` | `Service.method` | `[A-Z][A-Za-z0-9]*\.[a-z][A-Za-z0-9]*` | `function:OrderService.placeOrder` |
| `module` | kebab-case, optional path | `[a-z][a-z0-9-]*(/[a-z][a-z0-9-]*)*` | `module:checkout`, `module:checkout/cart` |
| `flow` | kebab-case | `[a-z][a-z0-9-]*` | `flow:place-order-happy-path` |
| `node` | kebab-case | `[a-z][a-z0-9-]*` | `node:k8s-prod-cluster` |
| `usecase` | kebab-case | `[a-z][a-z0-9-]*` | `usecase:order-food` |
| `story` | kebab-case | `[a-z][a-z0-9-]*` | `story:customer-orders-food` |

### Why this grammar

- **Kind prefix** makes every ID self-describing — a reader sees `function:OrderService.placeOrder` and instantly knows what they are looking at.
- **PascalCase for code-shaped things** (actors, entities, services, functions) matches the conventions of mainstream OO and FP languages, so generated diagrams read naturally next to source.
- **kebab-case for human-shaped things** (processes, tasks, flows) matches BPMN convention, URL slugs, and is friendly to non-developers reviewing the model.
- **`Service.method` for functions** keeps the link from a function back to its owning service explicit even when the function is referenced in isolation.
- **Namespacing slot** (`entity:billing/Invoice`, `module:checkout/cart`) is reserved now so future bounded-context work does not require renaming every ID in the model.

### Eight worked examples

```yaml
# 1. An actor — a person or external system that participates in processes
actors:
  - id: actor:Customer
    name: Customer
    type: person

# 2. An entity — a thing the system stores and manipulates
entities:
  - id: entity:Order
    name: Order

# 3. A process — a sequence of business work crossing actors and systems
processes:
  - id: process:place-order
    name: Place Order

# 4. A service — a logical grouping of related functions
services:
  - id: service:OrderService
    name: Order Service
    module: module:checkout

# 5. A function — a single operation exposed by a service
functions:
  - id: function:OrderService.placeOrder
    name: placeOrder
    service: service:OrderService

# 6. A module — a code-organisation boundary that contains services
modules:
  - id: module:checkout
    name: Checkout
    contains:
      - service:OrderService

# 7. A use case — a goal an actor achieves through the system
usecases:
  - id: usecase:order-food
    name: Order Food
    system: restaurant
    actors: [actor:Customer]

# 8. A user story — a thin vertical slice of value the team can ship
stories:
  - id: story:customer-orders-food
    role: actor:Customer
    goal: order food
    benefit: I can eat
    priority: must
    realizes: [usecase:order-food]
    implementedBy: [function:OrderService.placeOrder]
```

## Cross-reference fields

Cross-references are how the layers compose. The validator resolves every one of these and reports any that point at an ID that does not exist.

| Object kind | Field | Points at | Meaning |
|---|---|---|---|
| `process.tasks[]` | `implementedBy[]` | `function:` | Code that performs the task. |
| `process.tasks[]` | `consumes[]` / `produces[]` | `entity:` | Data the task reads or creates. |
| `process.tasks[]` | `lane` | `lane:` | Which swimlane owns the task. |
| `process.pools[].lanes[]` | `actor` | `actor:` | Who or what staffs the lane. |
| `process.events[]` / `gateways[]` | `lane` | `lane:` | Which swimlane the event/gateway sits in. |
| `process.flows[]` | `from` / `to` | `event:` \| `task:` \| `gateway:` | BPMN sequence-flow endpoints. |
| `entity.relationships[]` | `to` | `entity:` | The other end of the relationship. |
| `entity.attributes[]` | `foreignKey` | `entity:Name.attribute` | The referenced attribute. |
| `service` | `module` | `module:` | Where the service lives. |
| `service` | `exposes[]` / `consumes[]` | `function:` | Public surface and outbound calls. |
| `function` | `service` | `service:` | Owning service. |
| `function` | `reads[]` / `writes[]` | `entity:` | Data dependencies. |
| `function` | `flows[]` | `flow:` | Flows the function participates in. |
| `module` | `contains[]` | `service:` | Services that live in the module. |
| `module` | `allowedDependencies[]` / `forbiddenDependencies[]` | `module:` | Dependency policy. |
| `module` | `deployedTo[]` | `node:` | Deployment nodes the module runs on (EA orchestrator). |
| `flow` | `process` | `process:` | The business process the flow realises. |
| `flow` | `sequence[]` | `function:` | Ordered function calls along the flow. |
| `usecase` | `actors[]` | `actor:` | Actors that participate in the use case. |
| `usecase` | `include[]` | `usecase:` | Sub-use-cases this one always invokes (`<<include>>`). |
| `usecase.extend[]` | `usecase` | `usecase:` | Base use case this one optionally extends (`<<extend>>`). |
| `usecase` | `generalizationOf` | `usecase:` | Parent use case this one is a specialization of (UML generalization). |
| `story` | `role` | `actor:` | The actor whose voice the story speaks in ("As a Customer…"). |
| `story` | `realizes[]` | `usecase:` | Use cases the story incrementally delivers. |
| `story` | `implementedBy[]` | `function:` | Functions that ship the story. |
| `story` | `dependsOn[]` | `story:` | Other stories that must land before this one. |

The deployment direction is `module → node`, not `node → module`. `technology.nodes[]` is the registry of nodes that exist; `module.deployedTo[]` records where each module runs. Picking one direction prevents the model from disagreeing with itself.

### Why no top-level `crossReferences` section

Cross-references live on the objects themselves (a function knows what it reads; a module knows what it contains) rather than in a separate top-level `crossReferences` index. This keeps each object self-describing: reading one entry of `functions[]` tells you everything that function touches, with no need to grep elsewhere. A separate index would duplicate this information and inevitably fall out of sync with the inline fields. The validator builds whatever index it needs in memory at validate-time; consumers that want a flattened cross-reference report should compute it from the inline fields rather than maintain it by hand.

## Contract invariants

These are guaranteed by this foundation skill so sibling skills do not need to re-check them:

- Every ID is unique across the whole model and matches the regex for its kind.
- Every cross-reference field listed in the table above resolves to a registered ID of the expected kind.
- Function IDs and their declared `service` field agree (`function:X.y` ⇔ `service:X`).
- `foreignKey` strings on entity attributes resolve to a real attribute on a real entity.

Sibling skills are responsible for layer-specific invariants: ERD layout, BPMN well-formedness beyond endpoint resolution, code-structure cycles, sequence-diagram ordering, etc. Do not duplicate the invariants above in sibling validators — the foundation owns them and would diverge if reimplemented.

## Validation

The validator (`scripts/validate.mjs`) checks three things and reports each independently:

1. **ID uniqueness** — no two objects anywhere in the model share an ID.
2. **ID-grammar conformance** — every ID matches the regex for its kind. The kind in the prefix must match the section the object lives in (e.g., the IDs in `entities[]` must start with `entity:`).
3. **Cross-reference resolution** — every value in any of the cross-reference fields above points at an ID that exists somewhere in the model.

### Sample output

```
Validating designs/system-model.yaml…

Sections:
  ✓ metadata
  ✓ 3 actors
  ✓ 6 entities
  ✓ 2 processes
  ✓ 4 services
  ✓ 11 functions
  ✓ 3 modules

ERRORS (2):
  1. Cross-reference unresolved
     At:  processes[0].tasks[2].implementedBy[0]
     Got: function:PaymentService.chargeCard
     Hint: function:PaymentService.charge exists — typo?

  2. ID grammar violation
     At:  entities[3].id
     Got: "Order"
     Want: starts with "entity:" and matches /^entity:([a-z0-9-]+\/)?[A-Z][A-Za-z0-9]*$/

WARNINGS (1):
  1. Orphan entity: entity:LegacyAudit (no function reads or writes it)

VALIDATION FAILED.
```

The exit code is `0` on success (warnings allowed), `1` on any error, `2` on internal failure (unreadable file, missing parser).

### YAML parser dependency

The validator dynamically imports the [`yaml`](https://www.npmjs.com/package/yaml) package. If it is not installed in the host project, install it once:

```bash
pnpm add -D -w yaml
```

Or pass `--json` and feed a JSON file: `node validate.mjs --json designs/system-model.json`. The schema is identical; only the surface syntax changes.

## Live in this project (canvas-ui) and reusable elsewhere

This skill is reusable: dropping `designs/system-model.yaml` into any repository is enough to start. There are no canvas-ui-specific assumptions in the schema, the template, or the validator.

To seed the model for canvas-ui itself (separate from this task — do this only if explicitly asked):

1. Create `designs/system-model.yaml` from the template.
2. Set `metadata.name: Architecture Decision Canvas`.
3. Capture the obvious actors (`actor:Architect`, `actor:Reviewer`).
4. Hand off entity work to `erd-design`, process work to `bpmn-design`, service/function work to `system-design`, and module work to `code-structure-design`. Each will fill in its own section while leaving the IDs you have already established intact.

## Bundled files

```
.agents/skills/design-model/
├── SKILL.md                                  ← you are here
├── templates/
│   └── system-model.template.yaml            ← starter model with one of every kind
├── scripts/
│   └── validate.mjs                          ← validator
└── references/
    └── id-grammar.md                         ← long-form notes on the grammar
```

Read `references/id-grammar.md` whenever a user asks "why do IDs look like this?" or proposes an extension to the grammar. Do not extend the grammar without first updating that document and the validator's regex table together.

# BPMN Elements — Long-form Notes

This document explains the BPMN element vocabulary the skill exposes, the semantic distinctions that matter at design time, and the choices behind rendering them as PlantUML state diagrams.

## Why state diagrams instead of "real" BPMN

PlantUML has no first-class BPMN renderer. The available alternatives:

- **Activity diagrams** — support swimlanes (`|name|`) and structured branching (`if/endif`, `fork/end fork`), but enforce a tree structure. Real processes have joins and back-edges that activity-diagram syntax cannot express.
- **State diagrams** — express any directed graph, support composite states (used here for swimlanes), and carry stereotypes that we map to BPMN-flavoured colours and borders.
- **External BPMN tools** — bpmn.io, Camunda Modeler, Bizagi. Out of scope: we want a single text artefact in the repo, regenerated deterministically from the model.

State diagrams win because the generator can render any topology the model expresses without giving up on lanes.

## The five element kinds

### Pool

A pool represents an organisation, system, or participant that owns a portion of the process. Each pool has a name and a list of lanes. In the diagram each pool becomes a composite state grouping its lanes — the visual outcome is the conventional swimlane look.

Use one pool per autonomous participant. Two teams within the same company that share a CRM are usually one pool with two lanes; an external payment provider is a separate pool.

### Lane

A lane represents a role inside a pool — typically an `actor:` from the foundation actors registry. Lanes do not nest; if you find yourself wanting "lane within lane", split into two pools instead.

### Event

Events represent things that happen. The model recognises three types:

- `start` — entry point. Every process needs at least one. Multiple starts are valid (e.g., "received via email" and "received via API" can both initiate the same process).
- `intermediate` — something happens partway through (timer, received message, published message). Render as a state with the `<<event>>` stereotype; describe the trigger in the `name` field.
- `end` — exit point. Every process needs at least one; multiple ends are valid and useful (e.g., "happy path" and "rejected" both terminate the process).

### Task

A task is an atomic unit of work. The model lets a task declare:

- `lane` — who performs it.
- `implementedBy: [function:…]` — what code, if any, performs it. Empty means manual or not yet linked.
- `consumes: [entity:…]` and `produces: [entity:…]` — what data flows through it. The data layer (`erd-design`) owns the entities themselves; the BPMN layer just records which tasks touch them.

Sub-processes are out of scope for v1. Decompose with named processes that reference each other via flow conditions if you need hierarchy.

### Gateway

Gateways control flow. The model recognises three types:

- `exclusive` (XOR) — exactly one outgoing branch is taken. Always name the gateway as a question (`"Stock available?"`) and always label every outgoing flow with its `condition`.
- `parallel` (AND) — every outgoing branch is taken. Pair every parallel split with a parallel join later in the flow; do not leave parallel paths to terminate independently.
- `inclusive` (OR) — any non-empty subset of outgoing branches is taken. Label every outgoing flow with its `condition`. Use sparingly; many "inclusive" gateways are clearer as a sequence of exclusive ones.

The fourth BPMN gateway — `complex` / event-based — is intentionally omitted. If you need it, use an `intermediate` event followed by an `exclusive` gateway and document the trigger in the event name.

### Flow

A sequence flow connects two elements. The model lets a flow declare:

- `from`, `to` — IDs of events, tasks, or gateways (not lanes, not pools — the foundation validator enforces this).
- `condition` — optional label rendered on the arrow. Required on exclusive and inclusive gateway branches.

Message flows (between pools) are intentionally omitted in v1; they cross participant boundaries and are usually clearer as separate processes that share an entity.

## Naming conventions

- Process IDs: `process:<kebab-case>` or `process:<namespace>/<kebab-case>`.
- Pool/lane IDs: `pool:<kebab-case>`, `lane:<kebab-case>`.
- Task IDs: `task:<kebab-case>` — read like commands (`task:add-to-cart`, not `task:cart-addition`).
- Event IDs: `event:<kebab-case>` — read like states or moments (`event:checkout-start`, `event:order-placed`).
- Gateway IDs: `gateway:<kebab-case>` — read like questions for XOR/inclusive (`gateway:stock-available`), like coordination labels for parallel (`gateway:split-work`).

## Cross-layer cross-references

Every task can declare three cross-references to other model layers:

- `implementedBy: [function:Service.method]` — code that performs the task.
- `consumes: [entity:Name]` — data the task reads.
- `produces: [entity:Name]` — data the task creates.

These are the **only** edges between the BPMN layer and the rest of the model. They keep the boundary clean: the process diagram does not import service-layer concepts; the service layer does not import process-layer concepts.

The generator surfaces three derived findings from these references:

1. **Orphan tasks** — tasks with no `implementedBy`. May be intentional (manual work) or an oversight.
2. **Disconnected processes** — every task in the process has empty `implementedBy`. The process is documented but not yet linked to any code.
3. **Cross-module spread** — `implementedBy` references in one process span multiple modules. May be a genuinely cross-cutting business process, or it may indicate the modules are sliced wrong.

Each finding is a *prompt for the architect*, not an automatic failure.

## What is intentionally out of scope

- **BPMN 2.0 XML / engines** — Camunda, Zeebe, Activiti. The output here is documentation, not deployable.
- **DMN (decision tables)** — could be a future sibling skill that owns its own slice of the model.
- **Auto-layout heuristics** beyond what PlantUML provides. If the diagram becomes unreadable, split the process into smaller named processes.
- **Sub-processes / call activities** — express as separate processes connected by message events instead.
- **Compensation / boundary events** — error handling at the BPMN layer is omitted; model the error path as an explicit flow with an `end` event.

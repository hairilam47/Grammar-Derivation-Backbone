# C4 Component Diagrams and Sequence Diagrams — Long-form Notes

This document explains the conventions the system-design skill applies when rendering the application layer of the design model.

## Why one C4 diagram, not three

The C4 model defines four levels (Context → Container → Component → Code). This skill emits **only the Component level** for the whole modelled system. Reasons:

- **Context** belongs at the enterprise architecture layer (actors and external systems live in `actors[]`, but the framing — what is "our system" vs the outside world — is owned by the EA orchestrator).
- **Container** maps to deployment (which service runs on which node) and is owned by the EA orchestrator using `modules[].deployedTo[]`.
- **Component** is the natural fit for `services[]` + `functions[]` and is the level developers actually need.
- **Code** is below this skill's layer — it lives in actual source code, not in a design model.

If a project genuinely needs Context and Container diagrams, the EA orchestrator will compose them from the same model.

## Service granularity

A "service" in this skill is **a logical grouping of functions owned by one team and deployed as one unit**. It is *not*:

- A microservice in the strict OS-process sense — that is a deployment concern (`deployedTo[]`).
- A class — classes live below this layer.
- A library — libraries live in `modules[]`, not `services[]`.

If a service has zero exposed functions, it is documentation noise and the orphan-service warning will surface it.

## Why no auto-derived `consumes[]`

A service's `consumes[]` is hand-declared in the model rather than derived from the union of `function.reads/writes` (which describe entity access, not function-to-function calls). Two reasons:

1. Function-to-function calls (RPC, library import, message subscription) are deliberate architectural relationships. Forcing the modeller to declare them surfaces hidden coupling.
2. Many real consumers shape data after the call — declaring the call separately from the data shape keeps the C4 diagram readable.

The trade-off: the modeller must remember to add a service's call to its `consumes[]`. The generator warns if a flow's `sequence[]` walks across services that have no `consumes[]` edge between them — the model says the call exists at runtime but the architecture diagram says it doesn't.

## Edge label rules

In the C4 component diagram:

- One arrow per `(caller_service, callee_service)` pair, regardless of how many functions are consumed.
- The label is every consumed-function method name, joined by `\n`.
- The arrow direction is from `caller` to `callee`.
- Self-edges (a service consuming its own function) are intentionally skipped — they add noise and do not represent architectural coupling.

In sequence diagrams:

- One participant per **service** touched by the flow, in order of first appearance.
- An additional `External` participant represents whoever invokes the first function (a human user, an upstream API, a job scheduler).
- Arrow labels are method names only (no fully-qualified `Service.method`); the participant the arrow points at already supplies the service context.
- Consecutive entries on the same service render as a self-loop (`svc_X -> svc_X : "method"`), which PlantUML draws as a vertical arrow back into the same lifeline.

## Flow vs BPMN process

The cross-layer model has **two** kinds of "flow":

- `processes[].flows[]` — BPMN sequence flows between events / tasks / gateways. These describe **business steps** in a process model. Owned by `bpmn-design`.
- top-level `flows[]` — system-level flows: an ordered list of `function:…` invocations representing **a single end-to-end path through the code**. Owned by this skill.

A single business process can have many system-level flows (happy path, validation-failure path, async-fan-out path). Each flow declares its owning process with `flows[].process: process:<id>`, so the EA orchestrator can group them when telling the cross-layer story.

Modelling guidance: do not try to express every conditional branch as a separate flow. Pick the 2–4 flows that genuinely change which services participate, and document the rest as text in the descriptions.

## Sequence diagrams without explicit returns

PlantUML lets you draw return arrows (`A --> B : "200 OK"`). The v1 schema does not model returns, so the generator does not emit them. Why:

- Returns are usually structurally implied by the call stack — the reader knows that B returns to A.
- Drawing every return doubles the visual weight of the diagram with low information gain.
- When a return *carries information* (a status code, an event, a completion handle), it is usually clearer to declare a separate function for it (`function:OrderService.notifyOrderPlaced`) and add that to the flow.

If a flow genuinely needs explicit returns, hand-edit the rendered PlantUML — but understand that the next regeneration will overwrite the change. The honest way is to extend the schema, which would belong to a v2 of this skill.

## Async dispatch

Sync vs async is not modelled in v1. Reasons:

- The schema has no place for an `async: true` flag on a sequence step.
- Most "async" calls are really fire-and-forget message publishes; they fit better as their own flow with the queue/topic as one of the participants. Until queues are first-class in the model, encoding them inside `sequence[]` is dishonest.
- Adding a flag would require a foundation-validator update and breaks the rule that a layer-skill shouldn't fork the schema unilaterally.

If async modelling becomes a real need, propose it as a foundation-skill change. Until then, document async behaviour in the flow's `description` and accept that the rendered arrows are notional, not protocol-precise.

## Orphan thresholds

The generator's warnings encode a deliberate stance on what's worth flagging:

- **Orphan service**: a service that doesn't expose anything, isn't called by anyone, and doesn't call anyone. Almost always a leftover from refactoring or a stub that was never filled in.
- **Orphan function**: a function not exposed by any service and not in any flow. Either the model is incomplete or the function should be deleted.
- **Function/service mismatch**: the function says it lives in service X, but service X doesn't list it in `exposes[]`. The two declarations have drifted out of sync — fix one or the other.
- **Cross-module flow**: a flow that touches services in more than one module. Often legitimate (real business flows are usually cross-cutting), but the architect should see at a glance which flows are the heavy hitters for cross-module dependencies. Reported as informational, not as a bug.

## What is intentionally out of scope

- **OpenAPI / IDL generation** — could be a future sibling skill that reads `functions[].inputs/outputs`.
- **Source-code stubs / interface generation** — design model, not code generator.
- **Runtime profiling / latency annotations** — could be an overlay on the same diagrams in a future sibling skill.
- **Container and deployment diagrams** — owned by the EA orchestrator using `modules[].deployedTo[]` and `technology.nodes[]`.
- **Context diagrams** — owned by the EA orchestrator; uses `actors[]` and external systems.

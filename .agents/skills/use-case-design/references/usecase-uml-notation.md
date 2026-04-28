# UML Use Case Notation — long-form notes

Reference material for the `use-case-design` skill. Read when a user asks "why does the arrow go that way?", "is `<<extend>>` mandatory?", "how do generalization and `<<include>>` relate?", or proposes an extension to the schema.

## What a use case is (and is not)

A **use case** is a unit of valuable behaviour the system delivers to one or more **actors** to help them achieve a **goal**. It is named from the actor's point of view in a short verb phrase.

A use case is *not*:

- A user story. User stories slice work into agile-sized increments and live one layer down. A single use case usually decomposes into many user stories.
- A feature. Features describe what the product offers; use cases describe what an actor accomplishes through it. The mapping is often many-to-many.
- A function or service operation. Those are the system-design layer (`function:Service.method`). A use case is an actor goal, the function is the code that helps deliver it.
- A BPMN process. Use cases say *what* goal is achieved; BPMN says *how* the work flows through the organisation step by step. Both can — and usually should — exist for the same scenario.

## The four relationships

UML use case diagrams have exactly four relationship kinds. Knowing what each means and when to use it is most of the skill.

### 1. Association (actor → use case)

The simplest line: an actor participates in a use case. Drawn as a solid line (PlantUML `-->`).

- An actor with **no** use case associations is suspicious — they appear in the system but never use it.
- A use case with **no** actor associations is broken — there is no one to invoke it. The generator warns on this.
- An actor can be associated with many use cases; a use case can be associated with many actors.
- The first actor declared on a use case is conventionally the **primary actor** (the one whose goal the use case primarily serves). The rest are supporting actors. UML does not enforce a placement, but readers expect primaries on the left of the boundary.

### 2. `<<include>>` — mandatory sub-goal

`A ..> B : <<include>>` means "use case A always invokes use case B as part of completing its goal". Drawn as a dashed arrow from A to B with the `<<include>>` stereotype.

- **Direction**: from the parent (A, the one that *includes*) to the child (B, the one *being included*). The arrow source is the parent.
- **Use it when** the child is a reusable, mandatory sub-goal that more than one parent invokes (e.g. "Authenticate User" is included by every use case behind the auth wall).
- **Don't use it for** a single sub-step of a single parent — that is process detail and belongs in BPMN, not on the use case diagram.
- A use case included by nothing is fine. A child use case that is itself included by something else is also fine; chains can nest.

### 3. `<<extend>>` — optional, conditional behaviour

`A ..> B : <<extend>> [condition]` means "use case A optionally inserts behaviour into use case B when condition holds". Drawn as a dashed arrow from A to B with the `<<extend>>` stereotype.

- **Direction**: from the *extension* (A, the optional behaviour) to the *base* (B, the use case A inserts into). The arrow source is the extension. This is the opposite intuition many beginners have, and almost every use case modelling mistake comes from getting this wrong.
- **Use it when** a behaviour is meaningful on its own *and* optionally adds value to a base use case (e.g. "Order Wine" is a goal in itself; it also extends "Order Food" when wine is part of the meal).
- **The condition is required in practice**, even though the schema marks it optional. An unconditional extend is almost always either an `<<include>>` in disguise or a missing actor association on the extension.
- Extensions can themselves be extended, but every layer of indirection makes the diagram harder to read. Two layers is the practical maximum.

### 4. Generalization — "is a kind of"

`Child --|> Parent` means "Child is a more specific kind of Parent". Drawn as a solid line with an open triangle on the parent end.

- **Direction**: from the child (the specialization) to the parent (the generalization). The triangle sits on the parent.
- **Inheritance**: the child inherits the parent's actor associations, includes, and extends. If "Pay for Wine" generalizes "Pay for Food", every actor associated with paying for food can also pay for wine without restating the association.
- **Use it sparingly**. Use case generalization is a powerful but easily abused construct; in most domain models, two specializations of one base is the practical maximum before the diagram becomes opaque.
- **Use it for actors too** when modelling roles that share goals. ("Premium Customer" generalizes "Customer" and inherits every customer use case.) This skill currently models actor generalization implicitly via repetition; if it becomes important, consider adding a `generalizationOf` field on `actors[]` in a follow-up task.

### Cycles are always bugs

A generalization cycle (`A` declares `generalizationOf: B` and `B` declares `generalizationOf: A`) is meaningless and the generator warns on it. Self-references in `include[]`, `extend[].usecase`, or `generalizationOf` are also always bugs.

## When to break the model into multiple system boundaries

The `system` field on a use case groups it onto a particular diagram. Use multiple boundaries when:

- The use cases live in genuinely different subsystems (e.g. customer-facing app vs. internal admin console).
- The diagram has grown past ~15 use cases and is becoming hard to read in one frame.
- Two stakeholder audiences each care about a disjoint slice and reading the union is wasteful for both.

Do not break by:

- **Actor**: one diagram per actor produces N very thin diagrams that hide collaboration.
- **Layer of the architecture**: use cases are a behaviour view, not a deployment view. Splitting "frontend use cases" from "backend use cases" produces diagrams that double-count goals.
- **Sprint**: use cases are stable; sprints are temporary. Use the user-story layer for sprint-scoped views (planned in a follow-up skill).

Cross-boundary `<<include>>`, `<<extend>>`, and generalization references are valid in the model but skipped from the per-boundary diagram with a warning, because the included or base use case is not on the same picture. If two use cases routinely reach across boundaries, that is a signal to merge their boundaries.

## The smell tests

A use case diagram passes review when:

1. Every actor has at least one association and every use case has at least one association.
2. Every use case name reads as a goal phrased from the actor's perspective ("Order Food", not "Submit POST /orders").
3. `<<include>>` is reserved for sub-goals reused by more than one parent. (One-off helpers belong inline in the parent's description, or in the BPMN layer.)
4. Every `<<extend>>` arrow has a condition explaining when the extension fires.
5. Generalization is used at most twice in any chain.
6. The diagram fits comfortably in one screen at full zoom.

If any of these fail, the diagram is hiding either too much or too little — return to the model and split, merge, or rename until the picture stabilises.

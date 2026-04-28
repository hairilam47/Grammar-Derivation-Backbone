# ID Grammar — Long-form Notes

This document explains the design choices behind the cross-layer ID grammar so future contributors can extend it without breaking the existing model.

## The shape of an ID

Every ID is `<kind>:<name>`, where:

- `kind` is a lowercase word from a fixed list (see SKILL.md table).
- `:` is the separator. It cannot appear in the name.
- `name` follows a per-kind regex documented in SKILL.md.

Optional namespace prefix `<namespace>/` may appear in the name for `entity:` and `module:` only. This slot is reserved for bounded-context work; it is forward-compatible — existing IDs without a namespace remain valid forever.

## Why kind prefixes

Diagrams cross layers. A box on a sequence diagram might say `OrderService.placeOrder`, an arrow on an ERD might say `Customer`, and a swimlane on a BPMN diagram might say `Customer` again — but the second `Customer` is the actor and the first is the entity. Without prefixes, the validator cannot tell those apart, and a human reading the YAML cannot either.

The `kind:` prefix makes every reference self-describing and the validator's job mechanical.

## Why two casings

- **PascalCase** is the natural casing for actors, entities, services, and the service half of function IDs because those map one-to-one to type names in code (Java, C#, TypeScript, Python class names). When a function ID is rendered in a diagram, it should look like the function it documents.
- **kebab-case** is the natural casing for processes, tasks, gateways, events, flows, modules, and deployment nodes because those map to BPMN labels, URL slugs, folder names, and Kubernetes resource names. They are read by non-developers more often than developers, and lowercase reads more naturally in those contexts.

This split is intentional — do not "normalise" the grammar to a single casing. The friction it would create with both code and BPMN tooling is worse than the small cost of remembering two conventions.

## The `Service.method` shape for functions

Functions could have been `function:OrderServicePlaceOrder` (concatenated PascalCase) or `function:order-service.place-order` (kebab.kebab). The chosen `function:OrderService.placeOrder` shape has two advantages:

1. The owning service is recoverable from the ID alone — `function:X.y` always belongs to `service:X`. The validator enforces this.
2. The `.method` half matches how the function is invoked in code, so the ID survives copy-paste from source.

## Namespace slot — when to use

Use a namespace prefix when:

- Two bounded contexts genuinely have a same-named entity (`entity:billing/Invoice` and `entity:legal/Invoice`) and the model would otherwise need ugly disambiguators.
- A single repository hosts multiple subsystems with their own ubiquitous languages.

Do **not** use a namespace prefix to organise unrelated entities into folders — that is what tags or `metadata` extensions are for. Namespacing implies a real bounded-context boundary.

## Extending the grammar

Adding a new kind requires updating, in order:

1. The "Allowed kinds" table in `SKILL.md`.
2. The "Cross-reference fields" table in `SKILL.md`, if the new kind participates in cross-references.
3. The `KIND_RULES` table in `scripts/validate.mjs` (regex + which top-level section the kind lives in).
4. The reference in this document explaining the design rationale.
5. The bundled template, if a representative example helps.

Never extend the grammar mid-task without explicit user approval — it changes the contract every sibling skill relies on.

## Forbidden moves

- **Renaming an ID** — never silently. IDs are referenced from PlantUML files, sibling-skill output, and possibly external documentation. Renames should be performed as an explicit "rename `entity:Foo` to `entity:Bar`" operation that updates every reference and re-runs the validator.
- **Reusing an ID across kinds** — `entity:Customer` and `actor:Customer` are different IDs and that is fine; `entity:Customer` and `entity:customer` would be a clash and the validator rejects it.
- **Inline IDs without registration** — every ID that appears as a cross-reference must also exist as the `id` field of an object somewhere. Cross-references that point to a never-registered ID are exactly what the validator catches.

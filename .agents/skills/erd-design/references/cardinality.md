# ERD Cardinality — Long-form Notes

This document explains the cardinality vocabulary the ERD skill uses, why we restrict it to four values plus an `optional` flag, and the PlantUML symbols it maps to.

## The four-value vocabulary

The model's `cardinality` field accepts exactly:

- `one-to-one`
- `one-to-many`
- `many-to-one`
- `many-to-many`

Optionality (whether the target side may be absent) is expressed as a separate boolean `optional` field. This split is intentional:

- It mirrors how relational practitioners actually talk: "an Order has many OrderItems" first, "is the OrderItem optional?" second.
- It keeps the cardinality value enumerable and comparable across entities (you can grep for every `many-to-many` relationship; you cannot grep across the eight composite forms).
- It gives the validator a single small enum to check.

## PlantUML symbol mapping

| `cardinality` | `optional: false` | `optional: true` |
|---|---|---|
| `one-to-one`   | `\|\|--\|\|` | `\|\|--\|o` |
| `one-to-many`  | `\|\|--\|{` | `\|\|--o{` |
| `many-to-one`  | `}\|--\|\|` | `}o--\|\|` |
| `many-to-many` | `}\|--\|{` | `}o--o{` |

PlantUML's symbols read left-to-right:

- `\|\|` — exactly one
- `\|o` — zero or one
- `\|{` — one or many
- `o{` — zero or many

## Why we model many-to-many through an explicit join entity

A `many-to-many` cardinality in the model renders as `}|--|{` (or its optional variant `}o--o{`) — the generator does not invent a join entity for you. The convention is to **declare the join entity yourself** in the model, then express it as two `one-to-many` relationships:

```yaml
entities:
  - id: entity:Enrolment
    attributes:
      - { name: studentId, type: uuid, primaryKey: true, foreignKey: "entity:Student.id" }
      - { name: courseId,  type: uuid, primaryKey: true, foreignKey: "entity:Course.id" }
      - { name: enrolledAt, type: timestamp }
```

Reasons to model it this way:

- Real schemas always have a join table — composite primary keys, payload columns, soft deletes, audit timestamps live there. Hiding it in the diagram lies about the schema.
- Migrations cannot be generated from an implicit join.
- Cross-layer functions almost always operate on the join entity (e.g., `enrolStudent` writes `entity:Enrolment`, not `entity:Student` and `entity:Course` directly).

Reserve the literal `many-to-many` cardinality for early discovery sketches; promote it to a join-entity model before the design is considered done.

## Direction — which entity owns the relationship

The convention: the entity that holds the foreign-key attribute is the **source** of a `many-to-one` relationship. So `Order.customerId → entity:Customer.id` is declared on `entity:Order`:

```yaml
- id: entity:Order
  attributes:
    - { name: customerId, type: uuid, foreignKey: "entity:Customer.id" }
  relationships:
    - to: entity:Customer
      cardinality: many-to-one
      optional: false
```

Declaring it on `entity:Customer` as a `one-to-many` toward `entity:Order` is also valid and renders the same way. Pick one convention per project and stick with it; mixing both is what produces duplicate edges in the diagram.

## Role names — when to bother

Set `roleNameSource` and `roleNameTarget` only when the relationship is *not* obvious from the entity names:

- Worth labelling: `User → User` (`roleNameSource: managedBy`, `roleNameTarget: manager`).
- Worth labelling: two relationships between the same pair (`Order ||--o{ Address` for `shippingAddress` and `billingAddress`).
- Not worth labelling: `Customer → Order` — the relationship is obviously "places".

The generator omits role-name labels from PlantUML output if both fields are empty, keeping the diagram clean.

## Cardinality you cannot express here

The four-value vocabulary deliberately excludes:

- **Bounded multiplicity** (e.g. "exactly 5"). PlantUML and ERD notation in general do not represent it well; capture it as a `description` on the relationship instead.
- **Conditional/predicate relationships** (e.g. "active customers only"). Capture in `description` and let the function-level `reads`/`writes` predicate logic in code handle it.

Adding new cardinality values to this skill requires updating the symbol-mapping table, the generator, and this document together.

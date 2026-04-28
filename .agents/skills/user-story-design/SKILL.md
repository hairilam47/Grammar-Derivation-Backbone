---
name: user-story-design
description: Owns the user-story (agile backlog) layer of the cross-layer design model. Reads and writes the `stories[]` section of `designs/system-model.yaml` and emits a backlog markdown at `designs/stories.md` grouped by epic, plus optional Gherkin `.feature` files at `designs/features/<epic>.feature` when `--gherkin` is passed. Use this skill whenever the user mentions "user story", "user stories", "agile backlog", "as a / I want / so that", "acceptance criteria", "Gherkin", "given when then", "INVEST", "story points", "epic", "story map", "feature file", or asks to "write the requirements", "capture the backlog", or "what do we need to build". Use it even when the user does not say "user story" — phrasings like "let's slice the work into something a developer can pick up" or "what should the team commit to this sprint" are exactly what this skill is for. This is design-only — no issue-tracker sync, no sprint planning, no velocity tracking.
---

# User Story Design

Owns the **user-story (agile backlog) layer** of the shared design model defined by the [`design-model`](../design-model/SKILL.md) foundation skill. Reads and writes one section of one file, and emits one backlog file (plus optional Gherkin `.feature` files):

- **Reads / writes**: `designs/system-model.yaml` → `stories[]`
- **Emits**: `designs/stories.md` (always); `designs/features/<epic>.feature` (only with `--gherkin`)

This skill never integrates with Jira, Linear, or GitHub Issues; never schedules sprints; never tracks velocity, burndown, or story points consumed. It writes design documentation a team reads while talking to stakeholders, picks stories off, and (optionally) feeds into BDD tooling.

## When to load this skill

- The user asks to add, edit, or visualise a user story, an acceptance criterion, or a backlog.
- The user mentions "user story", "user stories", "agile backlog", "as a / I want / so that", "acceptance criteria", "Gherkin", "given when then", "INVEST", "story points", "epic", "story map", "feature file", "BDD".
- The user asks "what do we need to build for this sprint", "let's write the requirements", "slice this into stories", or "what would a developer pick up Monday morning?".
- A `.feature` file needs to be regenerated for QA tooling after a backlog change.
- A cross-link report is needed (stories with no use case, use cases with no story, stories with no implementing function).

Load the [`design-model`](../design-model/SKILL.md) foundation skill alongside this one whenever the model file does not yet exist or its ID grammar is in question. When the user wants to talk about goals at a higher level than stories, hand off to [`use-case-design`](../use-case-design/SKILL.md). When the user wants the end-to-end picture (stories → use cases → tasks → functions → entities → modules → nodes), trigger the [`enterprise-architecture`](../enterprise-architecture/SKILL.md) orchestrator.

## Story vs use case vs BPMN process — pick the right layer

| Concern | User story (this skill) | Use case (`use-case-design`) | BPMN process (`bpmn-design`) |
|---|---|---|---|
| Question it answers | What can a developer pick up and ship in a sprint? | What goal does an actor achieve through the system? | How does the work flow step-by-step across roles and systems? |
| Granularity | One sliver of value per story (sentences, hours-to-days). | One goal per use case (a few words). | One task per BPMN task (verb phrase). |
| Notation | "As a / I want / so that" + Gherkin acceptance criteria. | UML use case diagram. | BPMN swimlanes, gateways, sequence flows. |
| Audience | Delivery team and product owner. | Stakeholders agreeing on scope. | Process owners agreeing on operations. |
| Inside a sprint | Stories are what the team commits to. | Use cases scope what the iteration is for. | BPMN designs the work the team performs. |

A single use case typically decomposes into several stories. A single story rarely realises more than one or two use cases. Stories that realise zero use cases are flagged by the EA orchestrator's gap report — usually a sign the story is a technical task in story clothing, or a sign the use case layer has not caught up.

## Prerequisites

The generator script dynamic-imports the `yaml` package. If it is not available in the workspace:

```bash
pnpm add -D -w yaml
```

Or pass `--json` and a JSON model file — the same fallback used by the foundation validator and the other generators.

## Workflow

### 1. Make sure the model file exists

If `designs/system-model.yaml` is missing, hand off to `design-model` to bootstrap it. Do not invent a new file format.

### 2. Add or edit a story

Walk the user through one story at a time:

1. **ID** — `story:<kebab-case>`, stable across renames. The backlog markdown is regenerated from this; renaming requires updating every `dependsOn[]` reference.
2. **Role** — the `actor:` ID whose voice the story speaks in. The "As a Customer" half of the canonical template. Required.
3. **Goal** — short verb phrase. The "I want to order food" half. Required.
4. **Benefit** — the "so that I can eat" clause. Optional but strongly recommended (an INVEST-quality story explains *why*).
5. **Priority** — one of `must`, `should`, `could`, `wont` (MoSCoW). Required.
6. **Points** — optional; either a Fibonacci number (`1`, `2`, `3`, `5`, `8`, `13`, `21`) or a t-shirt size string (`xs`, `s`, `m`, `l`, `xl`).
7. **Epic** — optional free-text label used to group stories in the backlog markdown. Stories with no `epic` are gathered under "Unassigned".
8. **Acceptance criteria** — optional list of `{ given, when, then }` triples. Each renders as a Gherkin `Scenario` block in the backlog markdown and (with `--gherkin`) in the per-epic `.feature` file.
9. **Realizes** — optional list of `usecase:` IDs the story incrementally delivers. The EA orchestrator draws `story --> usecase` arrows from this field.
10. **Implemented by** — optional list of `function:` IDs that ship the story. Used by the EA orchestrator to find which process tasks the story reaches.
11. **Depends on** — optional list of `story:` IDs that must land before this one. Surfaced in the backlog footer for sprint-planning conversations; this skill does not order or schedule stories.

Keep IDs stable. Renaming a story requires updating every `dependsOn[]` reference; the foundation validator catches dangling references.

### 3. Validate the model

```bash
node .agents/skills/design-model/scripts/validate.mjs designs/system-model.yaml
```

The foundation validator covers:

- ID uniqueness and grammar (every `story:` ID is unique and matches `[a-z][a-z0-9-]*`).
- `stories[].role` resolves to a declared `actor:` ID.
- `stories[].realizes[]` resolves to declared `usecase:` IDs.
- `stories[].implementedBy[]` resolves to declared `function:` IDs.
- `stories[].dependsOn[]` resolves to other declared `story:` IDs.

Fix any errors it reports before regenerating.

### 4. Regenerate the backlog

```bash
node .agents/skills/user-story-design/scripts/generate.mjs designs/system-model.yaml
```

This always overwrites `designs/stories.md`. To additionally emit one Gherkin `.feature` file per epic for QA tooling:

```bash
node .agents/skills/user-story-design/scripts/generate.mjs designs/system-model.yaml --gherkin
```

The `.feature` files land at `designs/features/<epic-slug>.feature`. Stories with no `epic` go to `designs/features/unassigned.feature`. Both formats always overwrite — never hand-edit the generated files. Tweaks belong in the model.

### 5. Read the validation report

After generation the script prints:

- A one-line summary: `stories — 12 stories · 4 epics · 3 must · 5 should · 4 could · 0 wont`.
- Stories with no `acceptanceCriteria[]` (they may be too rough to size).
- Stories with no `realizes[]` (informational — confirm they intentionally trace to no use case; the EA orchestrator's gap report flags the same condition there too).
- Stories with no `implementedBy[]` (informational — fine in the early backlog, suspicious once the team is mid-sprint).
- Self-references in `dependsOn[]` (always a mistake).
- `dependsOn[]` cycles (suspicious — agile dependencies should form a DAG).
- Priority distribution sanity (warns if every story is `must` — a backlog where everything is required is an unprioritised backlog).

Other foundation-layer issues (ID grammar, wrong-kind references, dangling actor / use case / function / story IDs) are reported by the foundation validator, not duplicated here.

## Story object shape

```yaml
stories:
  - id: story:customer-orders-food            # required, must start with "story:"
    role: actor:Customer                      # required, must be a declared actor
    goal: order food                          # required, the "I want to …" half
    benefit: I can eat                        # optional but recommended, the "so that …" half
    priority: must                            # required: must | should | could | wont (MoSCoW)
    points: 5                                 # optional: Fibonacci number OR t-shirt size string
    epic: Ordering                            # optional: free-text grouping label

    acceptanceCriteria:                       # optional, list of given-when-then triples
      - given: the menu is loaded
        when: the customer adds an item to the order
        then: the order shows the new item with the correct price
      - given: the cart has at least one item
        when: the customer submits the order
        then: the kitchen receives a ticket within one second

    realizes:                                 # optional, → usecase[]
      - usecase:order-food

    implementedBy:                            # optional, → function[]
      - function:OrderService.placeOrder
      - function:CartService.addItem

    dependsOn:                                # optional, → story[]
      - story:customer-views-menu
```

### Required vs optional

- **Required**: `id`, `role`, `goal`, `priority`.
- **Optional**: `benefit`, `points`, `epic`, `acceptanceCriteria[]`, `realizes[]`, `implementedBy[]`, `dependsOn[]`.

The foundation validator enforces ID grammar and cross-reference resolution. Layer-specific checks (priority within the MoSCoW set, points within the Fibonacci or t-shirt domain, acceptance criteria well-formedness, dependency cycles) are reported by this skill's generator as warnings.

## Backlog markdown convention

`designs/stories.md` is regenerated on every run, sorted by epic (alphabetical, with "Unassigned" last) and within each epic by priority (must → should → could → wont, then by ID).

```markdown
# Backlog

Generated from `designs/system-model.yaml` on 2026-04-28T12:00:00Z. Do not hand-edit.

## Ordering

### story:customer-orders-food (must · 5 pts)

**As a** Customer **I want to** order food **so that** I can eat.

```gherkin
Scenario: order shows the new item
  Given the menu is loaded
  When the customer adds an item to the order
  Then the order shows the new item with the correct price

Scenario: kitchen receives a ticket
  Given the cart has at least one item
  When the customer submits the order
  Then the kitchen receives a ticket within one second
```

- **Realizes**: usecase:order-food
- **Implemented by**: function:OrderService.placeOrder, function:CartService.addItem
- **Depends on**: story:customer-views-menu

…
```

The "Realizes / Implemented by / Depends on" footer is omitted when all three lists are empty.

## Gherkin `.feature` file convention (--gherkin)

When `--gherkin` is passed, one `.feature` file is emitted per distinct epic to `designs/features/<epic-slug>.feature`. Each story becomes a `Feature` block; each acceptance criterion becomes a `Scenario`. The format is plain Gherkin so it loads directly into Cucumber, Behave, SpecFlow, etc.

```gherkin
# Generated from designs/system-model.yaml on 2026-04-28T12:00:00Z. Do not hand-edit.
# Epic: Ordering

Feature: customer-orders-food
  As a Customer
  I want to order food
  So that I can eat

  Scenario: order shows the new item
    Given the menu is loaded
    When the customer adds an item to the order
    Then the order shows the new item with the correct price

  Scenario: kitchen receives a ticket
    Given the cart has at least one item
    When the customer submits the order
    Then the kitchen receives a ticket within one second
```

Stories with no `acceptanceCriteria[]` still produce a `Feature` block with no `Scenario`s — useful for early-backlog stories that haven't been fleshed out yet. The Cucumber-family tools tolerate empty features.

## Generator behaviour

`scripts/generate.mjs` reads `designs/system-model.yaml` and writes `designs/stories.md` (always) and per-epic `.feature` files (only with `--gherkin`).

It also:

- Prints the per-run summary line and priority distribution.
- Warns on stories with no acceptance criteria, no realizes, or no implementedBy (informational; the EA orchestrator owns the cross-layer gap report).
- Warns on `dependsOn[]` self-references and cycles.
- Warns on out-of-domain priorities (anything outside `must / should / could / wont`).
- Warns on out-of-domain `points` (anything other than a Fibonacci number `1, 2, 3, 5, 8, 13, 21` or a t-shirt size string `xs, s, m, l, xl`).
- Warns when every story is `must` (an unprioritised backlog).
- Runs the foundation validator first; exits **1** if it reports any grammar or cross-reference errors. Exits **2** on internal failures (file unreadable, parse error). An empty or absent `stories[]` section exits cleanly with a no-op message so the script is safe to run on a fresh model.

### Flags

| Flag | Purpose |
|------|---------|
| `--json` | Treat the input as JSON instead of YAML. |
| `--gherkin` | Also emit `designs/features/<epic-slug>.feature` files. |

## Bundled files

```
.agents/skills/user-story-design/
├── SKILL.md                             ← you are here
├── scripts/
│   └── generate.mjs                     ← stories[] → designs/stories.md (+ optional .feature files)
└── references/
    └── user-story-best-practices.md     ← long-form notes on INVEST, splitting patterns, BDD style
```

# User Story Best Practices — long-form notes

Reference material for the `user-story-design` skill. Read when a user asks "what makes a good story?", "how do I split this story?", "what's INVEST?", or proposes an extension to the schema.

## The "As a / I want / so that" template

Every story is one sentence in three parts:

> **As a** `<role>` **I want to** `<goal>` **so that** `<benefit>`.

Each part earns its keep:

- **Role** is the actor whose voice the story speaks in. It is *not* the developer. "As a developer I want a config file" is rarely a real user story — it's a technical task and should be phrased that way (or hidden inside a real story).
- **Goal** is the verb phrase describing what the actor wants to do. Concrete enough to point at a feature, abstract enough that the design is still open. "Order food" is a goal; "Click the green button at coordinates (320, 480)" is an implementation detail.
- **Benefit** is the *why*. The benefit is what lets a developer or designer make sensible trade-offs when the implementation isn't obvious from the goal alone. Stories with no benefit often turn into solutions in search of a problem.

The benefit clause is the single most-skipped part of the template, and the single most useful one to keep. If the team can't agree what the benefit is, the story isn't ready.

## INVEST — six quality criteria

A widely-used checklist (Bill Wake, 2003) for whether a story is ready to be picked up:

| Letter | Meaning | Smell when missing |
|---|---|---|
| **I**ndependent | Can be delivered without another story landing first. | Stories piling up in `dependsOn[]` chains. Often a sign the slice was too thin. |
| **N**egotiable | The team can change the *how* during implementation. | Story reads like a design spec — every detail is locked. |
| **V**aluable | Delivers something the role cares about. | Story has no benefit clause, or the benefit is "the system works correctly". |
| **E**stimable | The team can size it (story points, t-shirt). | Story has no acceptance criteria; nobody knows what done looks like. |
| **S**mall | Fits in a sprint, ideally a few days. | Story points keep growing each refinement. |
| **T**estable | Has clear acceptance criteria. | No `acceptanceCriteria[]` list, or the criteria are "as discussed in the meeting". |

INVEST is a smell test, not a gate. A story can pass review with a missing letter (e.g. a research story is rarely Estimable). The point is to make the conversation about *which* letter is missing and whether that's intentional.

## Splitting patterns — when a story is too big

Two well-known frameworks for splitting epics into stories:

### SPIDR (Mike Cohn, 2018)

Five lenses to look through:

- **Spike** — split off the unknown into a time-boxed research story. The remaining work is then estimable.
- **Path** — split by the path the user takes (happy path, alternative paths, error path).
- **Interface** — split by interface (web, mobile, API; or admin UI vs. customer UI).
- **Data** — split by the data the story handles (one customer type, then the next; one product category, then the next).
- **Rules** — split by business rule (one rule first, then the second, then the edge cases).

### Hamburger method

Visualise the story as a sandwich. The bottom bun is the smallest possible end-to-end slice (signup → core happy path → confirmation). Each layer above is a topping that adds value but is not on the critical path (validation, error states, internationalisation, edge cases). Pick which layer to ship first.

The output of either method is a set of stories that each pass INVEST on their own. If you can't split a story without one half failing INVEST, the split is wrong.

## Acceptance criteria — Gherkin BDD style

The `acceptanceCriteria[]` schema deliberately mirrors Gherkin (`given`, `when`, `then`):

- **Given** sets the precondition. State the system is in before the action.
- **When** is the trigger. The action the actor takes.
- **Then** is the observable outcome. What the user sees, what the system records.

Each triple is one `Scenario` block in the rendered output. A story typically has 2–5 scenarios — one happy path, one or two alternative paths, one or two error paths.

Keep the language declarative (what), not imperative (how):

- ✅ `Given the cart has at least one item` (state)
- ❌ `Given the user has clicked the cart icon and waited 200ms for the animation`

The "how" is implementation detail and breaks the test as soon as the UI changes. The "what" survives refactoring.

## Epics vs. features vs. stories

The most-confused terms in agile vocabulary:

| Term | Granularity | Question it answers |
|---|---|---|
| Epic | Multi-sprint chunk of work. Free-text label in this schema. | What body of work is this story part of? |
| Feature | Capability the product offers. Often spans multiple epics. | What can the product do? |
| Story | One sliver of value, sized to a sprint. | What can the team commit to and deliver? |

This skill models **epics** (as a free-text grouping label on each story) and **stories** (as `stories[]`). It does **not** model features as a separate kind — features map naturally to use cases (`usecases[]`), or to epic labels when use-case modelling isn't in play.

A reasonable rule of thumb:

- **One epic** ≈ a few use cases ≈ a few dozen stories ≈ several sprints of work.
- **One use case** ≈ a few stories ≈ a single iteration's worth of work.
- **One story** ≈ a few days of work for a delivery pair.

These are guidelines, not contracts. Teams should size to their own velocity and adjust.

## Story points — Fibonacci or t-shirt?

Both are supported in the `points` field; the choice is a team decision:

- **Fibonacci** (`1`, `2`, `3`, `5`, `8`, `13`, `21`) — the gaps grow as the story grows. Small stories distinguish 1 vs 2; large stories distinguish 13 vs 21. The gap is a feature: it discourages spurious precision (there is no point arguing whether a story is a 7 or an 8 — it's an 8).
- **T-shirt sizes** (`xs`, `s`, `m`, `l`, `xl`) — five buckets, easier for non-engineers to reason about. Good for early-stage backlogs where the team isn't ready to commit to a number.

Mixing both in one backlog is supported but discouraged — the report can't compare them.

A story sized **xl** or `21+` is a smell. Split it.

## Dependency cycles — usually a smell

The schema allows `dependsOn[]` to form a DAG, and the generator warns on cycles. A cycle in story dependencies usually means:

- The two stories are really one story; merge them.
- The team has confused functional dependency (story B builds on story A's data model) with team dependency (story B is being worked on by the same person as story A). The latter is sprint-planning, not a story dependency — drop the link.

A long `dependsOn[]` chain (three or more stories deep) usually means the slices were too thin or the wrong way. Re-cut along a SPIDR / Hamburger boundary so each story can ship independently.

## Common mistakes

- **Technical tasks dressed as stories.** "As a developer I want to upgrade Postgres so that we're on a supported version" is a real piece of work but not a user story. Keep it as a tech-debt ticket; don't shoehorn it.
- **One-line stories with no acceptance criteria.** They look done in a backlog but invite scope creep mid-sprint.
- **Stories that realise no use case.** Sometimes intentional (a story may deliver pure plumbing), but more often a sign the use case layer is stale.
- **Stories with too many `implementedBy[]` functions.** A story that touches a dozen functions is probably an epic that was never split.
- **Every story is `must`.** A backlog where everything is required isn't prioritised. Force the conversation: which `must`s are really `should`s?

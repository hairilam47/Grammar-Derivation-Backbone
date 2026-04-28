# Module Patterns and Design Choices

Long-form notes on conventions and intentional limitations for the code-structure-design skill.

## Why style-agnostic

The skill expresses three primitives — modules, what they contain, and what they're allowed (or forbidden) to depend on. The same primitives can encode any of the popular shapes:

| Style | What "module" means |
|-------|----------------------|
| **Layered** | One module per layer (`domain`, `application`, `infrastructure`, `web`). Allowed deps point only inward. |
| **Hexagonal / Ports & Adapters** | Same as layered, with `domain` + `application` as the hexagon and one module per adapter family. |
| **Clean / Onion** | Same as layered, with explicit `entities`, `useCases`, `interfaceAdapters`, `frameworks` modules and innermost-only deps. |
| **Feature-sliced** | One module per feature (`checkout`, `billing`, `reports`) plus a thin `shared` module. |
| **DDD bounded contexts** | One module per bounded context, with `forbiddenDependencies` enforcing context isolation. |
| **Hexagonal × feature-sliced** | A grid of `feature/layer` modules (e.g., `module:checkout/domain`, `module:billing/application`). |

Picking a style is a real architectural decision. The skill does not push one — it gives you the pieces and gets out of the way. If you want opinionated guidance, pair this skill with `architecture-patterns`.

## Why both `allowedDependencies` and `forbiddenDependencies`

`allowedDependencies` is **prescriptive**: "these are the edges that should exist". Anything not listed is implicitly disallowed. This is the primary mechanism, and it's what most projects need.

`forbiddenDependencies` is **emphatic**: "this dependency would be a particularly bad mistake — call it out loudly". Use it for two specific situations:

1. **Highlighting an architectural tripwire.** If `module:domain` is the inner ring of a Clean Architecture, listing `module:web` as forbidden makes the violation visible in code review even though it would already be excluded by the empty `allowedDependencies` list.
2. **Documenting context isolation in DDD.** Two bounded contexts should not import each other; making this explicit in the design surfaces the rule for new team members.

The skill checks for the obvious contradiction (a module appearing in both lists for the same source module) and reports it as an error.

The skill does **not** enforce these rules at lint or build time — that's runtime tooling (ESLint plugins, depcheck, dependency-cruiser, ArchUnit). The design tells you what shape to enforce; the enforcement itself belongs to the build pipeline.

## Cycle detection — why warn, not fail

Cycles in `allowedDependencies` are almost always a real bug:

- They make it impossible to extract a module into its own package.
- They invite spaghetti imports that break when either end changes.
- They prevent the architectural intent from being clear.

But a cycle is not a *modelling* error in the same way an unresolved ID is. The model parses cleanly; the validator just observes that the graph has a cycle. Treating cycles as warnings (not fatal errors) keeps the generator useful while you're refactoring — you can regenerate the diagram, see the cycle visually, and break it deliberately.

The cycle report prints the **shortest cycle path**, not just "cycle exists". Knowing `module:billing → module:invoicing → module:reports → module:billing` is far more actionable than "you have a cycle somewhere".

## Why `intendedFolderPath` is advisory

The design should describe the **target shape**, not the current shape. Many useful design conversations start from a repo where folders are wrong — and the design's job is to capture what they should become.

Two modes meet this need:

- The default mode treats `intendedFolderPath` purely as documentation — the diagram and the validator never read the filesystem.
- The `--compare-repo` mode opts into a one-shot reconciliation that lists discrepancies for you to triage.

Neither mode ever creates folders or moves files. The skill is a blueprint, not a scaffolder.

## Nested module IDs — flat rendering today

The grammar allows `module:checkout/orders`. Today the generator renders nested IDs as **flat packages with the slash in the label**. Reasons:

- Drawing nested PlantUML packages requires the parent module to be declared too. Rendering an undeclared parent would invent design content the user didn't write.
- Many "nested" IDs are conceptual (a path naming convention) rather than physical (a real parent module). Forcing physical nesting in the diagram would over-specify.
- Future-enhancement: a `--nested` flag could draw packages inside packages when both parent and child IDs are present. Not implemented in v1 to keep the diagram readable for typical projects.

If you genuinely need physical nesting today, declare both `module:checkout` and `module:checkout/orders`, and use `intendedFolderPath` to carry the hierarchy (`src/checkout`, `src/checkout/orders`). The compare-repo mode then lines up correctly.

## What the report doesn't tell you

- **Whether the dependencies are *used*.** The model says what's allowed; the actual import graph in the source tree is the runtime truth. Use `dependency-cruiser`, `depcheck`, ArchUnit, or similar tools alongside this design.
- **How many lines of code live in each module.** That's a metric, not a design statement.
- **Whether two modules ought to be merged.** Heuristics for "your modules are too small / too big" depend on team and codebase size. The skill stays out of that conversation.
- **Whether a service belongs to module A or module B.** That's a conversation between the architect and the team; the skill records the decision once made.

## Compare-repo skip-list

The default skip-list (`.git`, `node_modules`, `dist`, `build`, `.next`, `.turbo`, `.cache`, `coverage`, `.local`) covers the noise common to JS / TS / Node projects. For other ecosystems:

- **Python**: add `__pycache__`, `.venv`, `venv`, `.tox`, `.pytest_cache`.
- **Rust**: add `target`.
- **Go**: add `vendor`, `bin`.
- **Java / Kotlin**: add `target`, `.gradle`, `build`.

Use `--skip <name>` for repeatable per-project additions. The skip-list deliberately matches by basename (not by path) so it works at any depth.

## What is intentionally out of scope

- **Folder / file scaffolding** — would put the skill in the business of writing source code. The design is a blueprint, not a template engine.
- **Lint-time enforcement** — could be a future sibling skill that emits ESLint / dependency-cruiser / depcheck config from the same model.
- **Picking an architecture style** — `architecture-patterns` is the sibling skill for that.
- **Cross-language module systems** — the skill is language-neutral. Each language has its own packaging conventions (Python packages, Rust crates, Java modules, Go packages); the design conveys intent, the language ecosystem handles the mechanics.
- **Deployment topology** — owned by the EA orchestrator using `modules[].deployedTo[]` and `technology.nodes[]`.

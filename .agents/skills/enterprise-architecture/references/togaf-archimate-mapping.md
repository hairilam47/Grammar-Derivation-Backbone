# TOGAF, ArchiMate, and Why the Five Skills Land Where They Do

Long-form rationale and framework alignment for the cross-layer design model.

## The mapping in one table

| TOGAF Phase | ArchiMate Layer | Sibling skill | Model section it owns | Diagram it emits |
|-------------|-----------------|---------------|------------------------|-------------------|
| Phase B — Business | Business Layer (Process, Actor, Business Function, Business Service) | `bpmn-design` | `processes[]`, `actors[]` | One `process-<id>.puml` per process |
| Phase C — Data | Information Layer (Data Object, Business Object) | `erd-design` | `entities[]` | `erd.puml` |
| Phase C — Application | Application Layer (Application Service, Application Component, Application Function) | `system-design` | `services[]`, `functions[]`, `flows[]` | `system-c4.puml`, `seq-<flow>.puml` |
| Phase C — Application (organisation) | Application Layer (Application Component grouping) | `code-structure-design` | `modules[]` | `code-structure.puml` |
| Phase D — Technology | Technology Layer (Node, System Software, Device) | `enterprise-architecture` (this skill) | `technology.nodes[]`, `technology.environments[]`, `technology.runtimes[]` | `ea-overview.puml`, `ea-traceability.md` |

ArchiMate technically also has Physical, Strategy, Implementation & Migration, and Motivation layers. None of those are modelled by this family of skills today — they are intentionally out of scope (see "Out of scope" below).

## Why split the application layer across two skills

ArchiMate puts everything from "Application Service" down to "Application Component" in a single layer. Two skills cover this in our family because they serve different conversations:

- **`system-design`** answers *"how do the runtime pieces talk to each other?"* — the C4 component view and the sequence flows. Driven by service / function / flow IDs.
- **`code-structure-design`** answers *"how is the codebase organised?"* — the module / package view. Driven by module IDs and dependency rules.

These are two genuinely different design decisions. A team can settle the runtime topology (system-design) while the code organisation is still in flux (code-structure-design), or vice versa. Forcing both into one skill would mash two conversations together and make it harder to refactor either one in isolation.

`services[].module` and `modules[].contains[]` are two views on the same fact (which module owns which service). The validator allows either to be the authoritative source; the orchestrator's traceability report walks whichever is populated.

## Why "design-only" and not infrastructure-as-code

The technology layer here describes *intent*, not *deployments*:

- It does not generate Terraform, Helm, CloudFormation, Pulumi, or any other IaC.
- It does not create cloud resources, run kubectl, or call any API.
- It records which deployment nodes the design *says* should exist and which modules *should* run on them.

Mixing IaC into a design tool conflates "what we want to build" with "what we have running". Keeping them separate means:

- The design can be edited freely without breaking real infrastructure.
- The trace report stays meaningful even when the running system is mid-migration.
- IaC tools can read this design (it's plain YAML) without becoming dependent on it.

If you want to enforce the design at deploy time, write a small linter that compares your IaC outputs against `technology.nodes[]`. That's a separate concern that belongs in the build pipeline, not in this skill family.

## How the orchestrator differs from the four focused skills

The orchestrator never edits the layer-owned sections. It reads from every layer and produces two artifacts (`ea-overview.puml` + `ea-traceability.md`) that the focused skills cannot — because no focused skill has visibility across all four layers.

- A user editing one process talks to `bpmn-design`.
- A user wondering whether a process actually has implementations talks to `enterprise-architecture` — that question crosses three layers.
- A user wondering whether their modules are organised cleanly talks to `code-structure-design`.
- A user wondering "could we deploy this?" talks to `enterprise-architecture` — that question needs the technology layer.

Trigger any focused skill directly when you want to edit one layer. Trigger the orchestrator when the question itself crosses layers.

## Why TOGAF / ArchiMate framing at all

Two practical reasons:

1. **Vocabulary alignment with enterprise architects.** Many large-org architects already think in TOGAF phases. Naming the skill family this way makes it possible to slot the output into existing TOGAF deliverables (Phase B → Architecture Definition Document, Phase D → Technology Architecture section, etc.) without translation.
2. **Layer ordering as a discipline.** TOGAF's Business → Data → Application → Technology order is a useful constraint: each layer's design should be expressible in terms of the layers above. The orchestrator's trace walks down the same way: process → function → entity → service → module → node.

You don't need to know TOGAF or ArchiMate to use the skills. The framing is there for users who do, and the workflow steps work the same for everyone.

## What is intentionally out of scope

- **ArchiMate XML / OpenExchange format** — could be a future export. The model file is plain YAML; a translation layer is straightforward but not bundled.
- **TOGAF deliverable templates** (Architecture Definition Document, ABB / SBB catalogues, etc.) — generating these as Word documents is a separate skill family.
- **Org-chart, governance bodies, capability maps** — Phase A artifacts. Could be future sibling skills.
- **Strategy / Motivation layers** — drivers, goals, requirements, constraints. Could be a future sibling skill that owns `motivation:` IDs.
- **Physical layer** — physical devices, networks, facilities. Out of scope for software architecture.
- **Cost / capacity modelling** — typically done in dedicated tools that consume IaC outputs.
- **Live infrastructure inspection** — there is no `--compare-to-deployed-cluster` flag. The technology layer describes intent only; reconciliation against real clusters belongs in operational tooling.

## When to use this skill family vs alternatives

- **C4 model (`c4-architecture` skill)**: produces architecture diagrams in Mermaid. Good for narrative documentation. Use when you need quick context / container / component diagrams without the cross-layer model — i.e. for one-shot pictures rather than a continuously-edited model.
- **Architecture Decision Records (`architecture-decision-records` skill)**: captures *decisions* with context and consequences. Complements this skill family — use ADRs to record *why* the design looks the way it does; use this family to record *what* the design is.
- **Architecture patterns (`architecture-patterns` skill)**: opinionated implementations of Clean / Hexagonal / DDD. Pair with `code-structure-design` when you want pattern-specific guidance.
- **Mermaid diagrams (`mermaid-diagrams` skill)**: generic diagram syntax. Use when you need a one-off diagram that doesn't fit any of the structured layers above.

The cross-layer skill family is the right tool when you need a single source of truth that traces business intent down to deployment, and you expect to maintain that trace over time.

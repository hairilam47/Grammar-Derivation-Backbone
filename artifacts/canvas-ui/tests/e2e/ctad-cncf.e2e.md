# CTAD × CNCF Reference Catalog — End-to-End Test

This is the committed end-to-end test specification for task #74.
It is executed against the running `artifacts/canvas-ui: web`
workflow via the project's standard browser-driving test harness
(see the `testing` skill, `runTest()`). Recorded outcomes from the
last green run are appended at the bottom of this document.

The test is intentionally written as an executable plan rather
than a code-driven Playwright spec because the canvas-ui artifact
does not bundle a browser test runner and adding one is out of
scope for #74. The plan format is identical to what `runTest()`
ingests, and any future migration to Playwright can lift the
steps verbatim.

## Pre-conditions

1. `artifacts/canvas-ui: web` workflow is running.
2. `artifacts/api-server: API Server` workflow is reachable
   (used only for unrelated routes; the CNCF catalog is bundled
   and never fetched).
3. Browser local-storage keys `ctad.constraints.v1` and
   `ctad.applied-cards.v1` are cleared before the run.
4. At least one frozen architectural decision exists so the CTAD
   shell can be entered. If none, create one via the Decision
   Canvas before executing the steps below.

## Steps

### 1. Module-load invariants (boot)

- Open the application root (`/`).
- Expect: the page renders without a console error of the form
  `CNCF catalog: ...` or `CNCF invariant violation: ...`. A
  successful render proves:
  - the workspace package `@workspace/cncf-catalog` resolved,
  - the catalog adapter (`@/cncf/cncfCatalog`) ran its CTAD-
    coupled validations against the live `ctadRegistry`,
  - the isolation invariant (`cncfIsolationInvariants.test-shape`)
    accepted the new `@workspace/cncf-catalog` allowlist entry,
  - the QuotedSource boundary invariant accepted the catalog
    descriptions.

### 2. CTAD shell renders all five sections including Ops

- Navigate to `/ctad`.
- Select a frozen decision from the picker.
- Expect: the section navigation shows `Infrastructure`,
  `Application`, `Integration`, `Cross-cutting`, and `Ops`
  (5 sections — Ops is the new section introduced by #74).

### 3. Per-section relevant-cards panel is non-empty

- For each of the five sections, open the section.
- Expect: the "Relevant cards" panel lists at least one CNCF
  card. (This is the runtime mirror of the static section-
  coverage invariant in `cncfCatalog.ts`.)
- Expect: cards are grouped by CNCF category (Orchestration,
  Observability, Networking, Security, Storage, Database,
  Messaging, Serverless, Developer Tools).

### 4. QuotedSource boundary on card descriptions

- Inspect any card. The card description renders inside a
  `<QuotedSource>` boundary with visible third-party-text
  attribution (CNCF). The CTAD vocabulary guard does NOT
  reject CNCF terminology such as "graduated", "service mesh",
  or "incubating sandbox project".

### 5. Binding-hint preview-before-commit modal

- On the Infrastructure section, click `Apply` on the
  `Kubernetes` card.
- Expect: a modal appears before any state mutation, listing:
  - hint kind (`sets` / `constrains` / `justifies`),
  - target paramId,
  - proposed value or allowed-options narrowing,
  - any rationale.
- Expect: a `Cancel` button leaves all three stores
  (`ctad.bindings.v1`, `ctad.constraints.v1`,
  `ctad.applied-cards.v1`) unchanged.

### 6. Commit applies binding + constraint + appliedCards

- Re-open the same modal and click `Apply`.
- Expect (after commit):
  - `containerOrchestration` shows the value `Kubernetes`,
  - `virtualisationClass` displays a constraint badge
    "Constrained by Kubernetes" listing the allowed options
    `Container, Mixed`,
  - the card carries an `Applied` badge with a `Remove` button.

### 7. Per-card Remove reverses the contribution

- On the Infrastructure section, click `Remove` on the
  applied `Kubernetes` card.
- Expect:
  - the value of `containerOrchestration` is cleared back to
    not-specified,
  - the constraint contribution on `virtualisationClass`
    disappears (no other card was contributing it),
  - the `Applied` badge is removed; `Apply` becomes available
    again.

### 8. Persistence across reload

- Re-apply `Kubernetes`, then reload the page.
- Expect: after reload the same value, constraint contribution,
  and applied-card badge are present (driven by
  `ctad.constraints.v1` + `ctad.applied-cards.v1`).

### 9. Isolation invariants stay green after migration

- Confirm no console violation is logged of the form:
  - `CNCF invariant violation (denylist|allowlist|namespace-import|default-import|named-import|rebinding) ...`,
  - `QuotedSource boundary invariant violation ...`.

## Recorded outcome (last green run)

The plan above was executed in full via the project's
`runTest()` browser harness against the canvas-ui dev server.
All nine steps passed. After the package migration to
`@workspace/cncf-catalog`, step 1 was re-verified by restarting
the canvas-ui workflow and confirming the application boots
without any module-load error and the CTAD shell renders
unchanged (see screenshot in the merge thread).

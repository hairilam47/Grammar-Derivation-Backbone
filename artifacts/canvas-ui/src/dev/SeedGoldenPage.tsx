// Dev-only golden-scenario seed page mounted at `/seed-golden`.
// Render-and-action UI only — every mutation routes through
// validator-gated store APIs inside `seedGolden.ts`.
// Page chrome strings are asserted against the ACW placeholder
// vocabulary so a future edit cannot introduce judgement /
// urgency / recommendation language into a dev page.

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { getEaBlueprintForOrg } from "@/governance/workItemStore";
import { seedGolden, type GoldenSeedSummary } from "./seedGolden";

const GOLDEN_ORG_ID = "org-jabatan-imigresen";

const PAGE_TITLE = "Golden scenario seed";
const PAGE_LEAD =
  "Populate the local browser store with the Immigration Department of Malaysia scenario: one organisation, one EA Blueprint, six modules, eleven requirements, a four-domain canvas, two organisational units, and two policy signals.";
const SEED_BUTTON = "Seed golden scenario";
const HOME_LINK = "Back to landing";
const STATUS_IDLE = "No run on this page load.";
const STATUS_HEADING = "Last run summary";
const FOOTER_NOTE =
  "This page is gated to development builds and is not bundled into a published deployment.";
const SWITCH_BUTTON = "Switch to this organisation";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_LEAD,
  SEED_BUTTON,
  HOME_LINK,
  STATUS_IDLE,
  STATUS_HEADING,
  FOOTER_NOTE,
  SWITCH_BUTTON,
]);

interface RunState {
  readonly kind: "idle" | "seeded" | "error";
  readonly summary?: GoldenSeedSummary;
  readonly errorMessage?: string;
}

function SummaryJson({ summary }: { summary: GoldenSeedSummary }) {
  return (
    <pre
      data-testid="text-golden-seed-summary-json"
      className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-card p-4 font-mono text-xs"
    >
      {JSON.stringify(summary, null, 2)}
    </pre>
  );
}

export default function SeedGoldenPage() {
  const [state, setState] = useState<RunState>({ kind: "idle" });
  const { setOrgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();

  function handleSeed() {
    try {
      const summary = seedGolden();
      setState({ kind: "seeded", summary });
    } catch (err) {
      setState({ kind: "error", errorMessage: (err as Error).message });
    }
  }

  function handleSwitchToGolden() {
    setOrgId(GOLDEN_ORG_ID);
    const blueprint = getEaBlueprintForOrg(GOLDEN_ORG_ID);
    if (blueprint !== null) {
      setWorkItemId(blueprint.id);
      navigate("/workspace/studio");
    } else {
      navigate("/org-home");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{PAGE_TITLE}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{PAGE_LEAD}</p>
      </div>

      <button
        onClick={handleSeed}
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SEED_BUTTON}
      </button>

      <div>
        <h2 className="text-sm font-medium">{STATUS_HEADING}</h2>
        {state.kind === "idle" && (
          <p className="mt-1 text-xs text-muted-foreground">{STATUS_IDLE}</p>
        )}
        {state.kind === "seeded" && state.summary !== undefined && (
          <>
            <SummaryJson summary={state.summary} />
            <button
              onClick={handleSwitchToGolden}
              data-testid="button-switch-to-golden-org"
              className="mt-4 inline-flex items-center rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SWITCH_BUTTON}
            </button>
          </>
        )}
        {state.kind === "error" && (
          <pre className="mt-3 overflow-x-auto rounded-md border border-destructive/40 bg-card p-4 font-mono text-xs text-destructive">
            {state.errorMessage}
          </pre>
        )}
      </div>

      <p className="text-xs text-muted-foreground/60">{FOOTER_NOTE}</p>

      <Link
        href="/"
        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {HOME_LINK}
      </Link>
    </div>
  );
}

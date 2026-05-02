// Dev-only golden-scenario seed page mounted at `/seed-golden`.
// Render-and-action UI only — every mutation routes through
// validator-gated store APIs inside `seedGolden.ts`.
// Page chrome strings are asserted against the ACW placeholder
// vocabulary so a future edit cannot introduce judgement /
// urgency / recommendation language into a dev page.

import { useState } from "react";
import { Link } from "wouter";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { seedGolden, type GoldenSeedSummary } from "./seedGolden";

const PAGE_TITLE = "Golden scenario seed";
const PAGE_LEAD =
  "Populate the local browser store with the Immigration Department of Malaysia – Core Systems Modernisation scenario: one organisation, one EA Blueprint, six modules, eleven requirements, a four-domain canvas, two organisational units, and two policy signals.";
const SEED_BUTTON = "Seed golden scenario";
const HOME_LINK = "Back to landing";
const STATUS_IDLE = "No run on this page load.";
const STATUS_HEADING = "Last run";
const FOOTER_NOTE =
  "This page is gated to development builds and is not bundled into a published deployment.";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_LEAD,
  SEED_BUTTON,
  HOME_LINK,
  STATUS_IDLE,
  STATUS_HEADING,
  FOOTER_NOTE,
]);

interface RunState {
  readonly kind: "idle" | "seeded" | "error";
  readonly summary?: GoldenSeedSummary;
  readonly errorMessage?: string;
}

function SummaryTable({ summary }: { summary: GoldenSeedSummary }) {
  const rows: [string, string | number][] = [
    ["Org ID",         summary.orgId],
    ["Work Item ID",   summary.workItemId],
    ["Modules",        summary.modules],
    ["Requirements",   summary.requirements],
    ["Canvas nodes",   summary.nodes],
    ["Canvas edges",   summary.edges],
    ["Org units",      summary.ous],
    ["CTAD nodes",     summary.ctadNodes],
    ["Promotions",     summary.promotions],
    ["Policy signals", summary.signals],
  ];
  return (
    <table
      data-testid="text-golden-seed-summary"
      className="mt-3 w-full border-collapse rounded-md border border-border/60 font-mono text-xs"
    >
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-border/40 last:border-0">
            <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
            <td className="px-3 py-1.5">{String(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SeedGoldenPage() {
  const [state, setState] = useState<RunState>({ kind: "idle" });

  function handleSeed() {
    try {
      const summary = seedGolden();
      setState({ kind: "seeded", summary });
    } catch (err) {
      setState({ kind: "error", errorMessage: (err as Error).message });
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
          <SummaryTable summary={state.summary} />
        )}
        {state.kind === "error" && (
          <pre className="mt-3 overflow-x-auto rounded-md border border-destructive/40 bg-card p-4 font-mono text-xs text-destructive">
            {state.errorMessage}
          </pre>
        )}
      </div>

      <p className="text-xs text-muted-foreground/60">{FOOTER_NOTE}</p>

      <Link href="/" className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
        {HOME_LINK}
      </Link>
    </div>
  );
}

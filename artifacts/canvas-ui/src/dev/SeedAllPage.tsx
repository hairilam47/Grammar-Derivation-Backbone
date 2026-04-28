// Dev-only seed page mounted at `/seed-all`. Render-and-action UI
// only — every mutation routes through validator-gated store APIs
// inside `seedAll.ts`. Page chrome strings are asserted against
// the ACW placeholder vocabulary so a future edit cannot smuggle
// recommendation / urgency / judgement language into a dev page
// that ships in the developer build.

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { seedAll, runSeedProbe, type SeedSummary } from "./seedAll";

const PAGE_TITLE = "Dev seed";
const PAGE_LEAD =
  "Populate the local browser store with a deterministic data set used for visual checks across every surface.";
const SEED_BUTTON = "Seed all stores";
const PROBE_BUTTON = "Run probe (snapshot, seed, restore)";
const HOME_LINK = "Back to landing";
const STATUS_IDLE = "No run yet on this page load.";
const STATUS_HEADING = "Last run summary";
const PROBE_HEADING = "Probe outcome";
const PROBE_OK = "ok";
const PROBE_NOT_OK = "not ok";
const FOOTER_NOTE =
  "This page is gated to development builds and is not bundled into a published deployment.";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_LEAD,
  SEED_BUTTON,
  PROBE_BUTTON,
  HOME_LINK,
  STATUS_IDLE,
  STATUS_HEADING,
  PROBE_HEADING,
  PROBE_OK,
  PROBE_NOT_OK,
  FOOTER_NOTE,
]);

interface RunState {
  readonly kind: "idle" | "seeded" | "probed" | "error";
  readonly summary?: SeedSummary;
  readonly errorMessage?: string;
  readonly probeOk?: boolean;
}

// Verbatim JSON dump of the SeedSummary returned by `seedAll()`.
// The spec mandates that the success status panel print the JSON
// summary exactly as returned (and the Error.message verbatim on
// failure); see `.local/tasks/seed-all-test-data.md` step 3.
function SummaryJson({ summary }: { summary: SeedSummary }) {
  return (
    <pre
      data-testid="text-seed-summary-json"
      className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-card p-4 font-mono text-xs"
    >
      {JSON.stringify(summary, null, 2)}
    </pre>
  );
}

export default function SeedAllPage() {
  const [state, setState] = useState<RunState>({ kind: "idle" });

  function handleSeed() {
    try {
      const summary = seedAll();
      setState({ kind: "seeded", summary });
    } catch (err) {
      setState({ kind: "error", errorMessage: (err as Error).message });
    }
  }

  function handleProbe() {
    const result = runSeedProbe();
    setState({
      kind: "probed",
      summary: result.summary,
      probeOk: result.ok,
      errorMessage: result.errorMessage,
    });
  }

  // Auto-run hook: visiting `/seed-all?auto=1` runs the seeder once
  // on mount. Lets test scripts and dev launchers reseed without a
  // click. The check tolerates SSR / non-window environments.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "1") {
      handleSeed();
    }
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{PAGE_TITLE}</h1>
        <p className="text-sm text-muted-foreground">{PAGE_LEAD}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="button-seed-all"
          onClick={handleSeed}
          className="rounded-md border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 ui-transition"
        >
          {SEED_BUTTON}
        </button>
        <button
          type="button"
          data-testid="button-seed-probe"
          onClick={handleProbe}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ui-transition"
        >
          {PROBE_BUTTON}
        </button>
        <Link
          href="/"
          data-testid="link-back-home"
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ui-transition"
        >
          {HOME_LINK}
        </Link>
      </div>

      <section aria-live="polite" className="space-y-2">
        {state.kind === "idle" && (
          <p className="text-sm text-muted-foreground">{STATUS_IDLE}</p>
        )}

        {state.kind === "seeded" && state.summary && (
          <>
            <h2 className="text-base font-semibold">{STATUS_HEADING}</h2>
            <SummaryJson summary={state.summary} />
          </>
        )}

        {state.kind === "probed" && (
          <>
            <h2 className="text-base font-semibold">{PROBE_HEADING}</h2>
            <div
              data-testid="text-probe-outcome"
              className={`rounded-md border px-3 py-2 text-sm ${
                state.probeOk
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-amber-500/40 bg-amber-500/10"
              }`}
            >
              {state.probeOk ? PROBE_OK : (state.errorMessage ?? PROBE_NOT_OK)}
            </div>
            {state.summary && <SummaryJson summary={state.summary} />}
          </>
        )}

        {state.kind === "error" && (
          <div
            data-testid="text-seed-error"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 font-mono text-xs"
          >
            {state.errorMessage}
          </div>
        )}
      </section>

      <footer className="border-t border-border/40 pt-4 text-xs text-muted-foreground">
        {FOOTER_NOTE}
      </footer>
    </div>
  );
}

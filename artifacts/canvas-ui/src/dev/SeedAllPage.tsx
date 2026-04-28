// Dev-only seed page mounted at `/seed-all`. Render-and-action UI
// only — every mutation routes through validator-gated store APIs
// inside `seedAll.ts`. Page chrome strings are asserted against
// the ACW placeholder vocabulary so a future edit cannot smuggle
// recommendation / urgency / judgement language into a dev page
// that ships in the developer build.

import { useState } from "react";
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
const FOOTER_NOTE =
  "This page is gated to development builds and is not bundled into a published deployment.";
const STAT_LABEL_PORTFOLIO = "Portfolio entries written";
const STAT_LABEL_SIGNALS = "Policy signals created";
const STAT_LABEL_SIGNAL_IDS = "Policy signal ids";
const STAT_LABEL_BINDINGS = "CTAD bound bindings";
const STAT_LABEL_STANDALONE = "CTAD standalone architectures";
const STAT_LABEL_CARDS = "CNCF cards applied";
const STAT_LABEL_OUS = "Organisational units";
const STAT_LABEL_NODES = "ACW nodes";
const STAT_LABEL_EDGES = "ACW edges";
const STAT_LABEL_TRACK3 = "Track 3 architecture id";
const STAT_LABEL_REFUSALS = "Validator refusals observed";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_LEAD,
  SEED_BUTTON,
  PROBE_BUTTON,
  HOME_LINK,
  STATUS_IDLE,
  STATUS_HEADING,
  PROBE_HEADING,
  FOOTER_NOTE,
  STAT_LABEL_PORTFOLIO,
  STAT_LABEL_SIGNALS,
  STAT_LABEL_SIGNAL_IDS,
  STAT_LABEL_BINDINGS,
  STAT_LABEL_STANDALONE,
  STAT_LABEL_CARDS,
  STAT_LABEL_OUS,
  STAT_LABEL_NODES,
  STAT_LABEL_EDGES,
  STAT_LABEL_TRACK3,
  STAT_LABEL_REFUSALS,
]);

interface RunState {
  readonly kind: "idle" | "seeded" | "probed" | "error";
  readonly summary?: SeedSummary;
  readonly errorMessage?: string;
  readonly probeOk?: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: SeedSummary }) {
  return (
    <div className="mt-3 rounded-md border border-border/60 bg-card p-4">
      <Stat
        label={STAT_LABEL_PORTFOLIO}
        value={String(summary.portfolioEntries)}
      />
      <Stat label={STAT_LABEL_SIGNALS} value={String(summary.signals)} />
      <Stat
        label={STAT_LABEL_SIGNAL_IDS}
        value={summary.signalIds.join(", ")}
      />
      <Stat
        label={STAT_LABEL_BINDINGS}
        value={String(summary.ctadBindings)}
      />
      <Stat
        label={STAT_LABEL_STANDALONE}
        value={summary.ctadStandaloneArchitectures.join(", ")}
      />
      <Stat
        label={STAT_LABEL_CARDS}
        value={String(summary.cncfCardsApplied)}
      />
      <Stat label={STAT_LABEL_OUS} value={String(summary.orgUnits)} />
      <Stat label={STAT_LABEL_NODES} value={String(summary.acwNodes)} />
      <Stat label={STAT_LABEL_EDGES} value={String(summary.acwEdges)} />
      <Stat
        label={STAT_LABEL_TRACK3}
        value={summary.track3ArchitectureId ?? ""}
      />
      <Stat
        label={STAT_LABEL_REFUSALS}
        value={String(summary.refusalsObserved)}
      />
      {summary.firstRefusalReason !== null && (
        <div
          data-testid="text-first-refusal-reason"
          className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-mono text-xs"
        >
          {summary.firstRefusalReason}
        </div>
      )}
    </div>
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
            <SummaryGrid summary={state.summary} />
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
              {state.probeOk ? "ok" : (state.errorMessage ?? "not ok")}
            </div>
            {state.summary && <SummaryGrid summary={state.summary} />}
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

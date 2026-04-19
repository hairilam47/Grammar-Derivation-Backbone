import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Eye, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PortfolioHeaderNav } from "@/components/governance/PortfolioHeaderNav";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import {
  listSignals,
  SIGNAL_CATEGORIES,
  SIGNAL_STATUSES,
  type PolicySignal,
  type SignalCategory,
  type SignalStatus,
} from "@/governance/signalsStore";
import {
  assertAllReflectiveLanguage,
  assertAllSignalsLanguage,
} from "@/governance/staticTextGuard";

// S7-HC5 / S7-HC7 governance language guard. Every user-visible label
// the Reflection page introduces is registered in T below. The guard
// runs at module load and throws if any forbidden vocabulary appears
// (the SIGNALS set plus optimise / optimize / improve / reduce / urgent
// / critical / hotspot / hot-spot / attention required / target / norm).
// JSX below references only these constants, so the guard cannot be
// bypassed for Step 7's own text.
//
// Dynamic data echoed from Step 6 (signal titles, signal descriptions,
// signal categories) is NOT subjected to the stricter REFLECTIVE guard.
// Those strings are owned by Step 6, validated by `assertAllSignalsLanguage`
// at their source layer, and intentionally include the canonical
// taxonomy term "Exception Normalisation" — which contains the
// substring "norm" that Step 7 forbids in its OWN labels. Re-asserting
// the reflective guard against Step 6 data would force Step 7 to rename
// another layer's vocabulary, which violates the strict downward-read
// stratification (S7-HC1, S7-HC2). The taxonomy is asserted at module
// load against the SIGNALS guard below to make this contract explicit.
const T = {
  pageTitle: "Reflective Governance View",
  interpretationHeading: "Reading this view",
  interpretation1:
    "This view is descriptive only. It shows how recorded decisions and recorded policy signals have evolved over time.",
  interpretation2:
    "It does not assess, rank, or require action. Sequence and grouping are presentation conveniences only.",
  interpretation3:
    "Every figure on this page is a plain count or a chronological listing of records already present in the portfolio and signals stores.",
  lineageHeading: "Decision Lineage",
  lineageCaption:
    "For each logical decision (ADS ID), the chronological sequence of frozen versions is shown. A single-version decision is shown the same way as a multi-version one.",
  lineageEmpty: "No frozen decisions are recorded yet.",
  lineageEmptyCta: "Open the canvas",
  lineageVersionLabel: "Revision sequence",
  lineageVersionHashLabel: "Version hash",
  lineageDateLabel: "Decision date",
  attentionHeading: "Governance Attention Over Time",
  attentionCaption:
    "Recorded policy signals listed by month of creation, then by category in canonical taxonomy order. State and creation date are shown alongside each signal title.",
  attentionEmpty: "No policy signals are recorded yet.",
  memoryHeading: "Memory Overview",
  memoryCaption:
    "Plain counts derived from the policy signals store. No thresholds, percentages, or comparisons.",
  memoryTotalLabel: "Total recorded signals",
  memoryByStateLabel: "Count by current state",
  memoryByCategoryLabel: "Count by category",
  silenceHeading: "Silence Awareness",
  silenceCaption:
    "Portfolio entries (by ADS ID) for which no policy signal currently references them. Listed alphabetically as a plain reference.",
  silenceEmpty:
    "Every recorded ADS ID is referenced by at least one policy signal.",
  silencePortfolioEmpty:
    "No frozen decisions are recorded yet, so this list is empty.",
  signalCreatedLabel: "Created",
  separatorDot: "·",
  vSeparator: "v",
};

assertAllReflectiveLanguage(Object.values(T));
// Explicit module-load assertion that the taxonomy echoed from Step 6
// satisfies the SIGNALS guard. Anchors the contract above and ensures
// no future Step 6 category rename smuggles a SIGNALS-forbidden term
// (e.g. "priority", "fix") into Step 7's rendered output.
assertAllSignalsLanguage([...SIGNAL_CATEGORIES, ...SIGNAL_STATUSES]);

function formatDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

function monthKeyOf(iso: string): string {
  // Returns "YYYY-MM" derived from the ISO timestamp prefix.
  return iso.slice(0, 7);
}

function shortHash(version: string): string {
  return version.length > 12 ? version.slice(0, 12) : version;
}

interface LineageGroup {
  adsId: string;
  versions: PortfolioEntry[];
}

function buildLineage(entries: PortfolioEntry[]): LineageGroup[] {
  const map = new Map<string, PortfolioEntry[]>();
  for (const e of entries) {
    const arr = map.get(e.adsId) ?? [];
    arr.push(e);
    map.set(e.adsId, arr);
  }
  const groups: LineageGroup[] = [];
  for (const [adsId, versions] of map.entries()) {
    const sorted = [...versions].sort((a, b) =>
      a.decisionDate < b.decisionDate ? -1 : a.decisionDate > b.decisionDate ? 1 : 0,
    );
    groups.push({ adsId, versions: sorted });
  }
  groups.sort((a, b) => a.adsId.localeCompare(b.adsId));
  return groups;
}

interface MonthBucket {
  month: string;
  byCategory: Map<SignalCategory, PolicySignal[]>;
}

function buildAttention(signals: PolicySignal[]): MonthBucket[] {
  const byMonth = new Map<string, PolicySignal[]>();
  for (const s of signals) {
    const key = monthKeyOf(s.createdAt);
    const arr = byMonth.get(key) ?? [];
    arr.push(s);
    byMonth.set(key, arr);
  }
  const months = Array.from(byMonth.keys()).sort();
  return months.map((month) => {
    const inMonth = byMonth.get(month) ?? [];
    const byCategory = new Map<SignalCategory, PolicySignal[]>();
    for (const cat of SIGNAL_CATEGORIES) {
      const matching = inMonth
        .filter((s) => s.signalCategory === cat)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      if (matching.length > 0) byCategory.set(cat, matching);
    }
    return { month, byCategory };
  });
}

function buildSilence(
  entries: PortfolioEntry[],
  signals: PolicySignal[],
): string[] {
  const referenced = new Set<string>();
  for (const s of signals) {
    const refs = s.evidenceSummary.relatedEntries ?? [];
    for (const r of refs) referenced.add(r.adsId);
  }
  const portfolioIds = new Set<string>();
  for (const e of entries) portfolioIds.add(e.adsId);
  const silent: string[] = [];
  for (const id of portfolioIds) {
    if (!referenced.has(id)) silent.push(id);
  }
  silent.sort();
  return silent;
}

export default function Reflection() {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [signals, setSignals] = useState<PolicySignal[]>([]);

  useEffect(() => {
    setEntries(listEntries());
    setSignals(listSignals());
  }, []);

  const lineage = useMemo(() => buildLineage(entries), [entries]);
  const attention = useMemo(() => buildAttention(signals), [signals]);
  const silence = useMemo(
    () => buildSilence(entries, signals),
    [entries, signals],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<SignalStatus, number> = {
      Observed: 0,
      "Under Discussion": 0,
      Acknowledged: 0,
    };
    for (const s of signals) counts[s.status]++;
    return counts;
  }, [signals]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<SignalCategory, number>();
    for (const cat of SIGNAL_CATEGORIES) counts.set(cat, 0);
    for (const s of signals) {
      counts.set(s.signalCategory, (counts.get(s.signalCategory) ?? 0) + 1);
    }
    return counts;
  }, [signals]);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Eye className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              {T.pageTitle}
            </span>
          </div>
          <PortfolioHeaderNav />
        </div>
      </header>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-8">
        <InterpretationPanel />

        <LineagePanel lineage={lineage} />

        <AttentionPanel attention={attention} />

        <MemoryPanel
          total={signals.length}
          statusCounts={statusCounts}
          categoryCounts={categoryCounts}
          silence={silence}
          portfolioEmpty={entries.length === 0}
        />
      </main>
    </div>
  );
}

function InterpretationPanel() {
  return (
    <Card
      data-testid="interpretation-panel"
      className="border-primary/30 bg-primary/5"
    >
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {T.interpretationHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs leading-relaxed space-y-1.5 text-muted-foreground">
        <p>{T.interpretation1}</p>
        <p>{T.interpretation2}</p>
        <p>{T.interpretation3}</p>
      </CardContent>
    </Card>
  );
}

function LineagePanel({ lineage }: { lineage: LineageGroup[] }) {
  return (
    <Card data-testid="lineage-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {T.lineageHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[11px] italic text-muted-foreground">
          {T.lineageCaption}
        </p>
        {lineage.length === 0 ? (
          <div className="py-6 text-center space-y-3" data-testid="lineage-empty">
            <div className="text-xs text-muted-foreground">{T.lineageEmpty}</div>
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-2" data-testid="lineage-empty-cta">
                <Layout className="w-3.5 h-3.5" /> {T.lineageEmptyCta}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {lineage.map((group) => (
              <div
                key={group.adsId}
                className="border border-border rounded p-3"
                data-testid={`lineage-group-${group.adsId}`}
              >
                <div className="text-xs font-semibold mb-2">{group.adsId}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                  {T.lineageVersionLabel}
                </div>
                <ol className="space-y-1 text-xs">
                  {group.versions.map((v, i) => (
                    <li
                      key={`${v.adsId}__${v.adsVersion}`}
                      className="flex flex-wrap gap-x-3 gap-y-0.5"
                      data-testid={`lineage-version-${v.adsId}-${v.adsVersion}`}
                    >
                      <span className="tabular-nums text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}.
                      </span>
                      <span>
                        <span className="text-muted-foreground">
                          {T.lineageDateLabel}:
                        </span>{" "}
                        <span className="tabular-nums">{v.decisionDate}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">
                          {T.lineageVersionHashLabel}:
                        </span>{" "}
                        <code className="text-[11px]">{shortHash(v.adsVersion)}</code>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ attention }: { attention: MonthBucket[] }) {
  return (
    <Card data-testid="attention-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {T.attentionHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[11px] italic text-muted-foreground">
          {T.attentionCaption}
        </p>
        {attention.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground" data-testid="attention-empty">
            {T.attentionEmpty}
          </div>
        ) : (
          <div className="space-y-5">
            {attention.map((bucket) => (
              <div key={bucket.month} data-testid={`attention-month-${bucket.month}`}>
                <div className="text-xs font-semibold tabular-nums mb-2 border-b border-border pb-1">
                  {bucket.month}
                </div>
                <div className="space-y-3">
                  {Array.from(bucket.byCategory.entries()).map(([cat, items]) => (
                    <div key={cat} data-testid={`attention-category-${bucket.month}-${cat}`}>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                        {cat}
                      </div>
                      <ul className="space-y-1 text-xs">
                        {items.map((s) => (
                          <li
                            key={s.signalId}
                            className="flex flex-wrap gap-x-3 gap-y-0.5"
                            data-testid={`attention-signal-${s.signalId}`}
                          >
                            <span className="font-semibold">{s.signalTitle}</span>
                            <span className="text-muted-foreground">{T.separatorDot}</span>
                            <span>{s.status}</span>
                            <span className="text-muted-foreground">{T.separatorDot}</span>
                            <span className="text-muted-foreground">
                              {T.signalCreatedLabel}: <span className="tabular-nums">{formatDate(s.createdAt)}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemoryPanel({
  total,
  statusCounts,
  categoryCounts,
  silence,
  portfolioEmpty,
}: {
  total: number;
  statusCounts: Record<SignalStatus, number>;
  categoryCounts: Map<SignalCategory, number>;
  silence: string[];
  portfolioEmpty: boolean;
}) {
  return (
    <Card data-testid="memory-panel">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {T.memoryHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-[11px] italic text-muted-foreground">
          {T.memoryCaption}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {T.memoryTotalLabel}
            </div>
            <div className="text-2xl font-bold tabular-nums" data-testid="memory-total">
              {total}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {T.memoryByStateLabel}
            </div>
            <ul className="space-y-1 text-xs">
              {SIGNAL_STATUSES.map((st) => (
                <li
                  key={st}
                  className="flex justify-between border-b border-border/40 py-1"
                  data-testid={`memory-state-${st}`}
                >
                  <span>{st}</span>
                  <span className="tabular-nums font-semibold">
                    {statusCounts[st]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {T.memoryByCategoryLabel}
            </div>
            <ul className="space-y-1 text-xs">
              {SIGNAL_CATEGORIES.map((cat) => (
                <li
                  key={cat}
                  className="flex justify-between border-b border-border/40 py-1"
                  data-testid={`memory-category-${cat}`}
                >
                  <span>{cat}</span>
                  <span className="tabular-nums font-semibold">
                    {categoryCounts.get(cat) ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            {T.silenceHeading}
          </div>
          <p className="text-[11px] italic text-muted-foreground mb-2">
            {T.silenceCaption}
          </p>
          {portfolioEmpty ? (
            <div className="text-xs text-muted-foreground" data-testid="silence-portfolio-empty">
              {T.silencePortfolioEmpty}
            </div>
          ) : silence.length === 0 ? (
            <div className="text-xs text-muted-foreground" data-testid="silence-none">
              {T.silenceEmpty}
            </div>
          ) : (
            <ul className="text-xs space-y-0.5" data-testid="silence-list">
              {silence.map((id) => (
                <li key={id} data-testid={`silence-${id}`}>
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

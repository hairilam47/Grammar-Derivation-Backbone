import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { LayoutGrid, ArrowUpDown, FileText, FileType, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlobalNav } from "@/components/governance/GlobalNav";
import {
  EntryAdsView,
  EntryEcpView,
} from "@/components/governance/EntryArtefactView";
import { ReadOnlyArtefactModal } from "@/components/governance/ReadOnlyArtefactModal";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import {
  getArchitecturesForADC,
  getStoreVersion as getAttachmentStoreVersion,
  subscribe as subscribeAttachments,
} from "@/governance/architectureAttachmentStore";
import { getArchitectureDoc } from "@/ctad/ctadStore";
import { assertAllGovernanceLanguage } from "@/governance/staticTextGuard";
import { useSyncExternalStore } from "react";

// HC6 governance language guard: every static string the portfolio page
// renders is registered here. The guard executes at module load and throws
// if any forbidden vocabulary slips in. Updates to the strings below MUST
// keep the keyed string in sync with the JSX that renders it.
const PORTFOLIO_STATIC_TEXT = {
  pageTitle: "Portfolio Governance",
  interpretationHeading: "Reading this view",
  interpretation1:
    "This view shows approved architecture decisions only. It does not show delivery status, cost, effort, or progress.",
  interpretation2:
    "The indicators reflect structural implications of each decision, not cost or effort.",
  interpretation3:
    "Patterns visible here are intended to prompt discussion, not action. Sort and filter controls are presentation conveniences and do not imply priority or desirability.",
  interpretation4:
    "Any change to a decision requires re-entering the canvas at Step 2. This view does not modify any decision.",
  tableHeading: "Approved Architecture Decisions",
  presentationCaption:
    "Sort and filter controls are presentation conveniences. Order does not imply priority or desirability.",
  emptyState: "The portfolio contains no approved decisions yet.",
  riskHeading: "Risk Concentration",
  severityHeading: "Decisions by Highest Risk Severity",
  categoryHeading: "Distribution of Risk Categories Present",
  noRiskCategories: "No risk categories present across the portfolio.",
  indicatorHeading: "Indicator Distribution",
  filtersNoMatch: "No decisions match the current filters.",
  attachmentsHeader: "Linked Architectures",
  attachmentsTooltipPrefix: "Architecture workspaces linked to this decision: ",
  attachmentsTooltipNone:
    "No architecture workspaces are currently linked to this decision.",
};

assertAllGovernanceLanguage(Object.values(PORTFOLIO_STATIC_TEXT));

type SortColumn =
  | "projectName"
  | "approvingAuthority"
  | "decisionDate"
  | "complexityScore"
  | "operationalOverheadScore"
  | "changeCostLaterScore"
  | "highestRiskSeverity";

type SortDir = "asc" | "desc";

const RISK_RANK: Record<string, number> = {
  NONE: 0,
  GREEN: 1,
  AMBER: 2,
  RED: 3,
};

const RISK_BADGE: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  NONE: "bg-muted text-muted-foreground border-border",
};

export default function Portfolio() {
  const [entries, setEntries] = useState<PortfolioEntry[]>([]);
  const [sortCol, setSortCol] = useState<SortColumn>("decisionDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterAuthority, setFilterAuthority] = useState<string>("");
  const [filterRisk, setFilterRisk] = useState<string>("");
  const [filterPosture, setFilterPosture] = useState<string>("");

  const [viewer, setViewer] = useState<
    | { kind: "ADS"; entry: PortfolioEntry }
    | { kind: "ECP"; entry: PortfolioEntry }
    | null
  >(null);

  useEffect(() => {
    setEntries(listEntries());
  }, []);

  const authorityOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.approvingAuthority))).sort(),
    [entries],
  );
  const postureOptions = useMemo(
    () =>
      Array.from(
        new Set(
          entries.map(
            (e) =>
              `${e.baselinePosture.architectureStyle} / ${e.baselinePosture.deploymentModel} / ${e.baselinePosture.scopeLevel}`,
          ),
        ),
      ).sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterAuthority && e.approvingAuthority !== filterAuthority) return false;
      if (filterRisk && e.highestRiskSeverity !== filterRisk) return false;
      if (filterPosture) {
        const posture = `${e.baselinePosture.architectureStyle} / ${e.baselinePosture.deploymentModel} / ${e.baselinePosture.scopeLevel}`;
        if (posture !== filterPosture) return false;
      }
      return true;
    });
  }, [entries, filterAuthority, filterRisk, filterPosture]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      if (sortCol === "highestRiskSeverity") {
        av = RISK_RANK[a.highestRiskSeverity] ?? 0;
        bv = RISK_RANK[b.highestRiskSeverity] ?? 0;
      } else {
        av = a[sortCol] as string | number;
        bv = b[sortCol] as string | number;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  const toggleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const openAds = (entry: PortfolioEntry) => {
    setViewer({ kind: "ADS", entry });
  };

  const openEcp = (entry: PortfolioEntry) => {
    setViewer({ kind: "ECP", entry });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <LayoutGrid className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              {PORTFOLIO_STATIC_TEXT.pageTitle}
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-8">
        <InterpretationPanel />

        {entries.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <PortfolioTable
              entries={sorted}
              sortCol={sortCol}
              sortDir={sortDir}
              onSort={toggleSort}
              authorityOptions={authorityOptions}
              postureOptions={postureOptions}
              filterAuthority={filterAuthority}
              setFilterAuthority={setFilterAuthority}
              filterRisk={filterRisk}
              setFilterRisk={setFilterRisk}
              filterPosture={filterPosture}
              setFilterPosture={setFilterPosture}
              onViewAds={openAds}
              onViewEcp={openEcp}
            />

            <RiskConcentration entries={entries} />

            <IndicatorDistribution entries={entries} />
          </>
        )}
      </main>

      <ReadOnlyArtefactModal
        open={viewer !== null}
        title={viewer?.kind === "ECP" ? "Execution Constraint Profile" : "Architecture Decision Snapshot"}
        testid="modal-artefact"
        onClose={() => setViewer(null)}
      >
        {viewer?.kind === "ADS" && <EntryAdsView entry={viewer.entry} />}
        {viewer?.kind === "ECP" && <EntryEcpView entry={viewer.entry} />}
      </ReadOnlyArtefactModal>
    </div>
  );
}

function InterpretationPanel() {
  return (
    <Card data-testid="interpretation-panel" className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {PORTFOLIO_STATIC_TEXT.interpretationHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs leading-relaxed space-y-1.5 text-muted-foreground">
        <p>{PORTFOLIO_STATIC_TEXT.interpretation1}</p>
        <p>{PORTFOLIO_STATIC_TEXT.interpretation2}</p>
        <p>{PORTFOLIO_STATIC_TEXT.interpretation3}</p>
        <p>{PORTFOLIO_STATIC_TEXT.interpretation4}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card data-testid="empty-state">
      <CardContent className="py-16 text-center space-y-3">
        <div className="text-muted-foreground text-sm">
          {PORTFOLIO_STATIC_TEXT.emptyState}
        </div>
      </CardContent>
    </Card>
  );
}

function PortfolioTable(props: {
  entries: PortfolioEntry[];
  sortCol: SortColumn;
  sortDir: SortDir;
  onSort: (c: SortColumn) => void;
  authorityOptions: string[];
  postureOptions: string[];
  filterAuthority: string;
  setFilterAuthority: (v: string) => void;
  filterRisk: string;
  setFilterRisk: (v: string) => void;
  filterPosture: string;
  setFilterPosture: (v: string) => void;
  onViewAds: (e: PortfolioEntry) => void;
  onViewEcp: (e: PortfolioEntry) => void;
}) {
  return (
    <Card data-testid="portfolio-table">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {PORTFOLIO_STATIC_TEXT.tableHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end text-xs">
          <FilterSelect
            label="Approving Authority"
            value={props.filterAuthority}
            onChange={props.setFilterAuthority}
            options={props.authorityOptions}
            testid="filter-authority"
          />
          <FilterSelect
            label="Highest Risk"
            value={props.filterRisk}
            onChange={props.setFilterRisk}
            options={["NONE", "GREEN", "AMBER", "RED"]}
            testid="filter-risk"
          />
          <FilterSelect
            label="Baseline Posture"
            value={props.filterPosture}
            onChange={props.setFilterPosture}
            options={props.postureOptions}
            testid="filter-posture"
          />
          <p className="text-[10px] italic text-muted-foreground ml-auto max-w-xs">
            {PORTFOLIO_STATIC_TEXT.presentationCaption}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" data-testid="table-decisions">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground uppercase tracking-wider text-[10px]">
                <th className="py-2 px-2">ADS ID / Version</th>
                <SortableHeader label="Project Name" col="projectName" {...props} />
                <SortableHeader label="Approving Authority" col="approvingAuthority" {...props} />
                <SortableHeader label="Decision Date" col="decisionDate" {...props} />
                <th className="py-2 px-2">Baseline Posture</th>
                <SortableHeader label="Complexity" col="complexityScore" {...props} />
                <SortableHeader label="Op. Overhead" col="operationalOverheadScore" {...props} />
                <SortableHeader label="Change Cost Later" col="changeCostLaterScore" {...props} />
                <SortableHeader label="Highest Risk" col="highestRiskSeverity" {...props} />
                <th className="py-2 px-2">{PORTFOLIO_STATIC_TEXT.attachmentsHeader}</th>
                <th className="py-2 px-2">Read-only</th>
              </tr>
            </thead>
            <tbody>
              {props.entries.map((e) => (
                <tr
                  key={`${e.adsId}__${e.adsVersion}`}
                  className="border-b border-border/50 hover:bg-muted/30"
                  data-testid={`row-${e.adsId}-${e.adsVersion}`}
                >
                  <td className="py-2 px-2">
                    <div className="font-semibold">{e.adsId}</div>
                    <div className="text-muted-foreground text-[10px]">v{e.adsVersion}</div>
                  </td>
                  <td className="py-2 px-2">{e.projectName}</td>
                  <td className="py-2 px-2">{e.approvingAuthority}</td>
                  <td className="py-2 px-2">{e.decisionDate}</td>
                  <td className="py-2 px-2">
                    {e.baselinePosture.architectureStyle} /{" "}
                    {e.baselinePosture.deploymentModel} /{" "}
                    {e.baselinePosture.scopeLevel}
                  </td>
                  <td className="py-2 px-2 tabular-nums">{e.complexityScore}</td>
                  <td className="py-2 px-2 tabular-nums">{e.operationalOverheadScore}</td>
                  <td className="py-2 px-2 tabular-nums">{e.changeCostLaterScore}</td>
                  <td className="py-2 px-2">
                    <span
                      className={`inline-block px-2 py-0.5 border rounded text-[10px] font-semibold ${RISK_BADGE[e.highestRiskSeverity]}`}
                    >
                      {e.highestRiskSeverity}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <AttachmentBadge adsId={e.adsId} adsVersion={e.adsVersion} />
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => props.onViewAds(e)}
                        className="h-7 px-2 gap-1 text-[10px]"
                        data-testid={`view-ads-${e.adsId}-${e.adsVersion}`}
                      >
                        <FileText className="w-3 h-3" /> ADS
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => props.onViewEcp(e)}
                        className="h-7 px-2 gap-1 text-[10px]"
                        data-testid={`view-ecp-${e.adsId}-${e.adsVersion}`}
                      >
                        <FileType className="w-3 h-3" /> ECP
                      </Button>
                      <Link href={`/exposure/${e.adsId}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-[10px]"
                          data-testid={`view-exposure-${e.adsId}-${e.adsVersion}`}
                        >
                          <Eye className="w-3 h-3" /> Exposure
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {props.entries.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-6 text-center text-muted-foreground text-xs">
                    {PORTFOLIO_STATIC_TEXT.filtersNoMatch}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableHeader(props: {
  label: string;
  col: SortColumn;
  sortCol: SortColumn;
  sortDir: SortDir;
  onSort: (c: SortColumn) => void;
}) {
  const active = props.sortCol === props.col;
  return (
    <th className="py-2 px-2">
      <button
        type="button"
        onClick={() => props.onSort(props.col)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          active ? "text-foreground" : ""
        }`}
        data-testid={`sort-${props.col}`}
      >
        {props.label}
        <ArrowUpDown className="w-3 h-3 opacity-60" />
        {active && <span className="text-[9px]">({props.sortDir})</span>}
      </button>
    </th>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  testid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  testid: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-background border border-border rounded px-2 py-1 text-xs"
        data-testid={testid}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function RiskConcentration({ entries }: { entries: PortfolioEntry[] }) {
  const severityCounts: Record<string, number> = {
    RED: 0,
    AMBER: 0,
    GREEN: 0,
    NONE: 0,
  };
  for (const e of entries) severityCounts[e.highestRiskSeverity]++;

  const categoryCounts: Record<string, number> = {};
  for (const e of entries) {
    for (const c of e.riskCategoriesPresent) {
      categoryCounts[c] = (categoryCounts[c] ?? 0) + 1;
    }
  }
  const categoryEntries = Object.entries(categoryCounts).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  return (
    <Card data-testid="risk-concentration">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {PORTFOLIO_STATIC_TEXT.riskHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {PORTFOLIO_STATIC_TEXT.severityHeading}
          </div>
          <div className="space-y-1.5">
            {(["RED", "AMBER", "GREEN", "NONE"] as const).map((lvl) => (
              <CountRow
                key={lvl}
                label={lvl}
                count={severityCounts[lvl]}
                badge={RISK_BADGE[lvl]}
                testid={`severity-count-${lvl}`}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            {PORTFOLIO_STATIC_TEXT.categoryHeading}
          </div>
          {categoryEntries.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              {PORTFOLIO_STATIC_TEXT.noRiskCategories}
            </div>
          ) : (
            <div className="space-y-1.5">
              {categoryEntries.map(([cat, n]) => (
                <CountRow
                  key={cat}
                  label={cat}
                  count={n}
                  badge="bg-muted text-foreground border-border"
                  testid={`category-count-${cat}`}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CountRow({
  label,
  count,
  badge,
  testid,
}: {
  label: string;
  count: number;
  badge: string;
  testid: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span
        className={`inline-block px-2 py-0.5 border rounded text-[10px] font-semibold ${badge}`}
      >
        {label}
      </span>
      <span className="tabular-nums" data-testid={testid}>
        {count}
      </span>
    </div>
  );
}

function IndicatorDistribution({ entries }: { entries: PortfolioEntry[] }) {
  return (
    <Card data-testid="indicator-distribution">
      <CardHeader>
        <CardTitle className="text-sm font-semibold uppercase tracking-wider">
          {PORTFOLIO_STATIC_TEXT.indicatorHeading}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Histogram
          title="Complexity"
          values={entries.map((e) => e.complexityScore)}
          testid="hist-complexity"
        />
        <Histogram
          title="Operational Overhead"
          values={entries.map((e) => e.operationalOverheadScore)}
          testid="hist-op-overhead"
        />
        <Histogram
          title="Change Cost Later"
          values={entries.map((e) => e.changeCostLaterScore)}
          testid="hist-change-cost"
        />
      </CardContent>
    </Card>
  );
}

function Histogram({
  title,
  values,
  testid,
}: {
  title: string;
  values: number[];
  testid: string;
}) {
  const buckets = bucketise(values);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const avg =
    values.length === 0
      ? 0
      : values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <div data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        {title}
      </div>
      <div className="space-y-1">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[10px]">
            <span className="w-12 text-muted-foreground tabular-nums">{b.label}</span>
            <div className="flex-1 bg-muted rounded h-3 overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right tabular-nums">{b.count}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Average: <span className="tabular-nums">{avg.toFixed(1)}</span> · n ={" "}
        {values.length}
      </div>
    </div>
  );
}

function bucketise(values: number[]): { label: string; count: number }[] {
  // Fixed buckets so the histogram is comparable across portfolios.
  const ranges: { label: string; lo: number; hi: number }[] = [
    { label: "0–4", lo: 0, hi: 4 },
    { label: "5–9", lo: 5, hi: 9 },
    { label: "10–14", lo: 10, hi: 14 },
    { label: "15–19", lo: 15, hi: 19 },
    { label: "20–29", lo: 20, hi: 29 },
    { label: "30+", lo: 30, hi: Infinity },
  ];
  return ranges.map((r) => ({
    label: r.label,
    count: values.filter((v) => v >= r.lo && v <= r.hi).length,
  }));
}


function AttachmentBadge({
  adsId,
  adsVersion,
}: {
  adsId: string;
  adsVersion: string;
}) {
  // Re-render when the attachment store changes so the count stays
  // live across attach / detach actions in another tab.
  useSyncExternalStore(
    subscribeAttachments,
    getAttachmentStoreVersion,
    () => 0,
  );
  const links = getArchitecturesForADC(adsId, adsVersion);
  // Spec (task-79): tooltip lists attached architecture **names**, not ids.
  // Fall back to the id if the architecture document was deleted out from
  // under a stale link (the empty-leak rule prevents this on detach, but a
  // direct CTAD `removeArchitecture` could still orphan one).
  const names = links.map((l) => {
    const doc = getArchitectureDoc(l.architectureId);
    return doc ? doc.name : l.architectureId;
  });
  const tooltip =
    links.length === 0
      ? PORTFOLIO_STATIC_TEXT.attachmentsTooltipNone
      : PORTFOLIO_STATIC_TEXT.attachmentsTooltipPrefix + names.join(", ");
  return (
    <span
      className="inline-block px-2 py-0.5 border rounded text-[10px] tabular-nums bg-muted/40 border-border"
      title={tooltip}
      data-testid={`attachment-badge-${adsId}-${adsVersion}`}
    >
      {links.length}
    </span>
  );
}

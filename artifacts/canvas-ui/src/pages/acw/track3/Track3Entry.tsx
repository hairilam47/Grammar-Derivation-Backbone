// ACW Track 3 — entry list of frozen ADC bindings.
//
// Lists the same frozen ADS records as `/ctad`, but each row links
// to the derived structural view rather than the CTAD shell. This
// page is read-only: it never mutates a portfolio entry, never
// calls a write helper of any store.
import { useMemo } from "react";
import { Link } from "wouter";
import { Layers } from "lucide-react";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";
import { GlobalNav } from "@/components/governance/GlobalNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LABELS = {
  brandLabel: "Architecture Decision Canvas",
  pageTitle: "Derived structural view",
  pageSubtitle:
    "Pick a frozen decision to see the structural diagram derived from its bound technology selections. The diagram is exploratory and read-only.",
  listHeading: "Frozen decisions available for derived view",
  listHint:
    "Selecting a row opens the derived structural diagram for that binding. Editing selections is done from the bound CTAD shell.",
  colProject: "Project",
  colDecisionAuthority: "Decision authority",
  colDecisionDate: "Decision date",
  colAdsId: "ADS id",
  colAdsVersion: "ADS version",
  openCta: "Open derived view",
  emptyHeading: "No frozen decisions found",
  emptyBody:
    "There are no frozen decisions in the portfolio yet. Freeze one from the Decision Canvas to enable the derived view.",
} as const;

assertAllAcwTrack3Language(Object.values(LABELS));

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function Track3Entry() {
  const entries = useMemo<PortfolioEntry[]>(() => listEntries(), []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="w-5 h-5" />
            <span
              className="font-bold tracking-tight text-sm uppercase"
              data-testid="track3-brand"
            >
              {LABELS.brandLabel}
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12">
        <div className="mb-8 space-y-2" data-testid="track3-entry-heading">
          <h1 className="text-2xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {entries.length === 0 ? (
          <Card data-testid="track3-entry-empty">
            <CardHeader>
              <CardTitle className="text-base">
                {LABELS.emptyHeading}
              </CardTitle>
              <CardDescription
                className="text-sm"
                data-testid="track3-entry-empty-message"
              >
                {LABELS.emptyBody}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card data-testid="track3-entry-list">
            <CardHeader>
              <CardTitle className="text-base">
                {LABELS.listHeading}
              </CardTitle>
              <CardDescription className="text-xs">
                {LABELS.listHint}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/50">
                      <th className="py-2 pr-4 font-normal">{LABELS.colProject}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colDecisionAuthority}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colDecisionDate}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colAdsId}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colAdsVersion}</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const href = `/acw/derived/${encodeURIComponent(e.adsId)}/${encodeURIComponent(e.adsVersion)}`;
                      const rowTestId = `track3-entry-row-${e.adsId}-${e.adsVersion}`;
                      return (
                        <tr
                          key={`${e.adsId}@${e.adsVersion}`}
                          className="border-b border-border/30 hover:bg-card/40"
                          data-testid={rowTestId}
                        >
                          <td className="py-2 pr-4">{e.projectName}</td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {e.approvingAuthority}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDate(e.decisionDate)}
                          </td>
                          <td className="py-2 pr-4 font-mono text-muted-foreground">
                            {e.adsId}
                          </td>
                          <td className="py-2 pr-4 font-mono text-muted-foreground">
                            {e.adsVersion}
                          </td>
                          <td className="py-2 text-right">
                            <Link href={href}>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`${rowTestId}-cta`}
                              >
                                {LABELS.openCta}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

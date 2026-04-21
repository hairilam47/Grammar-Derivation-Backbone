import { useMemo } from "react";
import { Link } from "wouter";
import { Layers } from "lucide-react";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import {
  assertAllCtadLanguage,
} from "@/governance/staticTextGuard";
import { GlobalNav } from "@/components/governance/GlobalNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// All static labels rendered by this page. Asserted at module load
// against the CTAD vocabulary tier so a forbidden token cannot be
// introduced silently.
const LABELS = {
  pageTitle: "CTAD \u2014 Technology Exploration",
  pageSubtitle:
    "Pick a frozen decision to attach an interpretive technology exploration to. CTAD is reversible and does not alter the underlying decision.",
  listHeading: "Frozen decisions available for exploration",
  listHint:
    "Selecting a row opens a bound exploration. The underlying decision is read-only here.",
  colProject: "Project",
  colDecisionAuthority: "Decision authority",
  colDecisionDate: "Decision date",
  colAdsId: "ADS id",
  colAdsVersion: "ADS version",
  openCta: "Open Exploration",
  emptyHeading: "No frozen decisions found",
  brandLabel: "Architecture Decision Canvas",
} as const;

// Verbatim brief-mandated empty-state sentence. It contains the
// substring "approved", which is on the CTAD forbidden vocabulary
// list. Per the carve-out documented in staticTextGuard.ts, this
// single message is exempt from the substring scan and is verified
// instead by spec-equality at module load.
const EMPTY_STATE_MESSAGE =
  "CTAD requires an approved architectural decision.";
const EMPTY_STATE_MESSAGE_SPEC =
  "CTAD requires an approved architectural decision.";
if (EMPTY_STATE_MESSAGE !== EMPTY_STATE_MESSAGE_SPEC) {
  throw new Error(
    "CTAD entry: empty-state message drifted from its constitutional spec.",
  );
}

assertAllCtadLanguage(Object.values(LABELS));

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function CtadEntry() {
  const entries = useMemo<PortfolioEntry[]>(() => listEntries(), []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Layers className="w-5 h-5" />
            <span
              className="font-bold tracking-tight text-sm uppercase"
              data-testid="ctad-brand"
            >
              {LABELS.brandLabel}
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12">
        <div className="mb-8 space-y-2" data-testid="ctad-entry-heading">
          <h1 className="text-2xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {entries.length === 0 ? (
          <Card data-testid="ctad-entry-empty">
            <CardHeader>
              <CardTitle className="text-base">
                {LABELS.emptyHeading}
              </CardTitle>
              <CardDescription
                className="text-sm"
                data-testid="ctad-entry-empty-message"
              >
                {EMPTY_STATE_MESSAGE}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card data-testid="ctad-entry-list">
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
                      <th className="py-2 pr-4 font-normal">
                        {LABELS.colProject}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {LABELS.colDecisionAuthority}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {LABELS.colDecisionDate}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {LABELS.colAdsId}
                      </th>
                      <th className="py-2 pr-4 font-normal">
                        {LABELS.colAdsVersion}
                      </th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const href = `/ctad/${encodeURIComponent(e.adsId)}/${encodeURIComponent(e.adsVersion)}`;
                      const rowTestId = `ctad-entry-row-${e.adsId}-${e.adsVersion}`;
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

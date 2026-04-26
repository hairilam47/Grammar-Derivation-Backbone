// ACW Track 3 — entry list of architectures (Phase 3, Task #80).
//
// Lists every standalone architecture from the CTAD store. Each
// row links to the derived structural view scoped to that
// architecture. This page is read-only: it never mutates an
// architecture, never calls a write helper, and never reads from
// the portfolio store (the build-time isolation invariant
// prohibits a portfolio import here).
import { useSyncExternalStore } from "react";
import { Link } from "wouter";
import { Layers } from "lucide-react";
import {
  listArchitectures,
  subscribe as subscribeCtad,
  getStoreVersion as getCtadStoreVersion,
  type CtadArchitectureDoc,
} from "@/ctad/ctadStore";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";
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
    "Pick an architecture to see the structural diagram derived from its technology selections. The diagram is exploratory and read-only.",
  listHeading: "Architectures available for derived view",
  listHint:
    "Selecting a row opens the derived structural diagram for that architecture. Editing selections is done from the architecture workspace.",
  colName: "Architecture",
  colArchitectureId: "Architecture id",
  colCreatedAt: "Created",
  colUpdatedAt: "Updated",
  openCta: "Open derived view",
  emptyHeading: "No architectures found",
  emptyBody:
    "There are no standalone architectures yet. Create one from the architecture entry to enable the derived view.",
} as const;

assertAllAcwTrack3Language(Object.values(LABELS));

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function Track3Entry() {
  // Subscribe to the CTAD store so newly created architectures
  // appear here without a manual refresh. The named imports
  // (`subscribe`, `getStoreVersion`) are explicitly added to the
  // Track 3 isolation allow-list for this entry-point only. We
  // deliberately do NOT cache `listArchitectures()` in a useMemo:
  // its result must reflect the latest store version returned by
  // `useSyncExternalStore` on every render.
  useSyncExternalStore(subscribeCtad, getCtadStoreVersion, getCtadStoreVersion);
  const architectures: readonly CtadArchitectureDoc[] = listArchitectures();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12">
        <div className="mb-8 space-y-2" data-testid="track3-entry-heading">
          <h1 className="text-2xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {architectures.length === 0 ? (
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
                      <th className="py-2 pr-4 font-normal">{LABELS.colName}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colArchitectureId}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colCreatedAt}</th>
                      <th className="py-2 pr-4 font-normal">{LABELS.colUpdatedAt}</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {architectures.map((a) => {
                      const href = `/acw/derived/arch/${encodeURIComponent(a.architectureId)}`;
                      const rowTestId = `track3-entry-row-${a.architectureId}`;
                      return (
                        <tr
                          key={a.architectureId}
                          className="border-b border-border/30 hover:bg-card/40"
                          data-testid={rowTestId}
                        >
                          <td className="py-2 pr-4">{a.architectureName}</td>
                          <td className="py-2 pr-4 font-mono text-muted-foreground">
                            {a.architectureId}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDate(a.createdAt)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDate(a.updatedAt)}
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

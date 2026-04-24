import { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { Layers } from "lucide-react";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import { assertAllCtadLanguage } from "@/governance/staticTextGuard";
import { GlobalNav } from "@/components/governance/GlobalNav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createArchitecture,
  getStoreVersion,
  listArchitectures,
  removeArchitecture,
  subscribe,
  type CtadArchitectureDoc,
} from "@/ctad/ctadStore";

// All static labels rendered by this page. Asserted at module load
// against the CTAD vocabulary tier so a forbidden token cannot be
// introduced silently.
const LABELS = {
  pageTitle: "CTAD \u2014 Technology Exploration",
  pageSubtitle:
    "Open a standalone architecture workspace, or attach an interpretive technology exploration to a frozen ADC decision. CTAD is reversible and does not alter the underlying decision.",
  tabArchitectures: "Architecture Workspaces",
  tabBindings: "ADC-Bound Workspaces",
  // Architecture-tab labels.
  archListHeading: "Standalone architecture workspaces",
  archListHint:
    "Standalone workspaces have no ADC binding and exist purely inside CTAD.",
  archEmptyHeading: "No standalone architectures yet",
  archEmptyBody:
    "Create a new architecture workspace to start a standalone exploration.",
  archCreateHeading: "Create a new architecture workspace",
  archCreateHint:
    "The name is for display. A unique identifier will be generated automatically.",
  archCreateNameLabel: "Architecture name",
  archCreateNamePlaceholder: "e.g. Customer Portal",
  archCreateButton: "Create",
  archCreateEmpty: "Name is required.",
  archColName: "Name",
  archColId: "Identifier",
  archColCreated: "Created",
  archColUpdated: "Last edited",
  archOpenCta: "Open Architecture",
  archDeleteCta: "Delete",
  archDeleteConfirmCta: "Yes, delete",
  archDeleteCancelCta: "Cancel",
  // Binding-tab labels (carried over from the prior single-mode page).
  listHeading: "Frozen decisions available for exploration",
  listHint:
    "Selecting a row opens a bound exploration. The underlying decision is read-only here.",
  colProject: "Project",
  colDecisionAuthority: "Decision authority",
  colDecisionDate: "Decision date",
  colAdsId: "ADS id",
  colAdsVersion: "ADS version",
  openCta: "Open Exploration",
  openDerivedCta: "Open derived view",
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

type Tab = "architectures" | "bindings";

export default function CtadEntry() {
  const [tab, setTab] = useState<Tab>("architectures");
  const entries = useMemo<PortfolioEntry[]>(() => listEntries(), []);
  const storeVersion = useSyncExternalStore(subscribe, getStoreVersion, () => 0);
  const architectures = useMemo<readonly CtadArchitectureDoc[]>(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => listArchitectures(),
    [storeVersion],
  );

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
        <div className="mb-6 space-y-2" data-testid="ctad-entry-heading">
          <h1 className="text-2xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {LABELS.pageSubtitle}
          </p>
        </div>

        <div
          className="mb-6 inline-flex border border-border/50 rounded-md overflow-hidden text-xs"
          role="tablist"
          data-testid="ctad-entry-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "architectures"}
            onClick={() => setTab("architectures")}
            className={`px-3 py-1.5 ${tab === "architectures" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-card/40"}`}
            data-testid="ctad-entry-tab-architectures"
          >
            {LABELS.tabArchitectures}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "bindings"}
            onClick={() => setTab("bindings")}
            className={`px-3 py-1.5 border-l border-border/50 ${tab === "bindings" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-card/40"}`}
            data-testid="ctad-entry-tab-bindings"
          >
            {LABELS.tabBindings}
          </button>
        </div>

        {tab === "architectures" ? (
          <ArchitectureTab architectures={architectures} />
        ) : (
          <BindingsTab entries={entries} />
        )}
      </main>
    </div>
  );
}

function ArchitectureTab({
  architectures,
}: {
  architectures: readonly CtadArchitectureDoc[];
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  function submit() {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError(LABELS.archCreateEmpty);
      return;
    }
    try {
      const created = createArchitecture(trimmed);
      setName("");
      setError(null);
      // Spec: New Architecture creates the entry and navigates to
      // the freshly minted workspace immediately.
      setLocation(`/ctad/arch/${encodeURIComponent(created.architectureId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card data-testid="ctad-entry-arch-create">
        <CardHeader>
          <CardTitle className="text-base">
            {LABELS.archCreateHeading}
          </CardTitle>
          <CardDescription className="text-xs">
            {LABELS.archCreateHint}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end text-xs">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {LABELS.archCreateNameLabel}
              </span>
              <input
                className="bg-background border border-border/50 rounded px-2 py-1"
                value={name}
                placeholder={LABELS.archCreateNamePlaceholder}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                data-testid="ctad-entry-arch-create-name"
              />
            </label>
            <Button
              size="sm"
              onClick={submit}
              data-testid="ctad-entry-arch-create-submit"
            >
              {LABELS.archCreateButton}
            </Button>
          </div>
          {error !== null && (
            <p
              className="mt-2 text-xs text-destructive"
              data-testid="ctad-entry-arch-create-error"
            >
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {architectures.length === 0 ? (
        <Card data-testid="ctad-entry-arch-empty">
          <CardHeader>
            <CardTitle className="text-base">
              {LABELS.archEmptyHeading}
            </CardTitle>
            <CardDescription className="text-sm">
              {LABELS.archEmptyBody}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card data-testid="ctad-entry-arch-list">
          <CardHeader>
            <CardTitle className="text-base">{LABELS.archListHeading}</CardTitle>
            <CardDescription className="text-xs">
              {LABELS.archListHint}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/50">
                    <th className="py-2 pr-4 font-normal">
                      {LABELS.archColName}
                    </th>
                    <th className="py-2 pr-4 font-normal">
                      {LABELS.archColId}
                    </th>
                    <th className="py-2 pr-4 font-normal">
                      {LABELS.archColCreated}
                    </th>
                    <th className="py-2 pr-4 font-normal">
                      {LABELS.archColUpdated}
                    </th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {architectures.map((a) => {
                    const rowTestId = `ctad-entry-arch-row-${a.architectureId}`;
                    const isPendingDelete =
                      pendingDelete === a.architectureId;
                    return (
                      <tr
                        key={a.architectureId}
                        className="border-b border-border/30 hover:bg-card/40"
                        data-testid={rowTestId}
                      >
                        <td className="py-2 pr-4">{a.architectureName}</td>
                        <td className="py-2 pr-4 font-mono text-muted-foreground break-all">
                          {a.architectureId}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDate(a.createdAt)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDate(a.updatedAt)}
                        </td>
                        <td className="py-2 text-right space-x-2 whitespace-nowrap">
                          {isPendingDelete ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setPendingDelete(null)}
                                data-testid={`${rowTestId}-delete-cancel`}
                              >
                                {LABELS.archDeleteCancelCta}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  removeArchitecture(a.architectureId);
                                  setPendingDelete(null);
                                }}
                                data-testid={`${rowTestId}-delete-confirm`}
                              >
                                {LABELS.archDeleteConfirmCta}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setPendingDelete(a.architectureId)
                                }
                                data-testid={`${rowTestId}-delete`}
                              >
                                {LABELS.archDeleteCta}
                              </Button>
                              <Link
                                href={`/ctad/arch/${encodeURIComponent(a.architectureId)}`}
                              >
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid={`${rowTestId}-cta`}
                                >
                                  {LABELS.archOpenCta}
                                </Button>
                              </Link>
                            </>
                          )}
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
    </div>
  );
}

function BindingsTab({ entries }: { entries: PortfolioEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card data-testid="ctad-entry-empty">
        <CardHeader>
          <CardTitle className="text-base">{LABELS.emptyHeading}</CardTitle>
          <CardDescription
            className="text-sm"
            data-testid="ctad-entry-empty-message"
          >
            {EMPTY_STATE_MESSAGE}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card data-testid="ctad-entry-list">
      <CardHeader>
        <CardTitle className="text-base">{LABELS.listHeading}</CardTitle>
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
                <th className="py-2 pr-4 font-normal">
                  {LABELS.colDecisionAuthority}
                </th>
                <th className="py-2 pr-4 font-normal">
                  {LABELS.colDecisionDate}
                </th>
                <th className="py-2 pr-4 font-normal">{LABELS.colAdsId}</th>
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
                    <td className="py-2 text-right space-x-2 whitespace-nowrap">
                      <Link
                        href={`/acw/derived/${encodeURIComponent(e.adsId)}/${encodeURIComponent(e.adsVersion)}`}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`${rowTestId}-derived-cta`}
                        >
                          {LABELS.openDerivedCta}
                        </Button>
                      </Link>
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
  );
}

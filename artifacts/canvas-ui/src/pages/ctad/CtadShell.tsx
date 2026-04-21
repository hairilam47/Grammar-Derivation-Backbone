import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRoute, Link } from "wouter";
import { Layers, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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
  CTAD_SECTIONS,
  NOT_SPECIFIED_LABEL,
  type CtadParameter,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  exportCtadState,
  getBindingDoc,
  getStoreVersion,
  setCtadParam,
  subscribe,
  type CtadBinding,
} from "@/ctad/ctadStore";

// Static labels rendered by this page; asserted at module load.
const LABELS = {
  brandLabel: "Architecture Decision Canvas",
  bindingHeading: "ADC binding (read-only)",
  bindingHint:
    "These fields belong to the underlying frozen decision. CTAD never edits them.",
  fieldProject: "Project",
  fieldDecisionAuthority: "Decision authority",
  fieldDecisionDate: "Decision date",
  fieldAdsId: "ADS id",
  fieldAdsVersion: "ADS version",
  fieldOrgType: "Organisation type",
  fieldSensitivity: "Sensitivity level",
  fieldSystemIntent: "System intent",
  fieldLifespan: "Expected lifespan (years)",
  fieldCapabilitiesInScope: "Capabilities in scope",
  parametersHeading: "Technology parameters",
  parametersHint:
    "Each parameter is a categorical class. Selections are reversible at any time and may be left unspecified.",
  notSpecified: NOT_SPECIFIED_LABEL,
  showSection: "Show",
  hideSection: "Hide",
  ctadStateHeading: "CTAD_STATE (live preview)",
  ctadStateHint:
    "Serialised exploration state grouped by section. Unspecified parameters appear as null.",
  referencesHeading: "Reference catalogs",
  referencesHint:
    "External catalogs available for browsing. These links carry no ordering and no selection signal.",
  bindingNotFoundHeading: "Binding not found",
  bindingNotFoundBody:
    "No frozen decision matches this binding. Return to the entry page to pick a different one.",
  backToEntry: "Back to entry",
  pageTitle: "Technology exploration",
  pageSubtitle:
    "Interpretive, reversible technology exploration bound to a frozen decision.",
} as const;

// External catalog references — neutral name + url pairs only.
const REFERENCES: ReadonlyArray<{ readonly label: string; readonly url: string }> = [
  { label: "CNCF Cloud Native Landscape", url: "https://landscape.cncf.io" },
  { label: "GeeksForGeeks System Design", url: "https://www.geeksforgeeks.org/system-design-tutorial" },
];

assertAllCtadLanguage([
  ...Object.values(LABELS),
  ...REFERENCES.map((r) => r.label),
]);

function useCtadStore(): number {
  // The snapshot MUST be a stable, equality-checkable value that
  // only changes when the store actually mutates. `getStoreVersion`
  // is a monotonic counter incremented inside `writeDoc`, satisfying
  // React's `useSyncExternalStore` contract; returning `Date.now()`
  // here would produce a fresh value on every call and trigger
  // re-render loops under React strict mode.
  return useSyncExternalStore(subscribe, getStoreVersion, () => 0);
}

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function CtadShell() {
  const [match, params] = useRoute<{ adsId: string; adsVersion: string }>(
    "/ctad/:adsId/:adsVersion",
  );
  if (!match || !params) return null;

  const binding: CtadBinding = {
    adsId: decodeURIComponent(params.adsId),
    adsVersion: decodeURIComponent(params.adsVersion),
  };

  const entry = useMemo<PortfolioEntry | undefined>(() => {
    return listEntries().find(
      (e) => e.adsId === binding.adsId && e.adsVersion === binding.adsVersion,
    );
  }, [binding.adsId, binding.adsVersion]);

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

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-1" data-testid="ctad-shell-heading">
          <h1 className="text-xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {entry === undefined ? (
          <Card data-testid="ctad-shell-binding-missing">
            <CardHeader>
              <CardTitle className="text-base">
                {LABELS.bindingNotFoundHeading}
              </CardTitle>
              <CardDescription className="text-xs">
                {LABELS.bindingNotFoundBody}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/ctad">
                <Button variant="outline" size="sm" data-testid="ctad-shell-back-to-entry">
                  {LABELS.backToEntry}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <BoundShell binding={binding} entry={entry} />
        )}
      </main>
    </div>
  );
}

function BoundShell({
  binding,
  entry,
}: {
  binding: CtadBinding;
  entry: PortfolioEntry;
}) {
  // Re-render on any store change.
  useCtadStore();
  const doc = getBindingDoc(binding);
  const exported = exportCtadState(binding);

  return (
    <>
      <BindingPanel entry={entry} />
      <ParametersPanel binding={binding} doc={doc} />
      <CtadStatePreview state={exported} />
      <ReferencesPanel />
    </>
  );
}

function BindingPanel({ entry }: { entry: PortfolioEntry }) {
  const ctx = entry.organisationContext as unknown as Record<string, unknown>;
  const fields: ReadonlyArray<{ label: string; value: string; testId: string }> = [
    { label: LABELS.fieldProject, value: entry.projectName, testId: "binding-project" },
    { label: LABELS.fieldDecisionAuthority, value: entry.approvingAuthority, testId: "binding-authority" },
    { label: LABELS.fieldDecisionDate, value: formatDate(entry.decisionDate), testId: "binding-date" },
    { label: LABELS.fieldAdsId, value: entry.adsId, testId: "binding-adsid" },
    { label: LABELS.fieldAdsVersion, value: entry.adsVersion, testId: "binding-adsversion" },
    { label: LABELS.fieldOrgType, value: String(ctx?.organisationType ?? ""), testId: "binding-orgtype" },
    { label: LABELS.fieldSensitivity, value: String(ctx?.sensitivityLevel ?? ""), testId: "binding-sensitivity" },
    { label: LABELS.fieldSystemIntent, value: String(ctx?.systemIntent ?? ""), testId: "binding-systemintent" },
    { label: LABELS.fieldLifespan, value: String(ctx?.expectedLifespanYears ?? ""), testId: "binding-lifespan" },
    {
      label: LABELS.fieldCapabilitiesInScope,
      value: String(entry.inScopeCapabilityIds.length),
      testId: "binding-capabilities-count",
    },
  ];

  return (
    <Card data-testid="ctad-binding-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.bindingHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.bindingHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-xs">
          {fields.map((f) => (
            <div key={f.testId} data-testid={f.testId}>
              <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {f.label}
              </dt>
              <dd className="mt-0.5">{f.value || "\u2014"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ParametersPanel({
  binding,
  doc,
}: {
  binding: CtadBinding;
  doc: ReturnType<typeof getBindingDoc>;
}) {
  return (
    <Card data-testid="ctad-parameters-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.parametersHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.parametersHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {CTAD_SECTIONS.map((section) => (
          <SectionBlock
            key={section.id}
            sectionId={section.id}
            sectionLabel={section.label}
            parameters={section.parameters}
            binding={binding}
            doc={doc}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SectionBlock({
  sectionId,
  sectionLabel,
  parameters,
  binding,
  doc,
}: {
  sectionId: CtadSectionId;
  sectionLabel: string;
  parameters: readonly CtadParameter[];
  binding: CtadBinding;
  doc: ReturnType<typeof getBindingDoc>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="border border-border/50 rounded-md"
      data-testid={`ctad-section-${sectionId}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-card/40"
        data-testid={`ctad-section-${sectionId}-toggle`}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-xs uppercase tracking-wider">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          {sectionLabel}
        </span>
        <span className="text-[10px] text-muted-foreground uppercase">
          {open ? LABELS.hideSection : LABELS.showSection}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {parameters.map((p) => (
            <ParameterRow
              key={p.id}
              param={p}
              binding={binding}
              currentValue={doc.params[p.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ParameterRow({
  param,
  binding,
  currentValue,
}: {
  param: CtadParameter;
  binding: CtadBinding;
  currentValue: string | readonly string[] | null | undefined;
}) {
  const testIdBase = `ctad-param-${param.id}`;
  if (param.kind === "single") {
    const value =
      typeof currentValue === "string" && param.options.includes(currentValue)
        ? currentValue
        : "";
    return (
      <label className="text-xs space-y-1 block" data-testid={testIdBase}>
        <span className="text-muted-foreground uppercase tracking-wider text-[10px]">
          {param.label}
        </span>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setCtadParam(binding, param.id, next === "" ? null : next);
          }}
          data-testid={`${testIdBase}-select`}
        >
          <option value="">{LABELS.notSpecified}</option>
          {param.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  // Multi-flag.
  const selected = new Set<string>(
    Array.isArray(currentValue)
      ? (currentValue as string[]).filter((v) => param.options.includes(v))
      : [],
  );
  return (
    <fieldset
      className="text-xs space-y-1"
      data-testid={testIdBase}
    >
      <legend className="text-muted-foreground uppercase tracking-wider text-[10px]">
        {param.label}
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {param.options.map((o) => {
          const checked = selected.has(o);
          return (
            <label
              key={o}
              className="inline-flex items-center gap-1.5"
              data-testid={`${testIdBase}-option-${o}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o);
                  else next.delete(o);
                  const arr = param.options.filter((opt) => next.has(opt));
                  setCtadParam(binding, param.id, arr.length === 0 ? null : arr);
                }}
              />
              <span>{o}</span>
            </label>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {selected.size === 0 ? LABELS.notSpecified : ""}
      </div>
    </fieldset>
  );
}

function CtadStatePreview({
  state,
}: {
  state: ReturnType<typeof exportCtadState>;
}) {
  const json = useMemo(() => JSON.stringify(state, null, 2), [state]);
  return (
    <Card data-testid="ctad-state-preview">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.ctadStateHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.ctadStateHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          className="text-[11px] bg-card/50 border border-border/50 rounded-md p-3 overflow-auto max-h-[40vh]"
          data-testid="ctad-state-preview-json"
        >
{json}
        </pre>
      </CardContent>
    </Card>
  );
}

function ReferencesPanel(): ReactNode {
  return (
    <Card data-testid="ctad-references-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.referencesHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.referencesHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-xs">
          {REFERENCES.map((r) => (
            <li key={r.url}>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
                data-testid={`ctad-reference-${r.url}`}
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                {r.label}
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

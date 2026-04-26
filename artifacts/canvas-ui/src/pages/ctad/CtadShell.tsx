import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useRoute, Link } from "wouter";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  Plus,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  listEntries,
  type PortfolioEntry,
} from "@/governance/portfolioStore";
import { assertAllCtadLanguage } from "@/governance/staticTextGuard";
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
  ENVIRONMENT_HOSTING_MODEL_OPTIONS,
  ENVIRONMENT_KIND_OPTIONS,
  NOT_SPECIFIED_LABEL,
  isValidEnvironmentId,
  type CtadEnvironmentDef,
  type CtadParameter,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  addEnvironment,
  exportCtadState,
  getBindingDoc,
  getEnvironments,
  getStoreVersion,
  removeEnvironment,
  setCtadParam,
  subscribe,
  updateEnvironment,
  type CtadBinding,
} from "@/ctad/ctadStore";
import {
  getActiveAllowedOptions,
  getConstraintsStoreVersion,
  getContributions,
  subscribeConstraints,
} from "@/ctad/ctadConstraintsStore";
import {
  getAppliedCardsForBinding,
  getAppliedCardsStoreVersion,
  isCardApplied,
  subscribeAppliedCards,
} from "@/ctad/ctadAppliedCardsStore";
import {
  cardsForSection,
  findCard,
} from "@/cncf/cncfCatalog";
import {
  previewCardApplication,
  type CardApplicationPreview,
} from "@/cncf/cncfBindingEngine";
import {
  applyCard,
  contributingCardIds,
  removeAppliedCard,
} from "@/ctad/cncfApplyService";
import type { CncfCard } from "@/cncf/cncfTypes";
import { QuotedSource } from "@/components/ctad/QuotedSource";

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
  // CNCF-card panel labels.
  relevantCardsHeading: "Relevant cards",
  relevantCardsHint:
    "Reference catalog cards whose hints touch parameters in this section.",
  noRelevantCards: "No reference cards touch this section.",
  cardApplyButton: "Apply",
  cardRemoveButton: "Remove",
  cardAlreadyApplied: "Applied",
  cardMaturityLabel: "Maturity",
  cardCategoryLabel: "Category",
  // Constraint badge per parameter row.
  constrainedToLabel: "Narrowed to",
  constraintConflictLabel: "No options remain",
  contributingCardsLabel: "From",
  contributingCardRemove: "Remove",
  contributingCardListLabel: "Applied cards on this parameter",
  // Preview modal.
  previewHeading: "Card application preview",
  previewSubheading: "Inspect the changes before they are written.",
  previewSectionSets: "Sets value",
  previewSectionConstrains: "Narrows options",
  previewSectionJustifies: "Adds rationale",
  previewSectionConflicts: "Conflicts detected",
  previewSectionEmpty: "This card has no binding hints.",
  previewBefore: "before",
  previewAfter: "after",
  previewCommit: "Commit",
  previewCancel: "Cancel",
  previewBlockedByConflicts:
    "Resolve the conflicts before this card can be applied.",
  previewReady:
    "No conflicts. The card is ready to commit.",
  // Applied-cards summary panel.
  appliedCardsHeading: "Applied reference cards",
  appliedCardsHint:
    "Cards applied to this binding. Removing a card reverses its effects on parameters whose values still match.",
  appliedCardsEmpty: "No reference cards have been applied to this binding.",
  // Environments panel (Task #77).
  environmentsHeading: "Environments",
  environmentsHint:
    "Environments are first-class. Add at least one environment to render deployment containers; with none declared, the deployment view falls back to a flat host listing.",
  environmentsEmpty: "No environments declared.",
  environmentAddButton: "Add environment",
  environmentRemoveButton: "Remove",
  environmentSaveButton: "Save",
  environmentCancelButton: "Cancel",
  environmentEditButton: "Edit",
  environmentIdLabel: "Identifier",
  environmentIdPlaceholder: "e.g. production",
  environmentNameLabel: "Name",
  environmentNamePlaceholder: "Display name",
  environmentKindLabel: "Kind",
  environmentHostingLabel: "Hosting model",
  environmentHostingNone: "Unspecified",
  environmentInvalidId:
    "Identifier starts with a lowercase letter and uses only letters, digits, or hyphens.",
  environmentDuplicateId: "Identifier already in use.",
  environmentEmptyName: "Name is required.",
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

function useStoreVersions(): number {
  // Three independent store versions, summed into a single
  // monotonic snapshot value. `useSyncExternalStore` requires a
  // stable, equality-checkable snapshot; the sum is monotonic
  // (each store version only increments) so it always produces a
  // strictly larger number on any change.
  const v1 = useSyncExternalStore(subscribe, getStoreVersion, () => 0);
  const v2 = useSyncExternalStore(
    subscribeConstraints,
    getConstraintsStoreVersion,
    () => 0,
  );
  const v3 = useSyncExternalStore(
    subscribeAppliedCards,
    getAppliedCardsStoreVersion,
    () => 0,
  );
  return v1 + v2 + v3;
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
  useStoreVersions();
  const doc = getBindingDoc(binding);
  const exported = exportCtadState(binding);
  const [previewState, setPreviewState] = useState<{
    card: CncfCard;
    preview: CardApplicationPreview;
  } | null>(null);

  return (
    <>
      <BindingPanel entry={entry} />
      <AppliedCardsPanel binding={binding} />
      <EnvironmentsPanel binding={binding} />
      <ParametersPanel
        binding={binding}
        doc={doc}
        onPreviewCard={(card) =>
          setPreviewState({
            card,
            preview: previewCardApplication(binding, card),
          })
        }
      />
      <CtadStatePreview state={exported} />
      <ReferencesPanel />
      {previewState && (
        <PreviewModal
          binding={binding}
          card={previewState.card}
          preview={previewState.preview}
          onCancel={() => setPreviewState(null)}
          onCommit={() => {
            applyCard(binding, previewState.card);
            setPreviewState(null);
          }}
        />
      )}
    </>
  );
}

function BindingPanel({ entry }: { entry: PortfolioEntry }) {
  const ctx = entry.organisationContext;
  const fields: ReadonlyArray<{ label: string; value: string; testId: string }> = [
    { label: LABELS.fieldProject, value: entry.projectName, testId: "binding-project" },
    { label: LABELS.fieldDecisionAuthority, value: entry.approvingAuthority, testId: "binding-authority" },
    { label: LABELS.fieldDecisionDate, value: formatDate(entry.decisionDate), testId: "binding-date" },
    { label: LABELS.fieldAdsId, value: entry.adsId, testId: "binding-adsid" },
    { label: LABELS.fieldAdsVersion, value: entry.adsVersion, testId: "binding-adsversion" },
    { label: LABELS.fieldOrgType, value: ctx.organisationType ?? "", testId: "binding-orgtype" },
    { label: LABELS.fieldSensitivity, value: ctx.sensitivityLevel ?? "", testId: "binding-sensitivity" },
    { label: LABELS.fieldSystemIntent, value: ctx.systemIntent ?? "", testId: "binding-systemintent" },
    { label: LABELS.fieldLifespan, value: ctx.expectedLifespanYears == null ? "" : String(ctx.expectedLifespanYears), testId: "binding-lifespan" },
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

// EnvironmentsPanel — first-class CTAD concept (Task #77).
// Authors a list of `{id, name, kind, hostingModel}` records that
// the DiagramSpec compiler reads verbatim to build the deployment
// view's environment containers. The panel deliberately renders no
// validation hints unless authoring is in progress; values are
// validated at write-time by the store.
function EnvironmentsPanel({ binding }: { binding: CtadBinding }) {
  const envs = getEnvironments(binding);
  const [draft, setDraft] = useState<{
    mode: "create" | "edit";
    env: CtadEnvironmentDef;
    initialId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setError(null);
    setDraft({
      mode: "create",
      initialId: "",
      env: {
        id: "",
        name: "",
        kind: ENVIRONMENT_KIND_OPTIONS[0],
        hostingModel: null,
      },
    });
  }
  function startEdit(env: CtadEnvironmentDef) {
    setError(null);
    setDraft({ mode: "edit", initialId: env.id, env: { ...env } });
  }
  function cancel() {
    setError(null);
    setDraft(null);
  }
  function commit() {
    if (!draft) return;
    const e = draft.env;
    if (!e.name.trim()) {
      setError(LABELS.environmentEmptyName);
      return;
    }
    if (!isValidEnvironmentId(e.id)) {
      setError(LABELS.environmentInvalidId);
      return;
    }
    if (
      draft.mode === "create" &&
      envs.some((existing) => existing.id === e.id)
    ) {
      setError(LABELS.environmentDuplicateId);
      return;
    }
    try {
      if (draft.mode === "create") addEnvironment(binding, e);
      else updateEnvironment(binding, e);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card data-testid="ctad-environments-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.environmentsHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.environmentsHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {envs.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ctad-environments-empty"
          >
            {LABELS.environmentsEmpty}
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {envs.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 border border-border/50 rounded-md px-2 py-1"
                data-testid={`ctad-environment-${e.id}`}
              >
                <span className="flex flex-col">
                  <span className="font-mono">{e.id}</span>
                  <span className="text-muted-foreground">
                    {e.name} · {e.kind}
                    {e.hostingModel ? ` · ${e.hostingModel}` : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startEdit(e)}
                    data-testid={`ctad-environment-${e.id}-edit`}
                  >
                    {LABELS.environmentEditButton}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeEnvironment(binding, e.id)}
                    data-testid={`ctad-environment-${e.id}-remove`}
                  >
                    <X className="w-3 h-3" />
                    {LABELS.environmentRemoveButton}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {draft === null ? (
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={startCreate}
              data-testid="ctad-environment-add"
            >
              {LABELS.environmentAddButton}
            </Button>
          </div>
        ) : (
          <div
            className="mt-2 grid grid-cols-2 gap-2 text-xs border border-border/50 rounded-md p-2"
            data-testid="ctad-environment-form"
          >
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {LABELS.environmentIdLabel}
              </span>
              <input
                className="bg-background border border-border/50 rounded px-1 py-0.5 font-mono"
                value={draft.env.id}
                placeholder={LABELS.environmentIdPlaceholder}
                disabled={draft.mode === "edit"}
                onChange={(ev) =>
                  setDraft({
                    ...draft,
                    env: { ...draft.env, id: ev.target.value },
                  })
                }
                data-testid="ctad-environment-form-id"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {LABELS.environmentNameLabel}
              </span>
              <input
                className="bg-background border border-border/50 rounded px-1 py-0.5"
                value={draft.env.name}
                placeholder={LABELS.environmentNamePlaceholder}
                onChange={(ev) =>
                  setDraft({
                    ...draft,
                    env: { ...draft.env, name: ev.target.value },
                  })
                }
                data-testid="ctad-environment-form-name"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {LABELS.environmentKindLabel}
              </span>
              <select
                className="bg-background border border-border/50 rounded px-1 py-0.5"
                value={draft.env.kind}
                onChange={(ev) =>
                  setDraft({
                    ...draft,
                    env: { ...draft.env, kind: ev.target.value },
                  })
                }
                data-testid="ctad-environment-form-kind"
              >
                {ENVIRONMENT_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted-foreground">
                {LABELS.environmentHostingLabel}
              </span>
              <select
                className="bg-background border border-border/50 rounded px-1 py-0.5"
                value={draft.env.hostingModel ?? ""}
                onChange={(ev) =>
                  setDraft({
                    ...draft,
                    env: {
                      ...draft.env,
                      hostingModel:
                        ev.target.value === "" ? null : ev.target.value,
                    },
                  })
                }
                data-testid="ctad-environment-form-hosting"
              >
                <option value="">{LABELS.environmentHostingNone}</option>
                {ENVIRONMENT_HOSTING_MODEL_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            {error !== null && (
              <p
                className="col-span-2 text-destructive"
                data-testid="ctad-environment-form-error"
              >
                {error}
              </p>
            )}
            <div className="col-span-2 flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                data-testid="ctad-environment-form-cancel"
              >
                {LABELS.environmentCancelButton}
              </Button>
              <Button
                size="sm"
                onClick={commit}
                data-testid="ctad-environment-form-save"
              >
                {LABELS.environmentSaveButton}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AppliedCardsPanel({ binding }: { binding: CtadBinding }) {
  const entries = getAppliedCardsForBinding(binding);
  return (
    <Card data-testid="ctad-applied-cards-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.appliedCardsHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.appliedCardsHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p
            className="text-xs text-muted-foreground"
            data-testid="ctad-applied-cards-empty"
          >
            {LABELS.appliedCardsEmpty}
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {entries.map((e) => (
              <li
                key={e.cardId}
                className="flex items-center justify-between gap-2 border border-border/50 rounded-md px-2 py-1"
                data-testid={`ctad-applied-card-${e.cardId}`}
              >
                <span className="font-mono">{e.cardId}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeAppliedCard(binding, e.cardId)}
                  data-testid={`ctad-applied-card-${e.cardId}-remove`}
                >
                  <X className="w-3 h-3" />
                  {LABELS.cardRemoveButton}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ParametersPanel({
  binding,
  doc,
  onPreviewCard,
}: {
  binding: CtadBinding;
  doc: ReturnType<typeof getBindingDoc>;
  onPreviewCard: (card: CncfCard) => void;
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
            onPreviewCard={onPreviewCard}
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
  onPreviewCard,
}: {
  sectionId: CtadSectionId;
  sectionLabel: string;
  parameters: readonly CtadParameter[];
  binding: CtadBinding;
  doc: ReturnType<typeof getBindingDoc>;
  onPreviewCard: (card: CncfCard) => void;
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
        <div className="px-3 pb-3 pt-1 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            {parameters.map((p) => (
              <ParameterRow
                key={p.id}
                param={p}
                binding={binding}
                currentValue={doc.params[p.id]}
              />
            ))}
          </div>
          <RelevantCardsPanel
            sectionId={sectionId}
            binding={binding}
            onPreviewCard={onPreviewCard}
          />
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
  const activeAllowed = getActiveAllowedOptions(binding, param.id);
  const allowedSet =
    activeAllowed === null ? null : new Set(activeAllowed);
  const contribs = getContributions(binding, param.id);

  if (param.kind === "single") {
    const value =
      typeof currentValue === "string" && param.options.includes(currentValue)
        ? currentValue
        : "";
    return (
      <div className="text-xs space-y-1" data-testid={testIdBase}>
        <label className="block space-y-1">
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
            {param.options.map((o) => {
              const allowed = allowedSet === null || allowedSet.has(o);
              return (
                <option key={o} value={o} disabled={!allowed}>
                  {o}
                  {allowed ? "" : " \u2014"}
                </option>
              );
            })}
          </select>
        </label>
        <ConstraintBadge
          paramId={param.id}
          binding={binding}
          allowedSet={allowedSet}
          contribs={contribs}
        />
      </div>
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
          const allowed = allowedSet === null || allowedSet.has(o);
          return (
            <label
              key={o}
              className={`inline-flex items-center gap-1.5 ${allowed ? "" : "opacity-40"}`}
              data-testid={`${testIdBase}-option-${o}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!allowed && !checked}
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
      <ConstraintBadge
        paramId={param.id}
        binding={binding}
        allowedSet={allowedSet}
        contribs={contribs}
      />
    </fieldset>
  );
}

function ConstraintBadge({
  paramId,
  binding,
  allowedSet,
  contribs,
}: {
  paramId: string;
  binding: CtadBinding;
  allowedSet: Set<string> | null;
  contribs: ReturnType<typeof getContributions>;
}) {
  if (allowedSet === null || contribs.length === 0) return null;
  const allowedList = Array.from(allowedSet);
  const conflict = allowedList.length === 0;
  return (
    <div
      className={`flex items-start gap-1.5 text-[10px] mt-1 px-1.5 py-1 rounded border ${conflict ? "border-amber-700/40 bg-amber-950/20 text-amber-300" : "border-border/40 bg-card/40 text-muted-foreground"}`}
      data-testid={`ctad-param-${paramId}-constraint-badge`}
    >
      <Lock className="w-3 h-3 mt-px shrink-0" aria-hidden="true" />
      <div className="space-y-1 min-w-0 flex-1">
        {conflict ? (
          <div>{LABELS.constraintConflictLabel}</div>
        ) : (
          <div>
            <span className="uppercase tracking-wider">
              {LABELS.constrainedToLabel}:
            </span>{" "}
            <span className="font-mono">{allowedList.join(", ")}</span>
          </div>
        )}
        <div
          className="space-y-0.5"
          data-testid={`ctad-param-${paramId}-contrib-list`}
        >
          <div className="uppercase tracking-wider text-muted-foreground">
            {LABELS.contributingCardListLabel}:
          </div>
          <ul className="space-y-0.5">
            {contribs.map((c) => {
              const card = findCard(c.cardId);
              return (
                <li
                  key={c.cardId}
                  className="flex items-center justify-between gap-2"
                  data-testid={`ctad-param-${paramId}-contrib-${c.cardId}`}
                >
                  <span className="font-mono">
                    {c.cardId}
                    {card ? (
                      <>
                        {" \u2014 "}
                        <QuotedSource
                          source="CNCF Cloud Native Landscape"
                          testId={`ctad-param-${paramId}-contrib-${c.cardId}-name`}
                          inline
                        >
                          {card.name}
                        </QuotedSource>
                      </>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="px-1.5 py-0.5 rounded border border-border/60 hover:bg-muted/30 text-[10px]"
                    onClick={() => removeAppliedCard(binding, c.cardId)}
                    data-testid={`ctad-param-${paramId}-contrib-${c.cardId}-remove`}
                  >
                    {LABELS.contributingCardRemove}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function RelevantCardsPanel({
  sectionId,
  binding,
  onPreviewCard,
}: {
  sectionId: CtadSectionId;
  binding: CtadBinding;
  onPreviewCard: (card: CncfCard) => void;
}) {
  const cards = useMemo(() => cardsForSection(sectionId), [sectionId]);
  const grouped = useMemo(() => {
    const map = new Map<string, CncfCard[]>();
    for (const card of cards) {
      const list = map.get(card.subcategory) ?? [];
      list.push(card);
      map.set(card.subcategory, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [cards]);
  return (
    <div
      className="border border-border/30 rounded-md p-2 bg-card/20"
      data-testid={`ctad-relevant-cards-${sectionId}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {LABELS.relevantCardsHeading}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {LABELS.relevantCardsHint}
        </span>
      </div>
      {cards.length === 0 ? (
        <p
          className="text-[11px] text-muted-foreground italic"
          data-testid={`ctad-relevant-cards-${sectionId}-empty`}
        >
          {LABELS.noRelevantCards}
        </p>
      ) : (
        <div className="space-y-2">
          {grouped.map(([sub, items]) => (
            <div
              key={sub}
              className="space-y-1"
              data-testid={`ctad-relevant-cards-${sectionId}-group-${sub.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 border-b border-border/30 pb-0.5">
                <QuotedSource
                  source="CNCF Cloud Native Landscape"
                  testId={`ctad-relevant-cards-${sectionId}-group-${sub.replace(/\s+/g, "-").toLowerCase()}-label`}
                  inline
                >
                  {sub}
                </QuotedSource>
              </div>
              <ul className="space-y-1.5">
                {items.map((card) => (
                  <CardRow
                    key={card.id}
                    card={card}
                    binding={binding}
                    onPreview={() => onPreviewCard(card)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardRow({
  card,
  binding,
  onPreview,
}: {
  card: CncfCard;
  binding: CtadBinding;
  onPreview: () => void;
}) {
  const applied = isCardApplied(binding, card.id);
  return (
    <li
      className="flex items-start justify-between gap-2 border border-border/40 rounded-md px-2 py-1.5"
      data-testid={`ctad-card-${card.id}`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold">
            <QuotedSource
              source="CNCF Cloud Native Landscape"
              testId={`ctad-card-${card.id}-name`}
              inline
            >
              {card.name}
            </QuotedSource>
          </span>
          <span className="text-[10px] text-muted-foreground">
            {LABELS.cardCategoryLabel}:{" "}
            <QuotedSource
              source="CNCF Cloud Native Landscape"
              testId={`ctad-card-${card.id}-category`}
              inline
            >
              {card.category} / {card.subcategory}
            </QuotedSource>
          </span>
        </div>
        <div className="text-[10px]">
          <span className="text-muted-foreground uppercase tracking-wider">
            {LABELS.cardMaturityLabel}:
          </span>{" "}
          <QuotedSource
            source="CNCF Cloud Native Landscape"
            testId={`ctad-card-${card.id}-maturity`}
          >
            {card.maturity}
          </QuotedSource>
        </div>
        <div className="text-[11px]">
          <QuotedSource
            source="CNCF Cloud Native Landscape"
            testId={`ctad-card-${card.id}-description`}
          >
            {card.description}
          </QuotedSource>
        </div>
      </div>
      <div className="shrink-0 flex flex-col gap-1">
        {applied ? (
          <>
            <span
              className="text-[10px] uppercase tracking-wider text-muted-foreground text-right"
              data-testid={`ctad-card-${card.id}-applied-flag`}
            >
              {LABELS.cardAlreadyApplied}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => removeAppliedCard(binding, card.id)}
              data-testid={`ctad-card-${card.id}-remove`}
            >
              <X className="w-3 h-3" />
              {LABELS.cardRemoveButton}
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onPreview}
            data-testid={`ctad-card-${card.id}-apply`}
          >
            <Plus className="w-3 h-3" />
            {LABELS.cardApplyButton}
          </Button>
        )}
      </div>
    </li>
  );
}

function PreviewModal({
  card,
  preview,
  onCancel,
  onCommit,
}: {
  binding: CtadBinding;
  card: CncfCard;
  preview: CardApplicationPreview;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const blocked = preview.conflicts.length > 0;
  const empty =
    preview.setEffects.length === 0 &&
    preview.constraintEffects.length === 0 &&
    preview.justifyEffects.length === 0 &&
    preview.conflicts.length === 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      data-testid="ctad-preview-modal"
    >
      <Card className="w-full max-w-2xl max-h-[85vh] overflow-auto">
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>{LABELS.previewHeading}</span>
            <span className="text-xs font-normal text-muted-foreground">
              <QuotedSource
                source="CNCF Cloud Native Landscape"
                testId={`ctad-preview-${card.id}-name`}
                inline
              >
                {card.name}
              </QuotedSource>
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            {LABELS.previewSubheading}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {empty && (
            <p className="text-muted-foreground italic">
              {LABELS.previewSectionEmpty}
            </p>
          )}
          {preview.setEffects.length > 0 && (
            <PreviewSection
              title={LABELS.previewSectionSets}
              testId="ctad-preview-sets"
            >
              <ul className="space-y-1 font-mono text-[11px]">
                {preview.setEffects.map((e) => (
                  <li key={e.paramId}>
                    {e.paramId}: {LABELS.previewBefore}=
                    <span className="text-muted-foreground">
                      {formatParamValue(e.before)}
                    </span>
                    {" \u2192 "}
                    {LABELS.previewAfter}=
                    <span className="text-primary">
                      {formatParamValue(e.after)}
                    </span>
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
          {preview.constraintEffects.length > 0 && (
            <PreviewSection
              title={LABELS.previewSectionConstrains}
              testId="ctad-preview-constrains"
            >
              <ul className="space-y-1 font-mono text-[11px]">
                {preview.constraintEffects.map((e) => (
                  <li key={e.paramId}>
                    {e.paramId} {"\u2190"} {e.addsAllowedOptions.join(", ")}{" "}
                    <span className="text-muted-foreground">
                      (
                      {e.newActiveAllowedOptions.length === 0
                        ? "\u2205"
                        : e.newActiveAllowedOptions.join(", ")}
                      )
                    </span>
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
          {preview.justifyEffects.length > 0 && (
            <PreviewSection
              title={LABELS.previewSectionJustifies}
              testId="ctad-preview-justifies"
            >
              <ul className="space-y-1 text-[11px]">
                {preview.justifyEffects.map((e, i) => (
                  <li key={`${e.paramId}-${i}`}>
                    <span className="font-mono">{e.paramId}</span>:{" "}
                    <QuotedSource source="CNCF Cloud Native Landscape">{e.rationale}</QuotedSource>
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
          {preview.conflicts.length > 0 && (
            <PreviewSection
              title={LABELS.previewSectionConflicts}
              testId="ctad-preview-conflicts"
            >
              <ul className="space-y-1 text-[11px] text-amber-300">
                {preview.conflicts.map((c, i) => (
                  <li
                    key={`${c.paramId}-${i}`}
                    className="flex items-start gap-1.5"
                  >
                    <AlertTriangle
                      className="w-3 h-3 mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-mono">{c.paramId}</span>:{" "}
                      {c.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </PreviewSection>
          )}
          <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2">
            {blocked ? LABELS.previewBlockedByConflicts : LABELS.previewReady}
          </div>
        </CardContent>
        <div className="flex items-center justify-end gap-2 px-6 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            data-testid="ctad-preview-cancel"
          >
            {LABELS.previewCancel}
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={blocked}
            onClick={onCommit}
            data-testid="ctad-preview-commit"
          >
            {LABELS.previewCommit}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function PreviewSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

function formatParamValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${(v as string[]).join(", ")}]`;
  return String(v);
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

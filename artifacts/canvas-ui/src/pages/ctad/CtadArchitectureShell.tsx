// CTAD architecture shell — Phase 1 (standalone-mode CTAD).
//
// Renders a CTAD workspace anchored to a standalone architecture
// (no ADC binding). The layout deliberately mirrors CtadShell's
// section / parameter / environments structure so the user
// experience is identical aside from the absence of:
//   - the "ADC binding (read-only)" panel
//   - per-parameter constraint badges (CNCF apply layer is not
//     wired into architecture mode in Phase 1; a follow-up will
//     refactor cncfApplyService to take a workspace ref so the
//     applied-cards layer becomes available here)
//
// Every static label is asserted against the CTAD vocabulary tier
// at module load.

import {
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRoute, Link } from "wouter";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
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
  ENVIRONMENT_HOSTING_MODEL_OPTIONS,
  ENVIRONMENT_KIND_OPTIONS,
  NOT_SPECIFIED_LABEL,
  isValidEnvironmentId,
  type CtadEnvironmentDef,
  type CtadParameter,
  type CtadSectionId,
} from "@/ctad/ctadRegistry";
import {
  addArchitectureEnvironment,
  exportArchitectureState,
  getArchitectureDoc,
  getStoreVersion,
  removeArchitectureEnvironment,
  setArchitectureParam,
  subscribe,
  updateArchitectureEnvironment,
  type CtadArchitectureDoc,
  type CtadArchitectureStateExport,
  type CtadParamValue,
} from "@/ctad/ctadStore";
import { isValidArchitectureId } from "@/ctad/architectureIdentity";

const LABELS = {
  brandLabel: "Architecture Decision Canvas",
  pageTitle: "Architecture exploration",
  pageSubtitle:
    "Standalone technology exploration. Selections here are not anchored to any frozen ADC decision.",
  identityHeading: "Architecture identity",
  identityHint:
    "This workspace exists independently of ADC. Identity fields are local to CTAD only.",
  fieldArchitectureName: "Architecture name",
  fieldArchitectureId: "Architecture id",
  fieldCreatedAt: "Created",
  fieldUpdatedAt: "Last edited",
  parametersHeading: "Technology parameters",
  parametersHint:
    "Each parameter is a categorical class. Selections are reversible at any time and may be left unspecified.",
  notSpecified: NOT_SPECIFIED_LABEL,
  showSection: "Show",
  hideSection: "Hide",
  ctadStateHeading: "CTAD_STATE (live preview)",
  ctadStateHint:
    "Serialised exploration state grouped by section. Unspecified parameters appear as null.",
  notFoundHeading: "Architecture not found",
  notFoundBody:
    "No standalone architecture matches this identifier. Return to the entry page to pick a different one.",
  backToEntry: "Back to entry",
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

assertAllCtadLanguage(Object.values(LABELS));

function formatDate(iso: string): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, getStoreVersion, () => 0);
}

export default function CtadArchitectureShell() {
  const [match, params] = useRoute<{ architectureId: string }>(
    "/ctad/arch/:architectureId",
  );
  if (!match || !params) return null;

  const architectureId = decodeURIComponent(params.architectureId);

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
        <div className="space-y-1" data-testid="ctad-arch-shell-heading">
          <h1 className="text-xl font-bold tracking-tight">
            {LABELS.pageTitle}
          </h1>
          <p className="text-xs text-muted-foreground">
            {LABELS.pageSubtitle}
          </p>
        </div>

        {!isValidArchitectureId(architectureId) ? (
          <NotFoundCard />
        ) : (
          <ArchitectureBody architectureId={architectureId} />
        )}
      </main>
    </div>
  );
}

function NotFoundCard() {
  return (
    <Card data-testid="ctad-arch-shell-not-found">
      <CardHeader>
        <CardTitle className="text-base">{LABELS.notFoundHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.notFoundBody}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/ctad">
          <Button
            variant="outline"
            size="sm"
            data-testid="ctad-arch-shell-back-to-entry"
          >
            {LABELS.backToEntry}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function ArchitectureBody({ architectureId }: { architectureId: string }) {
  useStoreVersion();
  const doc = useMemo(
    () => getArchitectureDoc(architectureId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [architectureId, getStoreVersion()],
  );
  const exported = useMemo(
    () => exportArchitectureState(architectureId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [architectureId, getStoreVersion()],
  );
  if (doc === null || exported === null) return <NotFoundCard />;
  return (
    <>
      <IdentityPanel doc={doc} />
      <EnvironmentsPanel architectureId={architectureId} doc={doc} />
      <ParametersPanel architectureId={architectureId} doc={doc} />
      <CtadStatePreview state={exported} />
    </>
  );
}

function IdentityPanel({ doc }: { doc: CtadArchitectureDoc }) {
  const fields: ReadonlyArray<{ label: string; value: string; testId: string }> = [
    {
      label: LABELS.fieldArchitectureName,
      value: doc.architectureName,
      testId: "arch-identity-name",
    },
    {
      label: LABELS.fieldArchitectureId,
      value: doc.architectureId,
      testId: "arch-identity-id",
    },
    {
      label: LABELS.fieldCreatedAt,
      value: formatDate(doc.createdAt),
      testId: "arch-identity-created",
    },
    {
      label: LABELS.fieldUpdatedAt,
      value: formatDate(doc.updatedAt),
      testId: "arch-identity-updated",
    },
  ];
  return (
    <Card data-testid="ctad-arch-identity-panel">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.identityHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.identityHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
          {fields.map((f) => (
            <div key={f.testId} data-testid={f.testId}>
              <dt className="text-muted-foreground uppercase tracking-wider text-[10px]">
                {f.label}
              </dt>
              <dd className="mt-0.5 break-all">{f.value || "\u2014"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function EnvironmentsPanel({
  architectureId,
  doc,
}: {
  architectureId: string;
  doc: CtadArchitectureDoc;
}) {
  const envs = doc.environments;
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
      if (draft.mode === "create") addArchitectureEnvironment(architectureId, e);
      else updateArchitectureEnvironment(architectureId, e);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Card data-testid="ctad-arch-environments-panel">
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
            data-testid="ctad-arch-environments-empty"
          >
            {LABELS.environmentsEmpty}
          </p>
        ) : (
          <ul className="space-y-1 text-xs">
            {envs.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-2 border border-border/50 rounded-md px-2 py-1"
                data-testid={`ctad-arch-environment-${e.id}`}
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
                    data-testid={`ctad-arch-environment-${e.id}-edit`}
                  >
                    {LABELS.environmentEditButton}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      removeArchitectureEnvironment(architectureId, e.id)
                    }
                    data-testid={`ctad-arch-environment-${e.id}-remove`}
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
              data-testid="ctad-arch-environment-add"
            >
              {LABELS.environmentAddButton}
            </Button>
          </div>
        ) : (
          <div
            className="mt-2 grid grid-cols-2 gap-2 text-xs border border-border/50 rounded-md p-2"
            data-testid="ctad-arch-environment-form"
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
                data-testid="ctad-arch-environment-form-id"
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
                data-testid="ctad-arch-environment-form-name"
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
                data-testid="ctad-arch-environment-form-kind"
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
                data-testid="ctad-arch-environment-form-hosting"
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
                data-testid="ctad-arch-environment-form-error"
              >
                {error}
              </p>
            )}
            <div className="col-span-2 flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={cancel}
                data-testid="ctad-arch-environment-form-cancel"
              >
                {LABELS.environmentCancelButton}
              </Button>
              <Button
                size="sm"
                onClick={commit}
                data-testid="ctad-arch-environment-form-save"
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

function ParametersPanel({
  architectureId,
  doc,
}: {
  architectureId: string;
  doc: CtadArchitectureDoc;
}) {
  return (
    <Card data-testid="ctad-arch-parameters-panel">
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
            architectureId={architectureId}
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
  architectureId,
  doc,
}: {
  sectionId: CtadSectionId;
  sectionLabel: string;
  parameters: readonly CtadParameter[];
  architectureId: string;
  doc: CtadArchitectureDoc;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="border border-border/50 rounded-md"
      data-testid={`ctad-arch-section-${sectionId}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-card/40"
        data-testid={`ctad-arch-section-${sectionId}-toggle`}
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
                architectureId={architectureId}
                currentValue={doc.params[p.id]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParameterRow({
  param,
  architectureId,
  currentValue,
}: {
  param: CtadParameter;
  architectureId: string;
  currentValue: CtadParamValue | undefined;
}) {
  const testIdBase = `ctad-arch-param-${param.id}`;
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
              setArchitectureParam(
                architectureId,
                param.id,
                next === "" ? null : next,
              );
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
      </div>
    );
  }
  const selected = new Set<string>(
    Array.isArray(currentValue)
      ? (currentValue as string[]).filter((v) => param.options.includes(v))
      : [],
  );
  return (
    <fieldset className="text-xs space-y-1" data-testid={testIdBase}>
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
                  setArchitectureParam(
                    architectureId,
                    param.id,
                    arr.length === 0 ? null : arr,
                  );
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

function CtadStatePreview({ state }: { state: CtadArchitectureStateExport }) {
  return (
    <Card data-testid="ctad-arch-state-preview">
      <CardHeader>
        <CardTitle className="text-sm">{LABELS.ctadStateHeading}</CardTitle>
        <CardDescription className="text-xs">
          {LABELS.ctadStateHint}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <pre
          className="text-[10px] bg-muted/30 p-2 rounded overflow-x-auto"
          data-testid="ctad-arch-state-preview-json"
        >
          {JSON.stringify(state, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

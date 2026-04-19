import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Radio, Layout, Plus, X, ArrowUpDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PortfolioHeaderNav } from "@/components/governance/PortfolioHeaderNav";
import { ReadOnlyArtefactModal } from "@/components/governance/ReadOnlyArtefactModal";
import { listEntries } from "@/governance/portfolioStore";
import { assertAllSignalsLanguage } from "@/governance/staticTextGuard";
import {
  SIGNAL_CATEGORIES,
  type SignalCategory,
  type PolicySignal,
  type RelatedEntry,
  listSignals,
  createSignal,
  advanceSignal,
  endsWithQuestionMark,
  nextStatus,
} from "@/governance/signalsStore";

// S6-HC8 governance language guard. Every user-visible static label on
// the Signals page is registered here. The guard runs at module load
// and throws if any forbidden vocabulary appears (priority, fix,
// resolve, escalate, mitigate — plus the Step 5 portfolio set).
// JSX below references only these constants — never literal strings —
// so the guard cannot be bypassed.
const T = {
  pageTitle: "Policy Signals",
  interpretationHeading: "Reading this view",
  interpretation1:
    "This view records patterns leadership has noticed across the approved decisions in the portfolio.",
  interpretation2:
    "Signals are descriptive memory only. They do not assess, rank, or grade decisions and they do not require any action.",
  interpretation3:
    "Order in this list is presentation only. It does not imply importance or sequence.",
  interpretation4:
    "A signal is recorded only when leadership chooses to do so. Nothing on this page is generated automatically.",
  listHeading: "Recorded Policy Signals",
  newButton: "Record a Policy Signal",
  presentationCaption:
    "Sort controls are presentation conveniences. Order does not imply importance.",
  emptyState:
    "No policy signals have been recorded. The page remains empty until leadership chooses to record one.",
  detailHeading: "Policy Signal",
  formHeading: "Record a Policy Signal",
  cancel: "Cancel",
  submit: "Record Signal",
  advanceLabel: "Advance to next state",
  terminalLabel: "Terminal state reached. No further transitions.",
  // Table headers
  colCategory: "Category",
  colTitle: "Title",
  colStatus: "Status",
  colReviewingBody: "Reviewing Body",
  colCreated: "Created",
  colLastReviewed: "Last Reviewed",
  colActions: "Actions",
  view: "View",
  // Detail field labels
  fieldSignalId: "Signal ID",
  fieldDescription: "Description",
  fieldEvidenceSummary: "Evidence Summary",
  fieldObservationWindow: "Observation window",
  fieldRelatedDecisionCount: "Related decision count",
  fieldQualitativePattern: "Qualitative pattern",
  fieldRelatedEntries: "Related Portfolio Entries",
  fieldInterpretationGuidance: "Interpretation Guidance",
  fieldRegulatoryContext: "Regulatory Context",
  fieldReviewingBody: "Reviewing Body",
  fieldCreated: "Created",
  fieldLastReviewed: "Last Reviewed",
  // Form labels and placeholders
  formCategory: "Category",
  formTitle: "Title",
  formDescription: "Description",
  formEvidenceLegend: "Evidence Summary",
  formObservationWindow: "Observation Window",
  formObservationWindowPlaceholder: "e.g. Q1-Q3 2026",
  formRelatedCount: "Related Decision Count",
  formQualitativePattern: "Qualitative Pattern",
  formRelatedEntries: "Related Portfolio Entries (optional)",
  formGuidanceLegend: "Interpretation Guidance (questions only, must end with ?)",
  formGuidancePlaceholder:
    "What does this pattern suggest about our governance posture?",
  formGuidanceError:
    "Each interpretation guidance entry must be a question ending with ?",
  formAddQuestion: "Add question",
  formRegulatoryContext: "Regulatory Context (optional)",
  formReviewingBody: "Reviewing Body",
  formReviewingBodyPlaceholder: "e.g. Architecture Board",
  viewPortfolio: "View portfolio",
  vSeparator: "v",
};

assertAllSignalsLanguage(Object.values(T));

type SortKey = "createdAt" | "lastReviewedAt" | "signalCategory";

const STATUS_BADGE: Record<string, string> = {
  Observed: "bg-muted text-muted-foreground border-border",
  "Under Discussion": "bg-amber-500/10 text-amber-500 border-amber-500/20",
  Acknowledged: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

function formatDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export default function Signals() {
  const [signals, setSignals] = useState<PolicySignal[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PolicySignal | null>(null);

  useEffect(() => {
    setSignals(listSignals());
  }, []);

  const refresh = () => setSignals(listSignals());

  const sorted = useMemo(() => {
    const arr = [...signals];
    arr.sort((a, b) => {
      let av: string;
      let bv: string;
      if (sortKey === "signalCategory") {
        av = a.signalCategory;
        bv = b.signalCategory;
      } else {
        av = a[sortKey];
        bv = b[sortKey];
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [signals, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const handleAdvance = (signalId: string) => {
    const updated = advanceSignal(signalId);
    refresh();
    setViewing(updated);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Radio className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              {T.pageTitle}
            </span>
          </div>
          <PortfolioHeaderNav />
        </div>
      </header>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-8 space-y-8">
        <InterpretationPanel />

        <Card data-testid="signals-list">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {T.listHeading}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setCreating(true)}
              data-testid="button-new-signal"
            >
              <Plus className="w-4 h-4" /> {T.newButton}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {signals.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="flex flex-wrap gap-3 items-end text-xs">
                  <p className="text-[10px] italic text-muted-foreground ml-auto max-w-md">
                    {T.presentationCaption}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table
                    className="w-full text-xs border-collapse"
                    data-testid="table-signals"
                  >
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground uppercase tracking-wider text-[10px]">
                        <SortableHeader
                          label={T.colCategory}
                          col="signalCategory"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <th className="py-2 px-2">{T.colTitle}</th>
                        <th className="py-2 px-2">{T.colStatus}</th>
                        <th className="py-2 px-2">{T.colReviewingBody}</th>
                        <SortableHeader
                          label={T.colCreated}
                          col="createdAt"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <SortableHeader
                          label={T.colLastReviewed}
                          col="lastReviewedAt"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                        <th className="py-2 px-2">{T.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((s) => (
                        <tr
                          key={s.signalId}
                          className="border-b border-border/50 hover:bg-muted/30"
                          data-testid={`row-signal-${s.signalId}`}
                        >
                          <td className="py-2 px-2">{s.signalCategory}</td>
                          <td className="py-2 px-2 font-semibold">
                            {s.signalTitle}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`inline-block px-2 py-0.5 border rounded text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}
                              data-testid={`status-${s.signalId}`}
                            >
                              {s.status}
                            </span>
                          </td>
                          <td className="py-2 px-2">{s.reviewingBody}</td>
                          <td className="py-2 px-2 tabular-nums">
                            {formatDate(s.createdAt)}
                          </td>
                          <td className="py-2 px-2 tabular-nums">
                            {formatDate(s.lastReviewedAt)}
                          </td>
                          <td className="py-2 px-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 gap-1 text-[10px]"
                              onClick={() => setViewing(s)}
                              data-testid={`view-signal-${s.signalId}`}
                            >
                              {T.view}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      <ReadOnlyArtefactModal
        open={creating}
        title={T.formHeading}
        testid="modal-create-signal"
        onClose={() => setCreating(false)}
      >
        <CreateSignalForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            refresh();
          }}
        />
      </ReadOnlyArtefactModal>

      <ReadOnlyArtefactModal
        open={viewing !== null}
        title={T.detailHeading}
        testid="modal-signal-detail"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <SignalDetail signal={viewing} onAdvance={handleAdvance} />
        )}
      </ReadOnlyArtefactModal>
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
        <p>{T.interpretation4}</p>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div
      className="py-12 text-center text-muted-foreground text-xs"
      data-testid="empty-state"
    >
      {T.emptyState}
    </div>
  );
}

function SortableHeader(props: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
}) {
  const active = props.sortKey === props.col;
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

function SignalDetail({
  signal,
  onAdvance,
}: {
  signal: PolicySignal;
  onAdvance: (id: string) => void;
}) {
  const next = nextStatus(signal.status);
  const e = signal.evidenceSummary;
  return (
    <div className="space-y-5 text-xs leading-relaxed" data-testid="signal-detail">
      <div className="border-b border-border pb-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {signal.signalCategory}
        </div>
        <div className="text-base font-bold mt-1">{signal.signalTitle}</div>
        <div className="mt-2">
          <span
            className={`inline-block px-2 py-0.5 border rounded text-[10px] font-semibold ${STATUS_BADGE[signal.status]}`}
          >
            {signal.status}
          </span>
        </div>
      </div>

      <Field label={T.fieldSignalId}>
        <span data-testid="detail-signal-id">{signal.signalId}</span>
      </Field>

      <Field label={T.fieldDescription}>{signal.signalDescription}</Field>

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {T.fieldEvidenceSummary}
        </div>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            {T.fieldObservationWindow}: {e.observationWindow}
          </li>
          <li>
            {T.fieldRelatedDecisionCount}: {e.relatedDecisionCount}
          </li>
          <li>
            {T.fieldQualitativePattern}: {e.qualitativePattern}
          </li>
        </ul>
        {e.relatedEntries && e.relatedEntries.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              {T.fieldRelatedEntries}
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {e.relatedEntries.map((r) => (
                <li key={`${r.adsId}__${r.adsVersion}`}>
                  <span className="font-semibold">{r.adsId}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {T.vSeparator}
                    {r.adsVersion}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {T.fieldInterpretationGuidance}
        </div>
        <ul className="list-disc pl-5 space-y-0.5">
          {signal.interpretationGuidance.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>

      {signal.regulatoryContext && (
        <Field label={T.fieldRegulatoryContext}>
          {signal.regulatoryContext}
        </Field>
      )}

      <Field label={T.fieldReviewingBody}>{signal.reviewingBody}</Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label={T.fieldCreated}>{formatDate(signal.createdAt)}</Field>
        <Field label={T.fieldLastReviewed}>
          {formatDate(signal.lastReviewedAt)}
        </Field>
      </div>

      <div className="border-t border-border pt-3">
        {next ? (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => onAdvance(signal.signalId)}
            data-testid="button-advance"
          >
            {T.advanceLabel}: {signal.status}{" "}
            <ArrowRight className="w-3 h-3" /> {next}
          </Button>
        ) : (
          <div
            className="text-[10px] italic text-muted-foreground"
            data-testid="terminal-note"
          >
            {T.terminalLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function CreateSignalForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const portfolioEntries = useMemo(() => listEntries(), []);

  const [signalCategory, setSignalCategory] = useState<SignalCategory>(
    SIGNAL_CATEGORIES[0],
  );
  const [signalTitle, setSignalTitle] = useState("");
  const [signalDescription, setSignalDescription] = useState("");
  const [observationWindow, setObservationWindow] = useState("");
  const [relatedDecisionCount, setRelatedDecisionCount] = useState<number>(0);
  const [qualitativePattern, setQualitativePattern] = useState("");
  const [relatedEntries, setRelatedEntries] = useState<RelatedEntry[]>([]);
  const [guidance, setGuidance] = useState<string[]>([""]);
  const [regulatoryContext, setRegulatoryContext] = useState("");
  const [reviewingBody, setReviewingBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const guidanceInvalid = guidance.some((q) => !endsWithQuestionMark(q));

  const requiredMissing =
    signalTitle.trim().length === 0 ||
    signalDescription.trim().length === 0 ||
    observationWindow.trim().length === 0 ||
    qualitativePattern.trim().length === 0 ||
    reviewingBody.trim().length === 0 ||
    guidance.length === 0;

  const canSubmit = !requiredMissing && !guidanceInvalid;

  const toggleEntry = (entry: RelatedEntry) => {
    const key = `${entry.adsId}__${entry.adsVersion}`;
    const exists = relatedEntries.some(
      (r) => `${r.adsId}__${r.adsVersion}` === key,
    );
    if (exists) {
      setRelatedEntries(
        relatedEntries.filter((r) => `${r.adsId}__${r.adsVersion}` !== key),
      );
    } else {
      setRelatedEntries([...relatedEntries, entry]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    try {
      createSignal({
        signalCategory,
        signalTitle: signalTitle.trim(),
        signalDescription: signalDescription.trim(),
        evidenceSummary: {
          observationWindow: observationWindow.trim(),
          relatedDecisionCount,
          qualitativePattern: qualitativePattern.trim(),
          ...(relatedEntries.length > 0
            ? { relatedEntries: [...relatedEntries] }
            : {}),
        },
        interpretationGuidance: guidance.map((q) => q.trim()),
        regulatoryContext: regulatoryContext.trim() || undefined,
        reviewingBody: reviewingBody.trim(),
      });
      onCreated();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 text-xs"
      data-testid="form-create-signal"
    >
      <FormField label={T.formCategory}>
        <select
          value={signalCategory}
          onChange={(e) => setSignalCategory(e.target.value as SignalCategory)}
          className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
          data-testid="input-category"
        >
          {SIGNAL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label={T.formTitle}>
        <input
          type="text"
          value={signalTitle}
          onChange={(e) => setSignalTitle(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
          data-testid="input-title"
        />
      </FormField>

      <FormField label={T.formDescription}>
        <textarea
          value={signalDescription}
          onChange={(e) => setSignalDescription(e.target.value)}
          rows={3}
          className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
          data-testid="input-description"
        />
      </FormField>

      <fieldset className="border border-border rounded p-3 space-y-3">
        <legend className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">
          {T.formEvidenceLegend}
        </legend>
        <FormField label={T.formObservationWindow}>
          <input
            type="text"
            value={observationWindow}
            onChange={(e) => setObservationWindow(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
            data-testid="input-observation-window"
            placeholder={T.formObservationWindowPlaceholder}
          />
        </FormField>
        <FormField label={T.formRelatedCount}>
          <input
            type="number"
            min={0}
            value={relatedDecisionCount}
            onChange={(e) =>
              setRelatedDecisionCount(Number(e.target.value) || 0)
            }
            className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
            data-testid="input-related-count"
          />
        </FormField>
        <FormField label={T.formQualitativePattern}>
          <textarea
            value={qualitativePattern}
            onChange={(e) => setQualitativePattern(e.target.value)}
            rows={2}
            className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
            data-testid="input-qualitative-pattern"
          />
        </FormField>

        {portfolioEntries.length > 0 && (
          <FormField label={T.formRelatedEntries}>
            <div
              className="border border-border rounded max-h-40 overflow-y-auto p-2 space-y-1"
              data-testid="input-related-entries"
            >
              {portfolioEntries.map((p) => {
                const key = `${p.adsId}__${p.adsVersion}`;
                const checked = relatedEntries.some(
                  (r) => `${r.adsId}__${r.adsVersion}` === key,
                );
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        toggleEntry({
                          adsId: p.adsId,
                          adsVersion: p.adsVersion,
                        })
                      }
                      data-testid={`related-${p.adsId}-${p.adsVersion}`}
                    />
                    <span className="font-semibold">{p.adsId}</span>
                    <span className="text-muted-foreground">
                      {T.vSeparator}
                      {p.adsVersion}
                    </span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {p.projectName}
                    </span>
                  </label>
                );
              })}
            </div>
          </FormField>
        )}
      </fieldset>

      <fieldset className="border border-border rounded p-3 space-y-3">
        <legend className="text-[10px] uppercase tracking-widest text-muted-foreground px-1">
          {T.formGuidanceLegend}
        </legend>
        {guidance.map((q, i) => {
          const invalid = !endsWithQuestionMark(q);
          return (
            <div key={i} className="flex gap-2 items-start">
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  const copy = [...guidance];
                  copy[i] = e.target.value;
                  setGuidance(copy);
                }}
                className={`bg-background border rounded px-2 py-1.5 text-xs flex-1 ${
                  invalid && q.length > 0
                    ? "border-destructive"
                    : "border-border"
                }`}
                placeholder={T.formGuidancePlaceholder}
                data-testid={`input-guidance-${i}`}
              />
              {guidance.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setGuidance(guidance.filter((_, j) => j !== i))
                  }
                  data-testid={`remove-guidance-${i}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setGuidance([...guidance, ""])}
          data-testid="add-guidance"
        >
          <Plus className="w-3 h-3" /> {T.formAddQuestion}
        </Button>
        {guidanceInvalid && (
          <div
            className="text-[10px] text-destructive"
            data-testid="guidance-error"
          >
            {T.formGuidanceError}
          </div>
        )}
      </fieldset>

      <FormField label={T.formRegulatoryContext}>
        <input
          type="text"
          value={regulatoryContext}
          onChange={(e) => setRegulatoryContext(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
          data-testid="input-regulatory-context"
        />
      </FormField>

      <FormField label={T.formReviewingBody}>
        <input
          type="text"
          value={reviewingBody}
          onChange={(e) => setReviewingBody(e.target.value)}
          className="bg-background border border-border rounded px-2 py-1.5 text-xs w-full"
          data-testid="input-reviewing-body"
          placeholder={T.formReviewingBodyPlaceholder}
        />
      </FormField>

      {submitError && (
        <div
          className="text-[11px] text-destructive border border-destructive/30 rounded px-2 py-1.5"
          data-testid="submit-error"
        >
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          data-testid="button-cancel"
        >
          {T.cancel}
        </Button>
        <Button
          type="submit"
          disabled={!canSubmit}
          data-testid="button-submit"
        >
          {T.submit}
        </Button>
      </div>

      <div className="text-[10px] text-muted-foreground border-t border-border pt-2 flex items-center gap-2">
        <Layout className="w-3 h-3" />
        <Link
          href="/portfolio"
          className="underline hover:text-foreground"
          data-testid="link-portfolio-from-form"
        >
          {T.viewPortfolio}
        </Link>
      </div>
    </form>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

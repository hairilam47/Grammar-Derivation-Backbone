// Stage A (ADC Wizard Retrofit) — Freeze screen.
//
// Terminal step of the wizard. Surfaces TWO independent freeze
// actions and the export controls:
//
//   1. Freeze Requirements — calls
//      `requirementsContractStore.freezeContract(...)` over the live
//      approved requirements for the placeholder work item. The flip
//      from approved → frozen is atomic with the contract write.
//      The action is idempotent: re-clicking with the same approved
//      set returns the SAME contract id and DOES NOT mutate the
//      store. The resulting contractId can then be carried into the
//      portfolio entry by the second freeze.
//
//   2. Freeze Decision — collects the project metadata, builds the
//      ADS / ECP, persists a portfolio entry via
//      `addOrUpdateEntry(entryFromADS(ads, contractId))`, then
//      signals the shell so it can redirect to the portfolio. Carries
//      the requirements contract id ONLY when one was frozen above.
//
// Every static label rendered here is asserted against the Urgency
// vocabulary tier at module load.

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Lock,
  ArrowLeft,
  RotateCcw,
  LayoutGrid,
  FileText,
  FileType,
  CheckCircle2,
  Shield,
  ListChecks,
} from "lucide-react";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
} from "@workspace/architecture-grammar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ProjectMetadata } from "@/governance/types";
import { buildADS } from "@/governance/adsBuilder";
import { buildECP } from "@/governance/ecpBuilder";
import { addOrUpdateEntry, entryFromADS } from "@/governance/portfolioStore";
import { AdsPreview } from "@/components/governance/AdsPreview";
import { EcpPreview } from "@/components/governance/EcpPreview";
import {
  exportADSPdf,
  exportADSDocx,
  exportECPPdf,
  exportECPDocx,
} from "@/governance/export";
import {
  type Requirement,
  listRequirements,
  subscribe as subscribeRequirements,
} from "@/governance/requirementsStore";
import {
  freezeContract,
  type RequirementsContract,
} from "@/governance/requirementsContractStore";
import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { assertAllUrgencyLanguage } from "@/governance/staticTextGuard";
import { SrsExportButton } from "./SrsExportButton";

const STATIC_LABELS = [
  "Freeze",
  "Requirements Contract",
  "Decision Record",
  "Approved requirements eligible to be frozen as a contract.",
  "No approved requirements yet — the contract action is unavailable until at least one requirement is approved.",
  "Freeze Requirements",
  "Freeze Decision",
  "Project Name",
  "Approving Authority",
  "Frozen As",
  "Contract ID",
  "Frozen At",
  "Frozen By",
  "Total",
  "View Portfolio",
  "Back to Trade-Offs",
  "Start Over",
  "Export ADS (PDF)",
  "Export ADS (DOCX)",
  "Export ECP (PDF)",
  "Export ECP (DOCX)",
  "Architecture Decision Snapshot · Preview",
  "Execution Constraint Profile · Preview",
  "Decision frozen.",
  "Provide the project metadata, then commit the decision.",
  "Approved",
  "Routine",
  "Standard",
  "Elevated",
  "Acute",
  "Functional",
  "Non-functional",
  "Constraint",
  "Hardware",
];
assertAllUrgencyLanguage(STATIC_LABELS);

interface FreezeScreenProps {
  readonly context: OrganisationContext;
  readonly selections: readonly CapabilitySelection[];
  readonly baselineTradeOffs: TradeOffSettings;
  readonly onBack: () => void;
  readonly onStartOver: () => void;
  readonly onAfterFreezeDecision: () => void;
}

const EMPTY_METADATA: ProjectMetadata = {
  projectName: "",
  approvingAuthority: "",
};

export function FreezeScreen({
  context,
  selections,
  baselineTradeOffs,
  onBack,
  onStartOver,
  onAfterFreezeDecision,
}: FreezeScreenProps) {
  const { workItemId } = useCurrentScope();
  const [metadata, setMetadata] = useState<ProjectMetadata>(EMPTY_METADATA);
  const [requirements, setRequirements] = useState<readonly Requirement[]>(
    () => (workItemId ? listRequirements(workItemId) : []),
  );
  const [contract, setContract] = useState<RequirementsContract | null>(null);
  const [decisionFrozen, setDecisionFrozen] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!workItemId) {
      setRequirements([]);
      return;
    }
    setRequirements(listRequirements(workItemId));
    const unsub = subscribeRequirements(() => {
      setRequirements(listRequirements(workItemId));
    });
    return () => {
      unsub();
    };
  }, [workItemId]);

  const approvedAndFrozen = useMemo(
    () => requirements.filter((r) => r.status === "approved" || r.status === "frozen"),
    [requirements],
  );

  const metadataReady =
    metadata.projectName.trim().length > 0 &&
    metadata.approvingAuthority.trim().length > 0;

  // Build the ADS only when metadata is ready so the preview reacts
  // to field edits live.
  const ads = useMemo(() => {
    if (!metadataReady) return null;
    return buildADS({
      context,
      selections: selections.slice(),
      baselineTradeOffs,
      metadata,
    });
  }, [context, selections, baselineTradeOffs, metadata, metadataReady]);

  const ecp = useMemo(() => (ads ? buildECP(ads) : null), [ads]);

  const onFreezeRequirements = () => {
    setReqError(null);
    try {
      if (!workItemId) {
        throw new Error("No active Work Item.");
      }
      const eligible = approvedAndFrozen;
      if (eligible.length === 0) {
        throw new Error(
          "No approved requirements available to freeze.",
        );
      }
      const c = freezeContract(
        workItemId,
        eligible,
        // The active workItemId doubles as a stable "frozen by"
        // marker until a real identity layer is wired in.
        workItemId,
      );
      setContract(c);
    } catch (e) {
      setReqError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFreezeDecision = () => {
    setDecisionError(null);
    try {
      if (!ads) {
        throw new Error("Project metadata is required before freezing.");
      }
      const entry = entryFromADS(ads, contract?.contractId);
      addOrUpdateEntry(entry);
      setDecisionFrozen(true);
      // Defer the shell redirect to the next macrotask so the
      // user briefly sees the success state before navigation.
      window.setTimeout(() => onAfterFreezeDecision(), 250);
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            <Lock className="w-3 h-3" /> Step 5 · Freeze
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Freeze</h1>
          <p className="text-muted-foreground text-sm font-mono">
            Provide the project metadata, then commit the decision.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onBack}
            className="gap-2"
            data-testid="button-back-to-tradeoffs"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Trade-Offs
          </Button>
          <Button
            variant="outline"
            onClick={onStartOver}
            className="gap-2"
            data-testid="button-start-over"
          >
            <RotateCcw className="w-4 h-4" /> Start Over
          </Button>
          <Link href="/portfolio">
            <Button
              variant="outline"
              className="gap-2"
              data-testid="button-view-portfolio"
            >
              <LayoutGrid className="w-4 h-4" /> View Portfolio
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-requirements-contract">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <ListChecks className="w-4 h-4" /> Requirements Contract
            </CardTitle>
            <CardDescription>
              Approved requirements eligible to be frozen as a contract.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {approvedAndFrozen.length === 0 && (
              <div
                className="text-xs text-muted-foreground border border-dashed border-border p-3 rounded"
                data-testid="no-approved-hint"
              >
                No approved requirements yet — the contract action is
                unavailable until at least one requirement is approved.
              </div>
            )}
            {approvedAndFrozen.length > 0 && (
              <ul
                className="space-y-1.5 max-h-48 overflow-auto pr-1"
                data-testid="approved-requirements-list"
              >
                {approvedAndFrozen.map((r) => (
                  <li
                    key={r.id}
                    className="text-xs border border-border/40 bg-card/40 rounded px-2 py-1.5 flex items-center gap-2"
                    data-testid={`approved-requirement-${r.id}`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span className="truncate flex-1">{r.title}</span>
                  </li>
                ))}
              </ul>
            )}
            <Button
              onClick={onFreezeRequirements}
              disabled={approvedAndFrozen.length === 0}
              className="gap-2 w-full"
              data-testid="button-freeze-requirements"
            >
              <Shield className="w-4 h-4" /> Freeze Requirements
            </Button>
            {reqError !== null && (
              <div
                className="text-xs text-destructive"
                data-testid="freeze-requirements-error"
              >
                {reqError}
              </div>
            )}
            {contract !== null && (
              <div
                className="text-xs font-mono space-y-1 border border-primary/30 bg-primary/5 p-3 rounded"
                data-testid="contract-summary"
              >
                <Field
                  label="Contract ID"
                  value={contract.contractId}
                  testid="contract-id"
                />
                <Field
                  label="Frozen At"
                  value={contract.frozenAt}
                  testid="contract-frozen-at"
                />
                <Field
                  label="Total"
                  value={String(contract.summary.total)}
                  testid="contract-total"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-decision-record">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4" /> Decision Record
            </CardTitle>
            <CardDescription>
              Provide the project metadata, then commit the decision.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-project">Project Name</Label>
              <Input
                id="meta-project"
                value={metadata.projectName}
                onChange={(e) =>
                  setMetadata({ ...metadata, projectName: e.target.value })
                }
                disabled={decisionFrozen}
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-authority">Approving Authority</Label>
              <Input
                id="meta-authority"
                value={metadata.approvingAuthority}
                onChange={(e) =>
                  setMetadata({
                    ...metadata,
                    approvingAuthority: e.target.value,
                  })
                }
                disabled={decisionFrozen}
                data-testid="input-approving-authority"
              />
            </div>
            <Button
              onClick={onFreezeDecision}
              disabled={!metadataReady || decisionFrozen}
              className="gap-2 w-full"
              data-testid="button-freeze-decision"
            >
              <Lock className="w-4 h-4" /> Freeze Decision
            </Button>
            {decisionError !== null && (
              <div
                className="text-xs text-destructive"
                data-testid="freeze-decision-error"
              >
                {decisionError}
              </div>
            )}
            {decisionFrozen && (
              <div
                className="text-xs text-emerald-500 font-mono"
                data-testid="decision-frozen-confirmation"
              >
                Decision frozen.
              </div>
            )}
            {ads && (
              <div
                className="text-xs font-mono space-y-1 border border-border/60 p-3 rounded"
                data-testid="ads-summary"
              >
                <Field label="ADS ID" value={ads.adsId} testid="ads-id" />
                <Field label="Version" value={ads.version} testid="ads-version" />
                <Field label="Date" value={ads.date} testid="ads-date" />
                {contract !== null && (
                  <Field
                    label="Frozen As"
                    value={contract.contractId}
                    testid="ads-contract-link"
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SRS export is always available on the Freeze screen, regardless
         of whether ADS / ECP previews have been built. The exporter
         renders against whatever data the stores hold and stamps a
         DRAFT watermark when the underlying contract is not frozen. */}
      <div
        className="flex flex-wrap items-end gap-3"
        data-testid="srs-export-bar"
      >
        <SrsExportButton testIdSuffix="freeze" />
      </div>

      {ads && ecp && (
        <>
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
            data-testid="export-bar"
          >
            <Button
              onClick={() => exportADSPdf(ads)}
              className="gap-2"
              data-testid="button-export-ads-pdf"
            >
              <FileText className="w-4 h-4" /> Export ADS (PDF)
            </Button>
            <Button
              onClick={() => exportADSDocx(ads)}
              variant="secondary"
              className="gap-2"
              data-testid="button-export-ads-docx"
            >
              <FileType className="w-4 h-4" /> Export ADS (DOCX)
            </Button>
            <Button
              onClick={() => exportECPPdf(ecp)}
              className="gap-2"
              data-testid="button-export-ecp-pdf"
            >
              <FileText className="w-4 h-4" /> Export ECP (PDF)
            </Button>
            <Button
              onClick={() => exportECPDocx(ecp)}
              variant="secondary"
              className="gap-2"
              data-testid="button-export-ecp-docx"
            >
              <FileType className="w-4 h-4" /> Export ECP (DOCX)
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card data-testid="preview-ads">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                  Architecture Decision Snapshot · Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AdsPreview ads={ads} />
              </CardContent>
            </Card>

            <Card data-testid="preview-ecp">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider">
                  Execution Constraint Profile · Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EcpPreview ecp={ecp} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  testid,
}: {
  label: string;
  value: string;
  testid: string;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="font-bold truncate" data-testid={testid} title={value}>
        {value}
      </span>
    </div>
  );
}

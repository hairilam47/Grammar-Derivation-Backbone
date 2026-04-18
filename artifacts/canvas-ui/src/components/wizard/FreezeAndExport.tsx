import { useEffect, useMemo } from "react";
import { Link } from "wouter";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
} from "@workspace/architecture-grammar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, FileType, RotateCcw, Lock, LayoutGrid } from "lucide-react";
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

interface FreezeAndExportProps {
  context: OrganisationContext;
  selections: CapabilitySelection[];
  baselineTradeOffs: TradeOffSettings;
  metadata: ProjectMetadata;
  onStartOver: () => void;
}

export function FreezeAndExport({
  context,
  selections,
  baselineTradeOffs,
  metadata,
  onStartOver,
}: FreezeAndExportProps) {
  const ads = useMemo(
    () =>
      buildADS({
        context,
        selections,
        baselineTradeOffs,
        metadata,
      }),
    [context, selections, baselineTradeOffs, metadata],
  );

  const ecp = useMemo(() => buildECP(ads), [ads]);

  // Passive portfolio capture: every freeze adds or updates the portfolio
  // entry keyed by (adsId, adsVersion). Users who never open the portfolio
  // see no behavioural change.
  useEffect(() => {
    addOrUpdateEntry(entryFromADS(ads));
  }, [ads]);

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1 flex items-center gap-2">
            <Lock className="w-3 h-3" /> Step 5 · Frozen
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Freeze Decision &amp; Export
          </h1>
          <p className="text-muted-foreground text-sm font-mono">
            The decision is frozen. Export governance artefacts below or start
            over to revise.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/portfolio">
            <Button
              variant="outline"
              className="gap-2"
              data-testid="button-view-portfolio"
            >
              <LayoutGrid className="w-4 h-4" /> View Portfolio
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={onStartOver}
            className="gap-2"
            data-testid="button-start-over"
          >
            <RotateCcw className="w-4 h-4" /> Start Over
          </Button>
        </div>
      </div>

      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border border-primary/30 bg-primary/5 rounded-md text-xs font-mono"
        data-testid="metadata-banner"
      >
        <Field label="ADS ID" value={ads.adsId} testid="banner-ads-id" />
        <Field label="Version" value={ads.version} testid="banner-version" />
        <Field label="Date" value={ads.date} testid="banner-date" />
        <Field
          label="Approving Authority"
          value={ads.approvingAuthority}
          testid="banner-authority"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
        {label}
      </div>
      <div className="font-bold truncate" data-testid={testid} title={value}>
        {value}
      </div>
    </div>
  );
}


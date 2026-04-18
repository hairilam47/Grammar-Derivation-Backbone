import { useMemo } from "react";
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
import { FileText, FileType, RotateCcw, Lock } from "lucide-react";
import type { ProjectMetadata, ADSSection, ECPResolvedSection } from "@/governance/types";
import { buildADS } from "@/governance/adsBuilder";
import { buildECP } from "@/governance/ecpBuilder";
import {
  exportADSPdf,
  exportADSDocx,
  exportECPPdf,
  exportECPDocx,
} from "@/governance/export";

const RISK_COLORS: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

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
        <Button
          variant="outline"
          onClick={onStartOver}
          className="gap-2"
          data-testid="button-start-over"
        >
          <RotateCcw className="w-4 h-4" /> Start Over
        </Button>
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
          <CardContent className="space-y-5">
            <PreviewHeader title="Architecture Decision Snapshot" project={ads.projectName} />
            {ads.sections.map((section) => (
              <ADSPreviewSection key={section.sectionId} section={section} />
            ))}
            <PreviewFooter />
          </CardContent>
        </Card>

        <Card data-testid="preview-ecp">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Execution Constraint Profile · Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <PreviewHeader title="Execution Constraint Profile" project={ecp.projectName} />
            {ecp.sections.map((section) => (
              <ECPPreviewSection key={section.sectionId} section={section} />
            ))}
            <PreviewFooter />
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

function PreviewHeader({ title, project }: { title: string; project: string }) {
  return (
    <div className="border-b border-border pb-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="text-base font-bold">{project}</div>
    </div>
  );
}

function PreviewFooter() {
  return (
    <div className="border-t border-border pt-3 text-[10px] italic text-muted-foreground text-center">
      This artefact was system-generated from an approved Architecture Decision
      Snapshot.
    </div>
  );
}

function SectionTitle({ order, title }: { order: number; title: string }) {
  return (
    <h3 className="text-sm font-bold tracking-wide">
      <span className="text-muted-foreground mr-2">{order}.</span>
      {title}
    </h3>
  );
}

function ADSPreviewSection({ section }: { section: ADSSection }) {
  return (
    <div className="space-y-2" data-testid={`preview-ads-${section.sectionId}`}>
      <SectionTitle order={section.sectionOrder} title={section.title} />
      <div className="text-xs leading-relaxed space-y-1">
        {renderADSBody(section)}
      </div>
    </div>
  );
}

function renderADSBody(section: ADSSection) {
  switch (section.sectionId) {
    case "ADS_DECISION_CONTEXT": {
      const c = section.context;
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Organisation type: {c.organisationType}</li>
          <li>Sensitivity level: {c.sensitivityLevel}</li>
          <li>System intent: {c.systemIntent}</li>
          <li>Expected lifespan: {c.expectedLifespanYears} years</li>
        </ul>
      );
    }
    case "ADS_CAPABILITY_SCOPE": {
      return (
        <div className="space-y-1">
          <p>
            <span className="font-semibold">In-scope:</span>{" "}
            {section.inScope.length === 0
              ? "none"
              : section.inScope.map((c) => c.name).join("; ")}
            .
          </p>
          <p>
            <span className="font-semibold">Deferred:</span>{" "}
            {section.deferred.length === 0
              ? "none"
              : section.deferred.map((c) => c.name).join("; ")}
            .
          </p>
          <p>
            <span className="font-semibold">Out of scope:</span>{" "}
            {section.outOfScope.length === 0
              ? "none"
              : section.outOfScope.map((c) => c.name).join("; ")}
            .
          </p>
        </div>
      );
    }
    case "ADS_DERIVED_ARCHITECTURE": {
      if (section.layers.length === 0) {
        return <p>No components were derived under this decision.</p>;
      }
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          {section.layers.map((grp) => (
            <li key={grp.layer}>
              <span className="font-semibold">{grp.layer} layer:</span>{" "}
              {grp.components.map((c) => c.name).join(", ")}
            </li>
          ))}
        </ul>
      );
    }
    case "ADS_RISK_ACKNOWLEDGEMENT": {
      if (section.risks.length === 0) {
        return <p>No architectural risks were identified.</p>;
      }
      return (
        <div className="space-y-1.5">
          {section.risks.map((r, idx) => (
            <div
              key={idx}
              className={`px-2 py-1 border rounded ${RISK_COLORS[r.level] ?? ""}`}
            >
              <div className="font-semibold">
                {r.category} · {r.level}
              </div>
              <div className="opacity-90">{r.reason}</div>
            </div>
          ))}
        </div>
      );
    }
    case "ADS_TRADEOFF_SUMMARY": {
      const b = section.baseline;
      return (
        <p>
          Approved under baseline posture: architecture style{" "}
          <span className="font-semibold">{b.architectureStyle}</span>,
          deployment model{" "}
          <span className="font-semibold">{b.deploymentModel}</span>, scope
          level <span className="font-semibold">{b.scopeLevel}</span>.
        </p>
      );
    }
    case "ADS_DECISION_RECORD": {
      return (
        <ul className="list-disc pl-5 space-y-0.5">
          <li>Project Name: {section.projectName}</li>
          <li>Approving Authority: {section.approvingAuthority}</li>
          <li>Decision Date: {section.date}</li>
          <li>ADS ID: {section.adsId}</li>
          <li>Version: {section.version}</li>
        </ul>
      );
    }
  }
}

function ECPPreviewSection({ section }: { section: ECPResolvedSection }) {
  return (
    <div className="space-y-2" data-testid={`preview-ecp-${section.sectionId}`}>
      <SectionTitle order={section.sectionOrder} title={section.title} />
      <div className="text-xs leading-relaxed space-y-1">
        {section.paragraphs.map((p, idx) => (
          <p key={idx}>{p}</p>
        ))}
        {section.bullets && section.bullets.length > 0 && (
          <ul className="list-disc pl-5 space-y-0.5">
            {section.bullets.map((b, idx) => (
              <li key={idx}>{b}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

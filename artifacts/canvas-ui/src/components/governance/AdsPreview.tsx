import type { ADS, ADSSection } from "@/governance/types";

const RISK_COLORS: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

export function AdsPreview({ ads }: { ads: ADS }) {
  return (
    <div className="space-y-5" data-testid="preview-ads-body">
      <PreviewHeader title="Architecture Decision Snapshot" project={ads.projectName} />
      {ads.sections.map((section) => (
        <ADSPreviewSection key={section.sectionId} section={section} />
      ))}
      <PreviewFooter />
    </div>
  );
}

export function PreviewHeader({ title, project }: { title: string; project: string }) {
  return (
    <div className="border-b border-border pb-3">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="text-base font-bold">{project}</div>
    </div>
  );
}

export function PreviewFooter() {
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

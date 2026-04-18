import type { ECP, ECPResolvedSection } from "@/governance/types";
import { PreviewHeader, PreviewFooter } from "./AdsPreview";

export function EcpPreview({ ecp }: { ecp: ECP }) {
  return (
    <div className="space-y-5" data-testid="preview-ecp-body">
      <PreviewHeader
        title="Execution Constraint Profile"
        project={ecp.projectName}
      />
      {ecp.sections.map((section) => (
        <ECPPreviewSection key={section.sectionId} section={section} />
      ))}
      <PreviewFooter />
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

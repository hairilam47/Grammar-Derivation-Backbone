import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Footer,
  Header,
  PageNumber,
} from "docx";
import type { ADS, ECP } from "./types";
import { MANDATORY_NON_AUTHORITY_DISCLAIMER } from "./togafContainment";

const INTEGRITY_FOOTER =
  "This artefact was system-generated from an approved Architecture Decision Snapshot.";

interface BannerMeta {
  adsId: string;
  version: string;
  date: string;
  projectName: string;
  approvingAuthority: string;
}

interface FlatSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

// Phase 6 (PH6-HC2) — kept module-private. The export module's
// public surface is closed to exactly the four PDF/DOCX entrypoints,
// enforced by `assertNoStructuredADCExport` at app-bundle load.
function sanitiseFilenameSegment(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "Untitled"
  );
}

function buildFilename(
  artefact: "ADS" | "ECP",
  projectName: string,
  version: string,
  date: string,
  ext: "pdf" | "docx",
): string {
  return `${artefact}_${sanitiseFilenameSegment(projectName)}_${version}_${date}.${ext}`;
}

function flattenADS(ads: ADS): FlatSection[] {
  return ads.sections.map((s) => {
    switch (s.sectionId) {
      case "ADS_DECISION_CONTEXT": {
        const c = s.context;
        return {
          title: s.title,
          paragraphs: [
            `Organisation type: ${c.organisationType}`,
            `Sensitivity level: ${c.sensitivityLevel}`,
            `System intent: ${c.systemIntent}`,
            `Expected lifespan: ${c.expectedLifespanYears} years`,
          ],
        };
      }
      case "ADS_CAPABILITY_SCOPE": {
        const lines: string[] = [];
        lines.push(
          `In-scope: ${s.inScope.length === 0 ? "none" : s.inScope.map((x) => x.name).join("; ")}.`,
        );
        lines.push(
          `Deferred: ${s.deferred.length === 0 ? "none" : s.deferred.map((x) => x.name).join("; ")}.`,
        );
        lines.push(
          `Out of scope: ${s.outOfScope.length === 0 ? "none" : s.outOfScope.map((x) => x.name).join("; ")}.`,
        );
        return { title: s.title, paragraphs: lines };
      }
      case "ADS_DERIVED_ARCHITECTURE": {
        const paragraphs: string[] = [];
        const bullets: string[] = [];
        if (s.layers.length === 0) {
          paragraphs.push("No components were derived under this decision.");
        } else {
          for (const grp of s.layers) {
            bullets.push(
              `${grp.layer} layer: ${grp.components.map((c) => c.name).join(", ")}`,
            );
          }
        }
        return { title: s.title, paragraphs, bullets };
      }
      case "ADS_RISK_ACKNOWLEDGEMENT": {
        if (s.risks.length === 0) {
          return {
            title: s.title,
            paragraphs: ["No architectural risks were identified."],
          };
        }
        return {
          title: s.title,
          paragraphs: [],
          bullets: s.risks.map(
            (r) => `${r.category} (${r.level}): ${r.reason}`,
          ),
        };
      }
      case "ADS_TRADEOFF_SUMMARY": {
        const b = s.baseline;
        return {
          title: s.title,
          paragraphs: [
            `Approved under baseline posture: architecture style ${b.architectureStyle}, deployment model ${b.deploymentModel}, scope level ${b.scopeLevel}.`,
          ],
        };
      }
      case "ADS_DECISION_RECORD": {
        return {
          title: s.title,
          paragraphs: [
            `Project Name: ${s.projectName}`,
            `Approving Authority: ${s.approvingAuthority}`,
            `Decision Date: ${s.date}`,
            `ADS ID: ${s.adsId}`,
            `Version: ${s.version}`,
          ],
        };
      }
    }
  });
}

function flattenECP(ecp: ECP): FlatSection[] {
  return ecp.sections.map((s) => ({
    title: s.title,
    paragraphs: s.paragraphs,
    bullets: s.bullets,
  }));
}

function exportPdf(
  documentTitle: string,
  meta: BannerMeta,
  sections: FlatSection[],
  filename: string,
): void {
  const doc = new jsPDF({ format: "a4", unit: "pt" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;
  const topAfterHeader = 70;
  const bottomLimit = pageHeight - 50;
  let y = topAfterHeader;

  function addHeader(): void {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    const headerLine = `${meta.adsId}  ·  v${meta.version}  ·  ${meta.date}  ·  ${meta.approvingAuthority}`;
    doc.text(headerLine, margin, 30);
    doc.setDrawColor(200);
    doc.line(margin, 40, pageWidth - margin, 40);
    doc.setTextColor(0);
  }

  function addFooter(): void {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(INTEGRITY_FOOTER, pageWidth / 2, pageHeight - 25, {
      align: "center",
    });
    doc.setTextColor(0);
  }

  function ensureSpace(needed: number): void {
    if (y + needed > bottomLimit) {
      addFooter();
      doc.addPage();
      addHeader();
      y = topAfterHeader;
    }
  }

  function writeWrapped(
    text: string,
    fontSize: number,
    style: "normal" | "bold" | "italic",
    indent = 0,
  ): void {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
    const lineHeight = fontSize * 1.35;
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
  }

  addHeader();

  writeWrapped(documentTitle, 18, "bold");
  y += 8;
  writeWrapped(`Project: ${meta.projectName}`, 11, "normal");
  y += 8;
  // Phase 6 (PH6-HC3) — verbatim mandatory non-authority disclaimer
  // appears once on the first page of every exported artefact, after
  // the title and project line. Italic + muted grey (matching the
  // integrity footer's `setTextColor(120)` register) so it carries
  // no emphasis affordance and reads as ambient, non-directive
  // documentation. Restore black text colour afterwards so subsequent
  // section content is unaffected.
  doc.setTextColor(120);
  writeWrapped(MANDATORY_NON_AUTHORITY_DISCLAIMER, 9, "italic");
  doc.setTextColor(0);
  y += 14;

  for (const section of sections) {
    ensureSpace(40);
    writeWrapped(section.title, 13, "bold");
    y += 4;
    for (const p of section.paragraphs) {
      writeWrapped(p, 10, "normal");
      y += 2;
    }
    if (section.bullets) {
      for (const b of section.bullets) {
        writeWrapped(`•  ${b}`, 10, "normal", 12);
        y += 1;
      }
    }
    y += 12;
  }

  addFooter();
  doc.save(filename);
}

async function exportDocx(
  documentTitle: string,
  meta: BannerMeta,
  sections: FlatSection[],
  filename: string,
): Promise<void> {
  const headerLine = `${meta.adsId}  ·  v${meta.version}  ·  ${meta.date}  ·  ${meta.approvingAuthority}`;

  const children: Paragraph[] = [];
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: documentTitle, bold: true, size: 36 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Project: ${meta.projectName}`, size: 22 })],
      spacing: { after: 120 },
    }),
    // Phase 6 (PH6-HC3) — verbatim mandatory non-authority disclaimer
    // as the paragraph immediately after the project line. Italic +
    // muted colour matches the integrity footer's visual register.
    new Paragraph({
      children: [
        new TextRun({
          text: MANDATORY_NON_AUTHORITY_DISCLAIMER,
          italics: true,
          size: 18,
          color: "808080",
        }),
      ],
      spacing: { after: 240 },
    }),
  );

  for (const section of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.title, bold: true })],
        spacing: { before: 240, after: 120 },
      }),
    );
    for (const p of section.paragraphs) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: p, size: 22 })],
          spacing: { after: 120 },
        }),
      );
    }
    if (section.bullets) {
      for (const b of section.bullets) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: b, size: 22 })],
          }),
        );
      }
    }
  }

  const doc = new Document({
    creator: "Architecture Decision Canvas",
    title: documentTitle,
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 in twips
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({ text: headerLine, size: 16, color: "808080" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: INTEGRITY_FOOTER,
                    italics: true,
                    size: 16,
                    color: "808080",
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 14, color: "808080" }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    size: 14,
                    color: "808080",
                  }),
                  new TextRun({ text: " of ", size: 14, color: "808080" }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    size: 14,
                    color: "808080",
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportADSPdf(ads: ADS): void {
  exportPdf(
    "Architecture Decision Snapshot",
    ads,
    flattenADS(ads),
    buildFilename("ADS", ads.projectName, ads.version, ads.date, "pdf"),
  );
}

export function exportECPPdf(ecp: ECP): void {
  exportPdf(
    "Execution Constraint Profile",
    ecp,
    flattenECP(ecp),
    buildFilename("ECP", ecp.projectName, ecp.version, ecp.date, "pdf"),
  );
}

export async function exportADSDocx(ads: ADS): Promise<void> {
  await exportDocx(
    "Architecture Decision Snapshot",
    ads,
    flattenADS(ads),
    buildFilename("ADS", ads.projectName, ads.version, ads.date, "docx"),
  );
}

export async function exportECPDocx(ecp: ECP): Promise<void> {
  await exportDocx(
    "Execution Constraint Profile",
    ecp,
    flattenECP(ecp),
    buildFilename("ECP", ecp.projectName, ecp.version, ecp.date, "docx"),
  );
}

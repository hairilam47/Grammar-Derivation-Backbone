// IEEE-830 SRS export engine.
//
// Phase 1B (Task #144). Reads the live ADC data slices, walks the
// `srsTemplateConfig` declaration order, calls each generator from
// `srsGenerators`, and renders the resulting block stream as PDF
// (jspdf) or DOCX (docx). The configuration is the only source of
// truth for section ordering, titles, and field choice — this file
// never hard-codes a heading or a generator key.
//
// Architectural constraints:
//   - Read-only against `moduleCatalogStore`, `requirementsStore`,
//     `requirementsContractStore`, the CTAD store, and the ACW
//     store. Never writes back.
//   - The DRAFT watermark is decided entirely from data
//     (`isDraftDataset(ctx)`); there is no UI flag that can bypass
//     it.
//   - Hierarchical numbering is recomputed from the config
//     (sections produce "1", "2", "3"; subsections "1.1", "1.2",
//     ...). A future deeper config would require extending the
//     numbering walker accordingly.

import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

import {
  DEFAULT_SRS_TEMPLATE,
  type SrsTemplateConfig,
  type SrsTitlePageFieldKey,
} from "./srsTemplateConfig";
import {
  SRS_GENERATORS,
  isDraftDataset,
  type SrsBlock,
  type SrsContext,
} from "./srsGenerators";

import { listModules } from "./moduleCatalogStore";
import { listRequirements } from "./requirementsStore";
import { listContracts } from "./requirementsContractStore";
import { listArchitectures } from "../ctad/ctadStore";
import { getWorkspace } from "../acw/acwStore";

const INTEGRITY_FOOTER =
  "This artefact was system-generated from the live Architecture Decision Canvas data set.";

export type SrsExportFormat = "pdf" | "docx";

export interface ExportSrsOptions {
  readonly workItemId: string;
  readonly workItemTitle?: string;
  readonly template?: SrsTemplateConfig;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function exportSRS(
  format: SrsExportFormat,
  options: ExportSrsOptions,
): Promise<void> {
  if (!options || typeof options.workItemId !== "string" || options.workItemId.length === 0) {
    throw new Error("exportSRS: options.workItemId is required.");
  }
  const cfg = options.template ?? DEFAULT_SRS_TEMPLATE;
  const ctx = buildContext(options.workItemId, options.workItemTitle);
  const isDraft = isDraftDataset(ctx);
  const filename = buildFilename(ctx, cfg, format, isDraft);
  const titlePage = buildTitlePage(ctx, cfg, isDraft);
  if (format === "pdf") {
    renderPdf(cfg, ctx, titlePage, isDraft, filename);
  } else {
    await renderDocx(cfg, ctx, titlePage, isDraft, filename);
  }
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

function buildContext(workItemId: string, workItemTitleOpt?: string): SrsContext {
  // The active Work-Item title is supplied by the caller (which has
  // direct access to the Work-Item registry through the React scope
  // context). When omitted we synthesise a stable placeholder title
  // so the exporter never produces an empty `projectName`.
  const workItemTitle =
    workItemTitleOpt && workItemTitleOpt.length > 0
      ? workItemTitleOpt
      : `Work Item ${workItemId}`;
  const modules = listModules();
  const requirements = listRequirements(workItemId);
  const contracts = listContracts(workItemId);
  const contract =
    contracts.length === 0 ? null : contracts[contracts.length - 1];
  // The ACW and CTAD store accessors are trusted local APIs in the
  // canvas-ui artifact and are expected to return well-typed values
  // (the ACW store returns `getWorkspace()` from a frozen in-memory
  // snapshot, the CTAD store returns an array). We let any read
  // failure bubble up so it's caught by the SrsExportButton's error
  // surface rather than silently rendering an empty document.
  const acwWorkspace = getWorkspace();
  const ctadArchitectures = listArchitectures();
  return {
    workItem: { workItemId, title: workItemTitle },
    modules,
    requirements,
    contract,
    allContracts: contracts,
    ctadArchitectures,
    acwWorkspace,
  };
}

interface RevisionEntry {
  readonly version: string;
  readonly date: string;
  readonly frozenBy: string;
  readonly requirementCount: number;
}

interface TitlePageData {
  readonly projectName: string;
  readonly standardValue: string;
  readonly templateVersionValue: string;
  readonly templateLastUpdatedValue: string;
  readonly statusValue: string;
  readonly documentDate: string;
  readonly approvingAuthority: string;
  readonly contractLine: string;
  readonly revisionLine: string;
  readonly revisionHistory: readonly RevisionEntry[];
}

// Field-key → value resolver. Renderers walk cfg.titlePage.fields
// in declaration order and call this to resolve each entry's value.
// Adding a new key requires extending both SrsTitlePageFieldKey
// (in the config module) and this resolver; TypeScript will flag
// the missing case via the exhaustive switch.
function resolveTitleFieldValue(
  key: SrsTitlePageFieldKey,
  title: TitlePageData,
): string {
  switch (key) {
    case "project":
      return title.projectName;
    case "standard":
      return title.standardValue;
    case "templateVersion":
      return title.templateVersionValue;
    case "templateLastUpdated":
      return title.templateLastUpdatedValue;
    case "documentDate":
      return title.documentDate;
    case "approvingAuthority":
      return title.approvingAuthority;
    case "status":
      return title.statusValue;
  }
}

// Tiny placeholder interpolator. Replaces every `{name}` token in
// `template` with the matching value from `vars`. Unknown tokens
// are left as-is (rendered literally) rather than throwing, so a
// template author who introduces an unsupported token sees the bad
// token in the output instead of crashing the export.
function interpolate(
  template: string,
  vars: Readonly<Record<string, string>>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match,
  );
}

function buildTitlePage(
  ctx: SrsContext,
  cfg: SrsTemplateConfig,
  isDraft: boolean,
): TitlePageData {
  const tp = cfg.titlePage;
  const statusValue = isDraft ? tp.statusLabels.draft : tp.statusLabels.frozen;
  const contractLine = ctx.contract
    ? interpolate(tp.contractLine.withContract, {
        contractId: ctx.contract.contractId,
        frozenAt: ctx.contract.frozenAt,
        frozenBy: ctx.contract.frozenBy,
      })
    : tp.contractLine.withoutContract;
  const revisionLine = ctx.contract
    ? interpolate(tp.revisionLine.withContract, {
        total: String(ctx.contract.summary.total),
      })
    : interpolate(tp.revisionLine.withoutContract, {
        captured: String(ctx.requirements.length),
      });
  // Approving authority is the freezer of the most recent contract;
  // when no contract exists the pending label from the title-page
  // config is rendered.
  const approvingAuthority = ctx.contract
    ? ctx.contract.frozenBy
    : tp.pendingFreezeLabel;
  // Document date is the timestamp of the most recent freeze when one
  // exists; otherwise the current ISO date so the rendered document
  // always carries a date field.
  const documentDate = ctx.contract
    ? ctx.contract.frozenAt
    : new Date().toISOString();
  // Revision history walks every contract version in chronological
  // order. Versions are derived as v1, v2, ... by index in the
  // ascending list returned by listContracts; this gives a stable,
  // reproducible numbering tied to freeze order rather than to wall
  // clock. Empty history renders as a single placeholder row at
  // render time (this stage just carries the data).
  const revisionHistory: RevisionEntry[] = ctx.allContracts.map((c, i) => ({
    version: `v${i + 1}`,
    date: c.frozenAt,
    frozenBy: c.frozenBy,
    requirementCount: c.summary.total,
  }));
  return {
    projectName: ctx.workItem.title,
    standardValue: cfg.metadata.standard,
    templateVersionValue: cfg.metadata.version,
    templateLastUpdatedValue: cfg.metadata.lastUpdated,
    statusValue,
    documentDate,
    approvingAuthority,
    contractLine,
    revisionLine,
    revisionHistory,
  };
}

// ---------------------------------------------------------------------------
// Filename helper
// ---------------------------------------------------------------------------

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
  ctx: SrsContext,
  cfg: SrsTemplateConfig,
  format: SrsExportFormat,
  isDraft: boolean,
): string {
  const project = sanitiseFilenameSegment(ctx.workItem.title);
  const status = isDraft
    ? cfg.titlePage.statusLabels.draft
    : cfg.titlePage.statusLabels.frozen;
  return `SRS_${project}_${sanitiseFilenameSegment(status)}.${format}`;
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

function renderPdf(
  cfg: SrsTemplateConfig,
  ctx: SrsContext,
  title: TitlePageData,
  isDraft: boolean,
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
    const headerLine = `${title.standardValue}  ·  v${title.templateVersionValue}  ·  ${title.templateLastUpdatedValue}  ·  ${title.statusValue}`;
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

  function addWatermark(): void {
    if (!isDraft) return;
    doc.saveGraphicsState();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(120);
    doc.setTextColor(220, 220, 220);
    doc.text("DRAFT", pageWidth / 2, pageHeight / 2, {
      align: "center",
      angle: 30,
    });
    doc.restoreGraphicsState();
    doc.setTextColor(0);
  }

  function finishPage(): void {
    addWatermark();
    addFooter();
  }

  function ensureSpace(needed: number): void {
    if (y + needed > bottomLimit) {
      finishPage();
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

  function drawTable(headers: readonly string[], rows: readonly (readonly string[])[]): void {
    if (headers.length === 0) return;
    const colCount = headers.length;
    const colWidth = contentWidth / colCount;
    const cellPadding = 4;
    const fontSize = 9;
    doc.setFontSize(fontSize);

    function rowHeight(cells: readonly string[], style: "normal" | "bold"): number {
      doc.setFont("helvetica", style);
      let maxLines = 1;
      for (const c of cells) {
        const lines = doc.splitTextToSize(
          c || "",
          colWidth - 2 * cellPadding,
        ) as string[];
        if (lines.length > maxLines) maxLines = lines.length;
      }
      return maxLines * fontSize * 1.2 + 2 * cellPadding;
    }

    function drawRow(
      cells: readonly string[],
      style: "normal" | "bold",
      fillHeader: boolean,
    ): void {
      const h = rowHeight(cells, style);
      ensureSpace(h);
      doc.setFont("helvetica", style);
      doc.setDrawColor(180);
      if (fillHeader) {
        doc.setFillColor(235, 235, 235);
        doc.rect(margin, y, contentWidth, h, "F");
      }
      let x = margin;
      for (let i = 0; i < colCount; i += 1) {
        doc.rect(x, y, colWidth, h);
        const lines = doc.splitTextToSize(
          cells[i] || "",
          colWidth - 2 * cellPadding,
        ) as string[];
        let textY = y + cellPadding + fontSize;
        for (const line of lines) {
          doc.text(line, x + cellPadding, textY);
          textY += fontSize * 1.2;
        }
        x += colWidth;
      }
      y += h;
    }

    drawRow(headers, "bold", true);
    for (const r of rows) drawRow(r, "normal", false);
  }

  // --- Title page ---
  // The title-page layout — document title plus the ordered field
  // list — is read entirely from cfg.titlePage. A template author
  // who reorders, renames, or omits a field in srsTemplateConfig
  // changes the rendered title page without touching this file.
  const tp = cfg.titlePage;
  addHeader();
  writeWrapped(tp.documentTitle, 22, "bold");
  y += 6;
  tp.fields.forEach((field, idx) => {
    const value = resolveTitleFieldValue(field.key, title);
    const style: "normal" | "bold" =
      field.emphasis === "bold" ? "bold" : "normal";
    // First field gets a slightly larger size (project name).
    const fontSize = idx === 0 ? 12 : 11;
    writeWrapped(`${field.label}: ${value}`, fontSize, style);
  });
  writeWrapped(title.contractLine, 10, "italic");
  writeWrapped(title.revisionLine, 10, "italic");
  y += 10;
  writeWrapped(tp.revisionHistory.heading, 12, "bold");
  y += 4;
  {
    const histRows: string[][] =
      title.revisionHistory.length === 0
        ? [["[No data]", "[No data]", "[No data]", "[No data]"]]
        : title.revisionHistory.map((r) => [
            r.version,
            r.date,
            r.frozenBy,
            String(r.requirementCount),
          ]);
    drawTable(tp.revisionHistory.columns, histRows);
  }
  y += 14;

  // --- Body ---
  cfg.sections.forEach((section, sectionIdx) => {
    const sectionNumber = sectionIdx + 1;
    ensureSpace(40);
    writeWrapped(`${sectionNumber}. ${section.title}`, 16, "bold");
    y += 6;
    section.subsections.forEach((sub, subIdx) => {
      const subNumber = `${sectionNumber}.${subIdx + 1}`;
      ensureSpace(28);
      writeWrapped(`${subNumber} ${sub.title}`, 12, "bold");
      y += 4;
      const gen = SRS_GENERATORS[sub.contentGenerator];
      const blocks: SrsBlock[] = gen
        ? gen(ctx)
        : [{ kind: "paragraph", text: `[Missing generator: ${sub.contentGenerator}]` }];
      for (const block of blocks) {
        renderPdfBlock(block);
        y += 4;
      }
      y += 6;
    });
  });

  finishPage();
  doc.save(filename);

  function renderPdfBlock(block: SrsBlock): void {
    switch (block.kind) {
      case "paragraph":
        writeWrapped(block.text, 10, "normal");
        return;
      case "bullets":
        for (const item of block.items) {
          writeWrapped(`•  ${item}`, 10, "normal", 12);
        }
        return;
      case "table":
        drawTable(block.headers, block.rows);
        return;
    }
  }
}

// ---------------------------------------------------------------------------
// DOCX renderer
// ---------------------------------------------------------------------------

function buildRevisionHistoryTable(
  history: readonly RevisionEntry[],
  columns: readonly [string, string, string, string],
): Table {
  const headerCells = columns.map(
    (h) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, size: 20 })],
          }),
        ],
      }),
  );
  const dataRows: TableRow[] =
    history.length === 0
      ? [
          new TableRow({
            children: ["[No data]", "[No data]", "[No data]", "[No data]"].map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell, size: 20 })],
                    }),
                  ],
                }),
            ),
          }),
        ]
      : history.map(
          (r) =>
            new TableRow({
              children: [
                r.version,
                r.date,
                r.frozenBy,
                String(r.requirementCount),
              ].map(
                (cell) =>
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [new TextRun({ text: cell, size: 20 })],
                      }),
                    ],
                  }),
              ),
            }),
        );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells }), ...dataRows],
  });
}

async function renderDocx(
  cfg: SrsTemplateConfig,
  ctx: SrsContext,
  title: TitlePageData,
  isDraft: boolean,
  filename: string,
): Promise<void> {
  const tp = cfg.titlePage;
  const headerLine = `${title.standardValue}  ·  v${title.templateVersionValue}  ·  ${title.templateLastUpdatedValue}  ·  ${title.statusValue}`;
  // DRAFT banner text. Renders only when the dataset is draft;
  // frozen documents carry no banner, only the neutral metadata
  // header line above. This matches the watermark policy on the PDF
  // side (no DRAFT overlay when frozen).
  const draftHeaderText = `${tp.statusLabels.draft} — Not Frozen`;

  const children: (Paragraph | Table)[] = [];
  // Title page — the document title and the ordered field list are
  // read entirely from cfg.titlePage. A template author who
  // reorders, renames, or omits a field in srsTemplateConfig
  // changes the rendered title page without touching this file.
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: tp.documentTitle, bold: true, size: 44 })],
    }),
  );
  tp.fields.forEach((field, idx) => {
    const value = resolveTitleFieldValue(field.key, title);
    const isBold = field.emphasis === "bold";
    // First field gets larger size (24, project name); status row
    // (when bold) gets a small after-spacing to separate it from the
    // contract/revision lines below.
    const size = idx === 0 ? 24 : 22;
    const spacing =
      idx === 0
        ? { after: 120 }
        : isBold
          ? { after: 120 }
          : undefined;
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${field.label}: ${value}`,
            bold: isBold,
            size,
          }),
        ],
        ...(spacing ? { spacing } : {}),
      }),
    );
  });
  children.push(
    new Paragraph({
      children: [new TextRun({ text: title.contractLine, italics: true, size: 20 })],
    }),
    new Paragraph({
      children: [new TextRun({ text: title.revisionLine, italics: true, size: 20 })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun({ text: tp.revisionHistory.heading, bold: true, size: 24 })],
      spacing: { before: 120, after: 80 },
    }),
    buildRevisionHistoryTable(title.revisionHistory, tp.revisionHistory.columns),
    new Paragraph({
      children: [new TextRun({ text: "", size: 20 })],
      spacing: { after: 240 },
    }),
  );

  cfg.sections.forEach((section, sectionIdx) => {
    const sectionNumber = sectionIdx + 1;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: `${sectionNumber}. ${section.title}`,
            bold: true,
          }),
        ],
        spacing: { before: 240, after: 120 },
      }),
    );
    section.subsections.forEach((sub, subIdx) => {
      const subNumber = `${sectionNumber}.${subIdx + 1}`;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({ text: `${subNumber} ${sub.title}`, bold: true }),
          ],
          spacing: { before: 180, after: 80 },
        }),
      );
      const gen = SRS_GENERATORS[sub.contentGenerator];
      const blocks: SrsBlock[] = gen
        ? gen(ctx)
        : [{ kind: "paragraph", text: `[Missing generator: ${sub.contentGenerator}]` }];
      for (const block of blocks) {
        const rendered = renderDocxBlock(block);
        for (const node of rendered) children.push(node);
      }
    });
  });

  const doc = new Document({
    creator: "Architecture Decision Canvas",
    title: tp.documentTitle,
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 } },
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
              ...(isDraft
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: draftHeaderText,
                          bold: true,
                          size: 18,
                          color: "B00020",
                        }),
                      ],
                    }),
                  ]
                : []),
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
              ...(isDraft
                ? [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          text: draftHeaderText,
                          bold: true,
                          size: 16,
                          color: "B00020",
                        }),
                      ],
                    }),
                  ]
                : []),
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

function renderDocxBlock(block: SrsBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "paragraph":
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, size: 22 })],
          spacing: { after: 120 },
        }),
      ];
    case "bullets":
      return block.items.map(
        (item) =>
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: item, size: 22 })],
          }),
      );
    case "table": {
      const cellBorders = {
        top: { style: BorderStyle.SINGLE, size: 4, color: "B0B0B0" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "B0B0B0" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "B0B0B0" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "B0B0B0" },
      };
      const headerRow = new TableRow({
        tableHeader: true,
        children: block.headers.map(
          (h) =>
            new TableCell({
              borders: cellBorders,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, size: 20 })],
                }),
              ],
            }),
        ),
      });
      const bodyRows = block.rows.map(
        (r) =>
          new TableRow({
            children: r.map(
              (c) =>
                new TableCell({
                  borders: cellBorders,
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: c, size: 20 })],
                    }),
                  ],
                }),
            ),
          }),
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
        new Paragraph({ children: [new TextRun({ text: "" })] }),
      ];
    }
  }
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

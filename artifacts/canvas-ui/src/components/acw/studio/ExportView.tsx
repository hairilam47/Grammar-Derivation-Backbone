// EAStudio Phase 3 — Export view.
//
// Two side-by-side panels:
//   1. JSON preview of the canonical workspace document
//      (`getWorkspace()`) plus a Download button that writes
//      `acw-workspace.json`.
//   2. CSV preview of the node list (id, type, label, parentId,
//      domainTag, status, maturity, priority, owner) plus a
//      Download button that writes `acw-nodes.csv`.
//
// Both downloads are pure client-side: a Blob is created with the
// correct MIME type, an object URL is generated via
// `URL.createObjectURL`, a hidden anchor is clicked to trigger
// the download, and the URL is revoked on the next tick. Neither
// preview nor download mutates the workspace; the view is read-
// only.
//
// Filename discipline: stable string filenames (no timestamps).
// The brief explicitly calls this out so the export is
// diff-friendly across runs and across users.
//
// Constitutional discipline:
//   - Lucide icons only.
//   - Every static label asserted against ACW_PLACEHOLDER_FORBIDDEN
//     at module load.
//   - Empty-string optional fields are emitted as the literal empty
//     string in CSV (no synthesised "n/a" / "—" placeholder text);
//     `parentId === null` is also emitted as empty so the file
//     stays straight csv-rfc-4180.
//   - CSV escaping covers commas, double-quotes, CR and LF; the
//     escaper is the only place strings touch the wire.
import { useMemo } from "react";
import { Download, FileJson, Sheet } from "lucide-react";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";
import { useAcwWorkspace } from "@/acw/acwGrammarHooks";
import { type AcwNode, type AcwWorkspace } from "@/acw/acwStore";

const PAGE_TITLE = "Export workspace";
const PAGE_HINT =
  "Download the workspace document as JSON or the node list as CSV. Both files are generated in the browser and reflect the current workspace state.";
const JSON_PANEL_TITLE = "Workspace JSON";
const CSV_PANEL_TITLE = "Nodes CSV";
const DOWNLOAD_JSON_LABEL = "Download JSON";
const DOWNLOAD_CSV_LABEL = "Download CSV";
const JSON_FILENAME = "acw-workspace.json";
const CSV_FILENAME = "acw-nodes.csv";

assertAllAcwPlaceholderLanguage([
  PAGE_TITLE,
  PAGE_HINT,
  JSON_PANEL_TITLE,
  CSV_PANEL_TITLE,
  DOWNLOAD_JSON_LABEL,
  DOWNLOAD_CSV_LABEL,
]);

// Column order is the order documented in the task brief. Keeping
// it in a single tuple guarantees the header row, the body row
// builder, and any future read-back use the same canonical layout.
const CSV_COLUMNS = [
  "id",
  "type",
  "label",
  "parentId",
  "domainTag",
  "status",
  "maturity",
  "priority",
  "owner",
] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];

// CSV-escape a single field per RFC 4180: wrap in double-quotes
// and double any embedded double-quote whenever the field contains
// a comma, a double-quote, a CR, or an LF. Otherwise emit the
// raw string. `null`/`undefined` collapse to "" so the column
// remains positional.
function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const needsQuotes = /[",\r\n]/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function rowFor(node: AcwNode): readonly string[] {
  const dict: Readonly<Record<CsvColumn, string | null | undefined>> = {
    id: node.id,
    type: node.type,
    label: node.label,
    parentId: node.parentId,
    domainTag: node.domainTag,
    status: node.status,
    maturity: node.maturity,
    priority: node.priority,
    owner: node.owner,
  };
  return CSV_COLUMNS.map((c) => escapeCsvField(dict[c]));
}

export function buildNodesCsv(ws: AcwWorkspace): string {
  // Header row uses the literal column tokens (data field names —
  // not vocabulary labels — so the static-text guard is intentionally
  // not invoked on them; the file is a data export, not a UI surface).
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.map((c) => escapeCsvField(c)).join(","));
  for (const n of ws.structureGraph.nodes) {
    lines.push(rowFor(n).join(","));
  }
  // RFC 4180 calls for CRLF line endings.
  return lines.join("\r\n") + "\r\n";
}

function downloadBlob(filename: string, mime: string, content: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Append → click → remove keeps the anchor out of the DOM after
  // the browser has registered the click intent.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the browser has a chance to finish
  // initiating the download before the URL is invalidated.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export interface ExportViewProps {
  readonly lensId: string;
}

export function ExportView(_props: ExportViewProps) {
  void _props;
  const ws = useAcwWorkspace();

  const jsonText = useMemo(() => JSON.stringify(ws, null, 2), [ws]);
  const csvText = useMemo(() => buildNodesCsv(ws), [ws]);

  return (
    <section
      data-testid="acw-studio-export-view"
      className="flex flex-1 flex-col min-h-[480px] gap-3 px-3 py-3"
    >
      <header className="flex flex-col gap-0.5">
        <h3
          className="text-xs uppercase tracking-widest text-muted-foreground"
          data-testid="acw-studio-export-title"
        >
          {PAGE_TITLE}
        </h3>
        <p
          className="text-[11px] text-muted-foreground"
          data-testid="acw-studio-export-hint"
        >
          {PAGE_HINT}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
        <div
          className="flex flex-col border border-border/40 rounded bg-card/30 min-h-0"
          data-testid="acw-studio-export-json-panel"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30">
            <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <FileJson className="w-3.5 h-3.5" />
              <span>{JSON_PANEL_TITLE}</span>
            </h4>
            <button
              type="button"
              onClick={() =>
                downloadBlob(JSON_FILENAME, "application/json", jsonText)
              }
              data-testid="acw-studio-export-json-download"
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>{DOWNLOAD_JSON_LABEL}</span>
            </button>
          </div>
          <pre
            className="flex-1 overflow-auto px-3 py-2 text-[10px] leading-snug font-mono text-foreground/90 whitespace-pre min-h-0"
            data-testid="acw-studio-export-json-preview"
          >
            {jsonText}
          </pre>
        </div>

        <div
          className="flex flex-col border border-border/40 rounded bg-card/30 min-h-0"
          data-testid="acw-studio-export-csv-panel"
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/30">
            <h4 className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Sheet className="w-3.5 h-3.5" />
              <span>{CSV_PANEL_TITLE}</span>
            </h4>
            <button
              type="button"
              onClick={() => downloadBlob(CSV_FILENAME, "text/csv", csvText)}
              data-testid="acw-studio-export-csv-download"
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>{DOWNLOAD_CSV_LABEL}</span>
            </button>
          </div>
          <pre
            className="flex-1 overflow-auto px-3 py-2 text-[10px] leading-snug font-mono text-foreground/90 whitespace-pre min-h-0"
            data-testid="acw-studio-export-csv-preview"
          >
            {csvText}
          </pre>
        </div>
      </div>
    </section>
  );
}

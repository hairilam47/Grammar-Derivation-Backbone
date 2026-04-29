// Shared "Generate SRS" control.
//
// Phase 1B (Task #144). Renders a format selector + a Generate
// button that calls `exportSRS(format)` from the IEEE-830 export
// engine. Used from the Requirements Capture screen (draft preview)
// and from the Freeze screen (sits next to the existing ADS / ECP
// download controls). Each button label, dropdown option, status
// hint, and error message rendered here is asserted against
// `assertAllGovernanceLanguage` at module load.

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assertAllGovernanceLanguage } from "@/governance/staticTextGuard";
import {
  exportSRS,
  type SrsExportFormat,
} from "@/governance/ieeeSrsExporter";

const STATIC_LABELS = {
  buttonGenerate: "Generate SRS",
  buttonGenerating: "Generating...",
  formatLabel: "Format",
  optionPdf: "PDF",
  optionDocx: "DOCX",
  errorPrefix: "SRS export failed: ",
} as const;

assertAllGovernanceLanguage([
  STATIC_LABELS.buttonGenerate,
  STATIC_LABELS.buttonGenerating,
  STATIC_LABELS.formatLabel,
  STATIC_LABELS.optionPdf,
  STATIC_LABELS.optionDocx,
  STATIC_LABELS.errorPrefix,
]);

interface SrsExportButtonProps {
  readonly variant?: "default" | "secondary";
  readonly testIdSuffix?: string;
}

export function SrsExportButton({
  variant = "default",
  testIdSuffix = "",
}: SrsExportButtonProps) {
  const [format, setFormat] = useState<SrsExportFormat>("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await exportSRS(format);
    } catch (err) {
      setError(
        STATIC_LABELS.errorPrefix +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setBusy(false);
    }
  }

  const suffix = testIdSuffix ? `-${testIdSuffix}` : "";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`srs-format${suffix}`}
            className="text-[10px] uppercase tracking-widest text-muted-foreground"
          >
            {STATIC_LABELS.formatLabel}
          </label>
          <select
            id={`srs-format${suffix}`}
            data-testid={`select-srs-format${suffix}`}
            value={format}
            onChange={(e) => setFormat(e.target.value as SrsExportFormat)}
            className="h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="pdf">{STATIC_LABELS.optionPdf}</option>
            <option value="docx">{STATIC_LABELS.optionDocx}</option>
          </select>
        </div>
        <Button
          type="button"
          variant={variant}
          onClick={handleGenerate}
          disabled={busy}
          className="gap-2"
          data-testid={`button-generate-srs${suffix}`}
        >
          <Download className="w-4 h-4" />
          {busy ? STATIC_LABELS.buttonGenerating : STATIC_LABELS.buttonGenerate}
        </Button>
      </div>
      {error && (
        <p
          className="text-xs text-destructive"
          data-testid={`text-srs-export-error${suffix}`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

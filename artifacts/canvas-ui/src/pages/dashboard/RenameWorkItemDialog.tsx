// RenameWorkItemDialog — modal form for renaming an existing Work
// Item. Mirrors the styling and interaction model of
// `NewWorkItemDialog` (overlay, click-outside-to-close, single
// text field, Cancel / Save buttons). Idempotent at the store
// layer: a save with the unchanged trimmed title is a no-op.
//
// Task #146 (rename / archive / delete governance actions).
// Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import { renameWorkItem } from "@/governance/workItemStore";

const STATIC_LABELS = {
  heading: "Rename Work Item",
  titleLabel: "Title",
  titlePlaceholder: "Work Item title",
  cancel: "Cancel",
  submit: "Save",
  errorPrefix: "Could not rename Work Item: ",
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface RenameWorkItemDialogProps {
  readonly open: boolean;
  readonly workItemId: string;
  readonly currentTitle: string;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}

export function RenameWorkItemDialog({
  open,
  workItemId,
  currentTitle,
  onClose,
  onRenamed,
}: RenameWorkItemDialogProps) {
  const [title, setTitle] = useState(currentTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setTitle(currentTitle);
    setBusy(false);
    setError(null);
  }, [open, currentTitle]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (title.trim().length === 0) {
      setError(STATIC_LABELS.errorPrefix + "title is required.");
      return;
    }
    setBusy(true);
    try {
      renameWorkItem(workItemId, title);
      onRenamed();
    } catch (err) {
      setError(
        STATIC_LABELS.errorPrefix +
          (err instanceof Error ? err.message : String(err)),
      );
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      data-testid="rename-work-item-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${titleId}-heading`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-lg p-6 space-y-4"
        data-testid="rename-work-item-form"
      >
        <h2
          id={`${titleId}-heading`}
          className="text-lg font-semibold tracking-tight"
        >
          {STATIC_LABELS.heading}
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor={titleId}>{STATIC_LABELS.titleLabel}</Label>
          <Input
            id={titleId}
            data-testid="input-rename-work-item-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={STATIC_LABELS.titlePlaceholder}
            autoFocus
            required
          />
        </div>

        {error && (
          <p
            className="text-xs text-destructive"
            data-testid="text-rename-work-item-error"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
            data-testid="button-rename-work-item-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            data-testid="button-rename-work-item-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

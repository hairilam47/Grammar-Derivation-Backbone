// DeleteOrgDialog — destructive confirmation dialog for deleting
// an Organisation. The user must type the Organisation's exact
// name (case-sensitive, after a `.trim()`) to enable the Delete
// button. Clearing the org clears every `<orgId>:*` localStorage
// key and (when the active scope points at the deleted org) the
// persisted active-scope pointer.
//
// Task #146 (rename / archive / delete governance actions).
// Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import { deleteOrganisation } from "@/governance/orgStore";

const STATIC_LABELS = {
  heading: "Delete Organisation",
  warning:
    "Deleting an Organisation removes every Work Item, every saved canvas, and every other piece of data scoped to it. This cannot be undone.",
  promptPrefix: "Type the Organisation name to continue: ",
  inputLabel: "Organisation name",
  cancel: "Cancel",
  submit: "Delete Organisation",
  errorPrefix: "Could not delete Organisation: ",
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface DeleteOrgDialogProps {
  readonly open: boolean;
  readonly orgId: string;
  readonly orgName: string;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}

export function DeleteOrgDialog({
  open,
  orgId,
  orgName,
  onClose,
  onDeleted,
}: DeleteOrgDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!open) return;
    setTyped("");
    setBusy(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  const matches = typed.trim() === orgName;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !matches) return;
    setError(null);
    setBusy(true);
    try {
      deleteOrganisation(orgId);
      onDeleted();
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
      data-testid="delete-org-dialog"
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
        data-testid="delete-org-form"
      >
        <h2
          id={`${titleId}-heading`}
          className="text-lg font-semibold tracking-tight"
        >
          {STATIC_LABELS.heading}
        </h2>

        <p
          className="text-sm text-muted-foreground"
          data-testid="text-delete-org-warning"
        >
          {STATIC_LABELS.warning}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor={inputId}>
            {STATIC_LABELS.promptPrefix}
            <span className="font-mono text-foreground">{orgName}</span>
          </Label>
          <Input
            id={inputId}
            data-testid="input-delete-org-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={STATIC_LABELS.inputLabel}
            autoFocus
            autoComplete="off"
          />
        </div>

        {error && (
          <p
            className="text-xs text-destructive"
            data-testid="text-delete-org-error"
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
            data-testid="button-delete-org-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={busy || !matches}
            data-testid="button-delete-org-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

// RenameOrgDialog — modal form for renaming the active
// Organisation. Mirrors the styling and interaction model of
// `NewWorkItemDialog`. Slug is preserved across renames.
//
// Task #146 (rename / archive / delete governance actions).
// Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import { renameOrganisation } from "@/governance/orgStore";

const STATIC_LABELS = {
  heading: "Rename Organisation",
  nameLabel: "Name",
  namePlaceholder: "Organisation name",
  cancel: "Cancel",
  submit: "Save",
  errorPrefix: "Could not rename Organisation: ",
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface RenameOrgDialogProps {
  readonly open: boolean;
  readonly orgId: string;
  readonly currentName: string;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}

export function RenameOrgDialog({
  open,
  orgId,
  currentName,
  onClose,
  onRenamed,
}: RenameOrgDialogProps) {
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setName(currentName);
    setBusy(false);
    setError(null);
  }, [open, currentName]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (name.trim().length === 0) {
      setError(STATIC_LABELS.errorPrefix + "name is required.");
      return;
    }
    setBusy(true);
    try {
      renameOrganisation(orgId, name);
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
      data-testid="rename-org-dialog"
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
        data-testid="rename-org-form"
      >
        <h2
          id={`${titleId}-heading`}
          className="text-lg font-semibold tracking-tight"
        >
          {STATIC_LABELS.heading}
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor={titleId}>{STATIC_LABELS.nameLabel}</Label>
          <Input
            id={titleId}
            data-testid="input-rename-org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={STATIC_LABELS.namePlaceholder}
            autoFocus
            required
          />
        </div>

        {error && (
          <p
            className="text-xs text-destructive"
            data-testid="text-rename-org-error"
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
            data-testid="button-rename-org-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            data-testid="button-rename-org-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

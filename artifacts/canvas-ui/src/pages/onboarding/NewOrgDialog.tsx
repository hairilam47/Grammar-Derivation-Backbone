// NewOrgDialog — modal form for creating a new Organisation.
//
// Phase 2 (SaaS Onboarding). Renders a centred backdrop overlay with
// a small form (name, sector, nature-of-business). Submits through
// `createOrganisation` from the orgStore, which auto-seeds an
// EA Blueprint Work Item for the new org. On success calls
// `onCreated(orgId)` so the parent can switch the active scope and
// navigate. Every static label is asserted against
// `assertAllOnboardingLanguage` at module load.

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  createOrganisation,
  ORG_SECTORS,
  NATURE_OF_BUSINESS_OPTIONS,
  SECTOR_LABELS,
  NATURE_OF_BUSINESS_LABELS,
  type NatureOfBusiness,
  type OrgSector,
} from "@/governance/orgStore";

const STATIC_LABELS = {
  heading: "Create Organisation",
  nameLabel: "Name",
  namePlaceholder: "Organisation name",
  sectorLabel: "Sector",
  natureLabel: "Nature of business",
  cancel: "Cancel",
  submit: "Create",
  errorPrefix: "Could not create Organisation: ",
  ...SECTOR_LABELS,
  ...NATURE_OF_BUSINESS_LABELS,
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface NewOrgDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: (orgId: string) => void;
}

export function NewOrgDialog({ open, onClose, onCreated }: NewOrgDialogProps) {
  const [name, setName] = useState("");
  const [sector, setSector] = useState<OrgSector>(ORG_SECTORS[0]);
  const [nature, setNature] = useState<NatureOfBusiness>(
    NATURE_OF_BUSINESS_OPTIONS[0],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const sectorId = useId();
  const natureId = useId();

  // Reset on every open so a previous error / value does not leak
  // into the next session of the dialog.
  useEffect(() => {
    if (!open) return;
    setName("");
    setSector(ORG_SECTORS[0]);
    setNature(NATURE_OF_BUSINESS_OPTIONS[0]);
    setBusy(false);
    setError(null);
  }, [open]);

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
      const result = createOrganisation({
        name: name.trim(),
        sector,
        natureOfBusiness: nature,
      });
      onCreated(result.organisation.id);
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
      data-testid="new-org-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${nameId}-heading`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-lg p-6 space-y-4"
        data-testid="new-org-form"
      >
        <h2
          id={`${nameId}-heading`}
          className="text-lg font-semibold tracking-tight"
        >
          {STATIC_LABELS.heading}
        </h2>

        <div className="space-y-1.5">
          <Label htmlFor={nameId}>{STATIC_LABELS.nameLabel}</Label>
          <Input
            id={nameId}
            data-testid="input-org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={STATIC_LABELS.namePlaceholder}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={sectorId}>{STATIC_LABELS.sectorLabel}</Label>
          <select
            id={sectorId}
            data-testid="select-org-sector"
            value={sector}
            onChange={(e) => setSector(e.target.value as OrgSector)}
            className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
          >
            {ORG_SECTORS.map((s) => (
              <option key={s} value={s}>
                {SECTOR_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={natureId}>{STATIC_LABELS.natureLabel}</Label>
          <select
            id={natureId}
            data-testid="select-org-nature"
            value={nature}
            onChange={(e) => setNature(e.target.value as NatureOfBusiness)}
            className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
          >
            {NATURE_OF_BUSINESS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {NATURE_OF_BUSINESS_LABELS[n]}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p
            className="text-xs text-destructive"
            data-testid="text-new-org-error"
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
            data-testid="button-new-org-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            data-testid="button-new-org-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

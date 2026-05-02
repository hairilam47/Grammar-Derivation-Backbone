// OrganisationProfileDialog — modal editor for an Organisation's
// editable fields. Sibling of NewOrgDialog, backed by
// `updateOrganisation`.

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  ORG_SECTORS,
  NATURE_OF_BUSINESS_OPTIONS,
  SECTOR_LABELS,
  NATURE_OF_BUSINESS_LABELS,
  updateOrganisation,
  type NatureOfBusiness,
  type Organisation,
  type OrgSector,
} from "@/governance/orgStore";

const STATIC_LABELS = {
  heading: "Edit Organisation",
  nameLabel: "Name",
  namePlaceholder: "Organisation name",
  sectorLabel: "Sector",
  natureLabel: "Nature of business",
  cancel: "Cancel",
  submit: "Save",
  errorPrefix: "Could not update Organisation: ",
  ...SECTOR_LABELS,
  ...NATURE_OF_BUSINESS_LABELS,
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface OrganisationProfileDialogProps {
  readonly open: boolean;
  readonly organisation: Organisation;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function OrganisationProfileDialog({
  open,
  organisation,
  onClose,
  onSaved,
}: OrganisationProfileDialogProps) {
  const [name, setName] = useState(organisation.name);
  const [sector, setSector] = useState<OrgSector>(organisation.sector);
  const [nature, setNature] = useState<NatureOfBusiness>(
    organisation.natureOfBusiness,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameId = useId();
  const sectorId = useId();
  const natureId = useId();

  // Each open re-seeds the form from the current persisted shape so
  // an external edit (or a previous cancel) is never visible the
  // next time the user opens the dialog.
  useEffect(() => {
    if (!open) return;
    setName(organisation.name);
    setSector(organisation.sector);
    setNature(organisation.natureOfBusiness);
    setBusy(false);
    setError(null);
  }, [open, organisation]);

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
      updateOrganisation(organisation.id, {
        name: name.trim(),
        sector,
        natureOfBusiness: nature,
      });
      onSaved();
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
      data-testid="org-profile-dialog"
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
        data-testid="org-profile-form"
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
            data-testid="input-org-profile-name"
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
            data-testid="select-org-profile-sector"
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
            data-testid="select-org-profile-nature"
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
            data-testid="text-org-profile-error"
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
            data-testid="button-org-profile-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            data-testid="button-org-profile-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

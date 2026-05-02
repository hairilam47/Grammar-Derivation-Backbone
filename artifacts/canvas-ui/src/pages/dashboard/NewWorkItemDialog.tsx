// NewWorkItemDialog — modal form for creating a Work Item.
// "ea-blueprint" is excluded (auto-seeded, one-per-org); the
// triplet collapses to "Project" only when the active org has
// no EA Blueprint, mirroring the registry's refusal rule.

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  createWorkItem,
  getEaBlueprintForOrg,
  getStoreVersion as getWorkItemStoreVersion,
  subscribe as subscribeWorkItems,
  WORK_ITEM_TYPES,
  type WorkItemType,
} from "@/governance/workItemStore";

const ALL_SELECTABLE_TYPES: readonly Exclude<WorkItemType, "ea-blueprint">[] = [
  "project",
  "enhancement",
  "change-request",
];
const PROJECT_ONLY_SELECTABLE_TYPES: readonly Exclude<WorkItemType, "ea-blueprint">[] = [
  "project",
];
const _ALL_TYPES_GUARD: readonly WorkItemType[] = WORK_ITEM_TYPES;
void _ALL_TYPES_GUARD;

const TYPE_LABELS: Readonly<Record<Exclude<WorkItemType, "ea-blueprint">, string>> = {
  project: "Project",
  enhancement: "Enhancement",
  "change-request": "Change Request",
};

// Subtype is optional and only offered for `project` / `enhancement`.
// The empty-string sentinel maps back to `undefined` at submit.
const SUBTYPE_OPTIONS = [
  "New Application",
  "New Software / 3rd-party Software",
  "New Infrastructure Setup",
  "Other",
] as const;
type SubtypeOption = (typeof SUBTYPE_OPTIONS)[number];

const TYPES_WITH_SUBTYPE: ReadonlySet<Exclude<WorkItemType, "ea-blueprint">> =
  new Set<Exclude<WorkItemType, "ea-blueprint">>(["project", "enhancement"]);

const STATIC_LABELS = {
  heading: "Create Work Item",
  titleLabel: "Title",
  titlePlaceholder: "Work Item title",
  descriptionLabel: "Description",
  descriptionPlaceholder: "Optional",
  typeLabel: "Type",
  subtypeLabel: "Subtype",
  subtypePlaceholder: "—",
  cancel: "Cancel",
  submit: "Create",
  errorPrefix: "Could not create Work Item: ",
  ...TYPE_LABELS,
} as const;

assertAllOnboardingLanguage([
  ...Object.values(STATIC_LABELS),
  ...SUBTYPE_OPTIONS,
]);

interface NewWorkItemDialogProps {
  readonly open: boolean;
  readonly orgId: string;
  readonly onClose: () => void;
  readonly onCreated: (workItemId: string) => void;
}

export function NewWorkItemDialog({
  open,
  orgId,
  onClose,
  onCreated,
}: NewWorkItemDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<Exclude<WorkItemType, "ea-blueprint">>(
    "project",
  );
  const [subtype, setSubtype] = useState<SubtypeOption | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleId = useId();
  const descId = useId();
  const typeId = useId();
  const subtypeId = useId();

  // Track the work-item store so the type dropdown reacts to the
  // EA Blueprint being created (which unlocks Enhancement /
  // Change Request).
  const wiVersion = useSyncExternalStore(
    subscribeWorkItems,
    getWorkItemStoreVersion,
    getWorkItemStoreVersion,
  );
  const hasEaBlueprint = useMemo(
    () => getEaBlueprintForOrg(orgId) !== null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, wiVersion],
  );
  const selectableTypes = hasEaBlueprint
    ? ALL_SELECTABLE_TYPES
    : PROJECT_ONLY_SELECTABLE_TYPES;

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setType("project");
    setSubtype("");
    setBusy(false);
    setError(null);
  }, [open]);

  // Whenever the selected type loses subtype eligibility (the
  // user flips to "Change Request"), drop any subtype the user
  // had picked so the form cannot smuggle a stale value into the
  // submit payload.
  useEffect(() => {
    if (!TYPES_WITH_SUBTYPE.has(type) && subtype !== "") setSubtype("");
  }, [type, subtype]);

  // If the EA Blueprint disappears after the dialog mounts (e.g.
  // a switch into a freshly-created org from a different surface),
  // collapse the selected type back to "project" so the form
  // cannot submit a value that the registry will reject.
  useEffect(() => {
    if (!hasEaBlueprint && type !== "project") setType("project");
  }, [hasEaBlueprint, type]);

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
      const wi = createWorkItem({
        orgId,
        type,
        title: title.trim(),
        description: description.trim(),
        ...(TYPES_WITH_SUBTYPE.has(type) && subtype !== ""
          ? { subtype }
          : {}),
      });
      onCreated(wi.id);
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
      data-testid="new-work-item-dialog"
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
        data-testid="new-work-item-form"
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
            data-testid="input-work-item-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={STATIC_LABELS.titlePlaceholder}
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={typeId}>{STATIC_LABELS.typeLabel}</Label>
          <select
            id={typeId}
            data-testid="select-work-item-type"
            value={type}
            onChange={(e) =>
              setType(e.target.value as Exclude<WorkItemType, "ea-blueprint">)
            }
            className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
          >
            {selectableTypes.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {TYPES_WITH_SUBTYPE.has(type) && (
          <div className="space-y-1.5">
            <Label htmlFor={subtypeId}>{STATIC_LABELS.subtypeLabel}</Label>
            <select
              id={subtypeId}
              data-testid="select-work-item-subtype"
              value={subtype}
              onChange={(e) =>
                setSubtype(e.target.value as SubtypeOption | "")
              }
              className="h-9 w-full px-2 rounded-md border border-input bg-background text-sm"
            >
              <option value="">{STATIC_LABELS.subtypePlaceholder}</option>
              {SUBTYPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={descId}>{STATIC_LABELS.descriptionLabel}</Label>
          <Input
            id={descId}
            data-testid="input-work-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={STATIC_LABELS.descriptionPlaceholder}
          />
        </div>

        {error && (
          <p
            className="text-xs text-destructive"
            data-testid="text-new-work-item-error"
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
            data-testid="button-new-work-item-cancel"
          >
            {STATIC_LABELS.cancel}
          </Button>
          <Button
            type="submit"
            disabled={busy}
            data-testid="button-new-work-item-submit"
          >
            {STATIC_LABELS.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

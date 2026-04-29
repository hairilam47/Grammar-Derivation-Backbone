// Stage A (ADC Wizard Retrofit) — Requirements Capture screen.
//
// CRUD surface for the Requirements store. Each Requirement carries
// a stable id, a title, an optional description, a type tag
// (functional / non-functional / constraint / hardware), an Urgency
// label (Routine / Standard / Elevated / Acute — bound internally to
// the urgency enum 'low' | 'medium' | 'high' | 'critical'), an
// optional link to a Module, and an optional hardware-details block
// (mandatory when type === 'hardware'). The screen also exposes the
// approve action that gates a requirement for inclusion in a
// Requirements Contract.
//
// Every static label rendered here is asserted against the Urgency
// vocabulary tier at module load.

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type Requirement,
  type RequirementType,
  type RequirementUrgency,
  type HardwareDetails,
  saveRequirement,
  deleteRequirement,
  approveRequirement,
  listRequirements,
  subscribe as subscribeRequirements,
} from "@/governance/requirementsStore";
import {
  type Module,
  listModules,
  subscribe as subscribeModules,
} from "@/governance/moduleCatalogStore";
import { PLACEHOLDER_WORK_ITEM_ID } from "@/governance/workItemPlaceholder";
import { assertAllUrgencyLanguage } from "@/governance/staticTextGuard";
import { SrsExportButton } from "./SrsExportButton";

// Urgency label binding. The internal enum stays
// 'low' | 'medium' | 'high' | 'critical' and is the only value that
// touches the persisted document; the label is what the user sees.
const URGENCY_LABEL: Record<RequirementUrgency, string> = {
  low: "Routine",
  medium: "Standard",
  high: "Elevated",
  critical: "Acute",
};
const URGENCY_ORDER: readonly RequirementUrgency[] = [
  "low",
  "medium",
  "high",
  "critical",
];

const TYPE_LABEL: Record<RequirementType, string> = {
  functional: "Functional",
  "non-functional": "Non-functional",
  constraint: "Constraint",
  hardware: "Hardware",
};
const TYPE_ORDER: readonly RequirementType[] = [
  "functional",
  "non-functional",
  "constraint",
  "hardware",
];

const STATIC_LABELS = [
  "Requirements Capture",
  "Capture the requirements that define this work item.",
  "Add Requirement",
  "No requirements captured yet",
  "Requirements without a module link stay as drafts. Approved requirements become eligible for the Requirements Contract at the freeze step.",
  "Title",
  "Description (optional)",
  "Type",
  "Urgency",
  "Module",
  "(unassigned)",
  "Hardware Details",
  "Item Name",
  "Model",
  "Quantity",
  "Unit Cost Estimate",
  "Notes (optional)",
  "Save",
  "Cancel",
  "Edit",
  "Delete",
  "Approve",
  "Approved",
  "Draft",
  "Frozen",
  "Back to Modules",
  "Continue to Trade-Offs",
  "Routine",
  "Standard",
  "Elevated",
  "Acute",
  "Functional",
  "Non-functional",
  "Constraint",
  "Hardware",
  "requirement(s) captured",
  // Hint about why a requirement cannot be approved yet.
  "Link this requirement to a module to enable approval.",
];
assertAllUrgencyLanguage(STATIC_LABELS);

interface RequirementsCaptureProps {
  readonly onBack: () => void;
  readonly onNext: () => void;
}

interface DraftRequirement {
  readonly editingId: string | null;
  readonly title: string;
  readonly description: string;
  readonly type: RequirementType;
  readonly urgency: RequirementUrgency;
  readonly moduleId: string | null;
  readonly hardwareDetails: HardwareDetails;
}

const EMPTY_HARDWARE: HardwareDetails = {
  itemName: "",
  model: "",
  quantity: 1,
  unitCostEstimate: 0,
  notes: "",
};

function emptyDraft(): DraftRequirement {
  return {
    editingId: null,
    title: "",
    description: "",
    type: "functional",
    urgency: "medium",
    moduleId: null,
    hardwareDetails: { ...EMPTY_HARDWARE },
  };
}

export function RequirementsCapture({ onBack, onNext }: RequirementsCaptureProps) {
  const [requirements, setRequirements] = useState<readonly Requirement[]>(
    () => listRequirements(PLACEHOLDER_WORK_ITEM_ID),
  );
  const [modules, setModules] = useState<readonly Module[]>(() => listModules());
  const [draft, setDraft] = useState<DraftRequirement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubR = subscribeRequirements(() => {
      setRequirements(listRequirements(PLACEHOLDER_WORK_ITEM_ID));
    });
    const unsubM = subscribeModules(() => {
      setModules(listModules());
    });
    return () => {
      unsubR();
      unsubM();
    };
  }, []);

  const moduleNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const mod of modules) m[mod.id] = mod.name;
    return m;
  }, [modules]);

  const startCreate = () => {
    setError(null);
    setDraft(emptyDraft());
  };

  const startEdit = (r: Requirement) => {
    setError(null);
    setDraft({
      editingId: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      urgency: r.urgency,
      moduleId: r.moduleId,
      hardwareDetails: r.hardwareDetails ?? { ...EMPTY_HARDWARE },
    });
  };

  const cancelDraft = () => {
    setError(null);
    setDraft(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    setError(null);
    try {
      saveRequirement({
        id: draft.editingId ?? undefined,
        workItemId: PLACEHOLDER_WORK_ITEM_ID,
        title: draft.title,
        description: draft.description,
        type: draft.type,
        urgency: draft.urgency,
        moduleId: draft.moduleId,
        hardwareDetails: draft.type === "hardware" ? draft.hardwareDetails : null,
      });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (id: string) => {
    setError(null);
    try {
      deleteRequirement(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const approve = (id: string) => {
    setError(null);
    try {
      approveRequirement(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const canSaveDraft = draft !== null && draft.title.trim().length > 0;
  const canContinue = requirements.length > 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Step 3
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Requirements Capture
          </h1>
          <p className="text-muted-foreground text-sm">
            Capture the requirements that define this work item.
          </p>
        </div>
        <SrsExportButton variant="secondary" testIdSuffix="capture" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Requirements
            </CardTitle>
            <CardDescription>
              {requirements.length} requirement(s) captured
            </CardDescription>
          </div>
          {draft === null && (
            <Button
              size="sm"
              onClick={startCreate}
              className="gap-2"
              data-testid="button-add-requirement"
            >
              <Plus className="w-4 h-4" /> Add Requirement
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {requirements.length === 0 && draft === null && (
            <div
              className="text-sm text-muted-foreground border border-dashed border-border p-6 rounded text-center space-y-2"
              data-testid="requirements-empty"
            >
              <ListChecks className="w-8 h-8 mx-auto opacity-60" />
              <div className="font-semibold text-foreground">
                No requirements captured yet
              </div>
              <p className="text-xs">
                Requirements without a module link stay as drafts. Approved
                requirements become eligible for the Requirements Contract at
                the freeze step.
              </p>
            </div>
          )}

          <ul className="space-y-2" data-testid="requirement-list">
            {requirements.map((r) => {
              const isEditing = draft?.editingId === r.id;
              if (isEditing) return null;
              const isFrozen = r.status === "frozen";
              const isApproved = r.status === "approved";
              const moduleLabel =
                r.moduleId === null
                  ? "(unassigned)"
                  : moduleNameById[r.moduleId] ?? r.moduleId;
              return (
                <li
                  key={r.id}
                  className="border border-border/50 bg-card/60 p-3 rounded-md space-y-2"
                  data-testid={`requirement-row-${r.id}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {r.title}
                        <StatusPill status={r.status} />
                      </div>
                      {r.description && (
                        <p className="text-xs text-muted-foreground">
                          {r.description}
                        </p>
                      )}
                      <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Type:{" "}
                          <span className="font-mono">{TYPE_LABEL[r.type]}</span>
                        </span>
                        <span>
                          Urgency:{" "}
                          <span className="font-mono">
                            {URGENCY_LABEL[r.urgency]}
                          </span>
                        </span>
                        <span>
                          Module: <span className="font-mono">{moduleLabel}</span>
                        </span>
                        {r.hardwareDetails && (
                          <span>
                            Quantity:{" "}
                            <span className="font-mono">
                              {r.hardwareDetails.quantity}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {!isFrozen && !isApproved && r.moduleId !== null && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approve(r.id)}
                          className="gap-1"
                          data-testid={`button-approve-requirement-${r.id}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </Button>
                      )}
                      {!isFrozen && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(r)}
                          className="gap-1"
                          data-testid={`button-edit-requirement-${r.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                      )}
                      {!isFrozen && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(r.id)}
                          className="gap-1 text-destructive"
                          data-testid={`button-delete-requirement-${r.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      )}
                    </div>
                  </div>
                  {!isFrozen && !isApproved && r.moduleId === null && (
                    <p
                      className="text-[11px] text-muted-foreground italic"
                      data-testid={`requirement-draft-hint-${r.id}`}
                    >
                      Link this requirement to a module to enable approval.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {draft !== null && (
            <div
              className="border border-primary/30 bg-primary/5 p-4 rounded-md space-y-4"
              data-testid="requirement-draft"
            >
              <div className="space-y-2">
                <Label htmlFor="req-title">Title</Label>
                <Input
                  id="req-title"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="e.g. The system shall authenticate every API call."
                  data-testid="input-requirement-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="req-desc">Description (optional)</Label>
                <textarea
                  id="req-desc"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="input-requirement-description"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="req-type">Type</Label>
                  <select
                    id="req-type"
                    value={draft.type}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        type: e.target.value as RequirementType,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-requirement-type"
                  >
                    {TYPE_ORDER.map((t) => (
                      <option
                        key={t}
                        value={t}
                        data-testid={`option-requirement-type-${t}`}
                      >
                        {TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="req-urgency">Urgency</Label>
                  <select
                    id="req-urgency"
                    value={draft.urgency}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        urgency: e.target.value as RequirementUrgency,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-requirement-urgency"
                  >
                    {URGENCY_ORDER.map((u) => (
                      <option
                        key={u}
                        value={u}
                        data-testid={`option-requirement-urgency-${u}`}
                      >
                        {URGENCY_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="req-module">Module</Label>
                  <select
                    id="req-module"
                    value={draft.moduleId ?? "__none__"}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        moduleId:
                          e.target.value === "__none__" ? null : e.target.value,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-requirement-module"
                  >
                    <option
                      value="__none__"
                      data-testid="option-requirement-module-none"
                    >
                      (unassigned)
                    </option>
                    {modules.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        data-testid={`option-requirement-module-${m.id}`}
                      >
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {draft.type === "hardware" && (
                <div
                  className="border border-border/60 bg-background/60 p-3 rounded-md space-y-3"
                  data-testid="hardware-details"
                >
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Hardware Details
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="hw-item">Item Name</Label>
                      <Input
                        id="hw-item"
                        value={draft.hardwareDetails.itemName}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            hardwareDetails: {
                              ...draft.hardwareDetails,
                              itemName: e.target.value,
                            },
                          })
                        }
                        data-testid="input-hardware-item"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hw-model">Model</Label>
                      <Input
                        id="hw-model"
                        value={draft.hardwareDetails.model}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            hardwareDetails: {
                              ...draft.hardwareDetails,
                              model: e.target.value,
                            },
                          })
                        }
                        data-testid="input-hardware-model"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hw-qty">Quantity</Label>
                      <Input
                        id="hw-qty"
                        type="number"
                        min={1}
                        value={draft.hardwareDetails.quantity}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          setDraft({
                            ...draft,
                            hardwareDetails: {
                              ...draft.hardwareDetails,
                              quantity: Number.isFinite(n) && n > 0 ? n : 1,
                            },
                          });
                        }}
                        data-testid="input-hardware-quantity"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="hw-cost">Unit Cost Estimate</Label>
                      <Input
                        id="hw-cost"
                        type="number"
                        min={0}
                        step="0.01"
                        value={draft.hardwareDetails.unitCostEstimate}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          setDraft({
                            ...draft,
                            hardwareDetails: {
                              ...draft.hardwareDetails,
                              unitCostEstimate:
                                Number.isFinite(n) && n >= 0 ? n : 0,
                            },
                          });
                        }}
                        data-testid="input-hardware-cost"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hw-notes">Notes (optional)</Label>
                    <textarea
                      id="hw-notes"
                      rows={2}
                      value={draft.hardwareDetails.notes}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          hardwareDetails: {
                            ...draft.hardwareDetails,
                            notes: e.target.value,
                          },
                        })
                      }
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="input-hardware-notes"
                    />
                  </div>
                </div>
              )}

              {error !== null && (
                <div
                  className="text-xs text-destructive"
                  data-testid="requirement-error"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={cancelDraft}
                  data-testid="button-cancel-requirement"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveDraft}
                  disabled={!canSaveDraft}
                  data-testid="button-save-requirement"
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
          data-testid="button-back-to-modules"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Modules
        </Button>
        <Button
          onClick={onNext}
          disabled={!canContinue}
          className="gap-2"
          data-testid="button-next-step-3"
        >
          Continue to Trade-Offs <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: Requirement["status"];
}) {
  const label =
    status === "approved" ? "Approved" : status === "frozen" ? "Frozen" : "Draft";
  const color =
    status === "approved"
      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
      : status === "frozen"
      ? "bg-primary/10 text-primary border-primary/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`text-[10px] tracking-widest uppercase px-1.5 py-0.5 rounded border ${color}`}
      data-testid={`requirement-status-${status}`}
    >
      {label}
    </span>
  );
}

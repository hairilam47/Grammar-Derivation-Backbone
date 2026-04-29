// Stage A (ADC Wizard Retrofit) — Modules screen.
//
// CRUD surface for the Module Catalogue. Each Module carries a
// stable id, a display name, an optional description, and a set of
// related capability ids drawn from the canonical
// architecture-grammar capability registry. The screen reads / writes
// `moduleCatalogStore` directly; downstream wizard steps
// (Requirements Capture, Trade-Off, Freeze) consume the live module
// catalogue.
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
  Box,
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
import { CAPABILITIES } from "@workspace/architecture-grammar";
import {
  type Module,
  createModule,
  updateModule,
  removeModule,
  listModules,
  subscribe as subscribeModules,
} from "@/governance/moduleCatalogStore";
import { assertAllUrgencyLanguage } from "@/governance/staticTextGuard";

const STATIC_LABELS = [
  "Modules",
  "Define the modules that compose this work item.",
  "Add Module",
  "No modules defined yet",
  "Each module is a coarse-grained unit of architectural work. Linking modules to capabilities lets the wizard derive an in-scope capability set automatically at the trade-off step.",
  "Module Name",
  "Description (optional)",
  "Related Capabilities",
  "Save",
  "Cancel",
  "Edit",
  "Delete",
  "Back to Context",
  "Continue to Requirements",
  "Capabilities",
  "module(s) defined",
  "Linked capabilities",
  "None",
];
assertAllUrgencyLanguage(STATIC_LABELS);

interface ModulesScreenProps {
  readonly onBack: () => void;
  readonly onNext: () => void;
}

interface DraftModule {
  readonly editingId: string | null;
  readonly name: string;
  readonly description: string;
  readonly relatedCapabilityIds: readonly string[];
}

const EMPTY_DRAFT: DraftModule = {
  editingId: null,
  name: "",
  description: "",
  relatedCapabilityIds: [],
};

export function ModulesScreen({ onBack, onNext }: ModulesScreenProps) {
  const [modules, setModules] = useState<readonly Module[]>(() => listModules());
  const [draft, setDraft] = useState<DraftModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeModules(() => {
      setModules(listModules());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const startCreate = () => {
    setError(null);
    setDraft({ ...EMPTY_DRAFT });
  };

  const startEdit = (m: Module) => {
    setError(null);
    setDraft({
      editingId: m.id,
      name: m.name,
      description: m.description,
      relatedCapabilityIds: m.relatedCapabilityIds.slice(),
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
      if (draft.editingId !== null) {
        updateModule(draft.editingId, {
          name: draft.name,
          description: draft.description,
          relatedCapabilityIds: draft.relatedCapabilityIds,
        });
      } else {
        createModule({
          name: draft.name,
          description: draft.description,
          relatedCapabilityIds: draft.relatedCapabilityIds,
        });
      }
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (id: string) => {
    setError(null);
    removeModule(id);
  };

  const toggleCapability = (capId: string) => {
    if (!draft) return;
    const has = draft.relatedCapabilityIds.includes(capId);
    setDraft({
      ...draft,
      relatedCapabilityIds: has
        ? draft.relatedCapabilityIds.filter((c) => c !== capId)
        : [...draft.relatedCapabilityIds, capId],
    });
  };

  const canSaveDraft = draft !== null && draft.name.trim().length > 0;
  const canContinue = modules.length > 0;

  const capabilityNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of CAPABILITIES) m[c.id] = c.name;
    return m;
  }, []);

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          Step 2
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Modules</h1>
        <p className="text-muted-foreground text-sm">
          Define the modules that compose this work item.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              Module Catalogue
            </CardTitle>
            <CardDescription>
              {modules.length} module(s) defined
            </CardDescription>
          </div>
          {draft === null && (
            <Button
              size="sm"
              onClick={startCreate}
              className="gap-2"
              data-testid="button-add-module"
            >
              <Plus className="w-4 h-4" /> Add Module
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {modules.length === 0 && draft === null && (
            <div
              className="text-sm text-muted-foreground border border-dashed border-border p-6 rounded text-center space-y-2"
              data-testid="modules-empty"
            >
              <Box className="w-8 h-8 mx-auto opacity-60" />
              <div className="font-semibold text-foreground">
                No modules defined yet
              </div>
              <p className="text-xs">
                Each module is a coarse-grained unit of architectural work.
                Linking modules to capabilities lets the wizard derive an
                in-scope capability set automatically at the trade-off step.
              </p>
            </div>
          )}

          <ul className="space-y-2" data-testid="module-list">
            {modules.map((m) => {
              const isEditing = draft?.editingId === m.id;
              if (isEditing) return null;
              return (
                <li
                  key={m.id}
                  className="border border-border/50 bg-card/60 p-3 rounded-md flex items-start justify-between gap-3"
                  data-testid={`module-row-${m.id}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="font-semibold text-sm">{m.name}</div>
                    {m.description && (
                      <p className="text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      Linked capabilities:{" "}
                      {m.relatedCapabilityIds.length === 0
                        ? "None"
                        : m.relatedCapabilityIds
                            .map((c) => capabilityNameById[c] ?? c)
                            .join(", ")}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(m)}
                      className="gap-1"
                      data-testid={`button-edit-module-${m.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(m.id)}
                      className="gap-1 text-destructive"
                      data-testid={`button-delete-module-${m.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {draft !== null && (
            <div
              className="border border-primary/30 bg-primary/5 p-4 rounded-md space-y-4"
              data-testid="module-draft"
            >
              <div className="space-y-2">
                <Label htmlFor="module-name">Module Name</Label>
                <Input
                  id="module-name"
                  value={draft.name}
                  onChange={(e) =>
                    setDraft({ ...draft, name: e.target.value })
                  }
                  placeholder="e.g. Identity Service"
                  data-testid="input-module-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="module-desc">Description (optional)</Label>
                <textarea
                  id="module-desc"
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="input-module-description"
                />
              </div>

              <div className="space-y-2">
                <Label>Related Capabilities</Label>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-auto pr-1"
                  data-testid="capability-toggles"
                >
                  {CAPABILITIES.map((cap) => {
                    const checked = draft.relatedCapabilityIds.includes(cap.id);
                    return (
                      <label
                        key={cap.id}
                        className={[
                          "flex items-start gap-2 p-2 rounded border cursor-pointer text-xs",
                          checked
                            ? "border-primary bg-primary/10"
                            : "border-border bg-card/30 hover:border-primary/40",
                        ].join(" ")}
                        data-testid={`capability-toggle-${cap.id}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => toggleCapability(cap.id)}
                          data-testid={`capability-checkbox-${cap.id}`}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold block">
                            {cap.name}
                          </span>
                          <span className="text-muted-foreground">
                            {cap.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {error !== null && (
                <div
                  className="text-xs text-destructive"
                  data-testid="module-error"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={cancelDraft}
                  data-testid="button-cancel-module"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveDraft}
                  disabled={!canSaveDraft}
                  data-testid="button-save-module"
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
          data-testid="button-back-to-context"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Context
        </Button>
        <Button
          onClick={onNext}
          disabled={!canContinue}
          className="gap-2"
          data-testid="button-next-step-2"
        >
          Continue to Requirements <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

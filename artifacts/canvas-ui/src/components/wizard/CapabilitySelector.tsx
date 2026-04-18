import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { CapabilitySelection, CapabilityStatus } from "@workspace/architecture-grammar";
import { CAPABILITIES } from "@workspace/architecture-grammar";

interface CapabilitySelectorProps {
  selections: CapabilitySelection[];
  onSelectionsChange: (selections: CapabilitySelection[]) => void;
  onNext: () => void;
}

const STATUS_LABELS: Record<CapabilityStatus, string> = {
  IN_SCOPE: "In Scope",
  DEFERRED: "Deferred",
  OUT_OF_SCOPE: "Out of Scope",
};

const STATUSES: CapabilityStatus[] = ["IN_SCOPE", "DEFERRED", "OUT_OF_SCOPE"];

function getStatus(selections: CapabilitySelection[], id: string): CapabilityStatus | undefined {
  return selections.find((s) => s.capabilityId === id)?.status;
}

export function CapabilitySelector({
  selections,
  onSelectionsChange,
  onNext,
}: CapabilitySelectorProps) {
  const handleStatusChange = (id: string, status: CapabilityStatus) => {
    const existing = selections.find((s) => s.capabilityId === id);
    if (existing) {
      onSelectionsChange(selections.map((s) => (s.capabilityId === id ? { ...s, status } : s)));
    } else {
      onSelectionsChange([...selections, { capabilityId: id, status }]);
    }
  };

  const classifiedCount = CAPABILITIES.filter((cap) => getStatus(selections, cap.id) !== undefined).length;
  const allClassified = classifiedCount === CAPABILITIES.length;

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Capability Scope</h1>
        <p className="text-muted-foreground text-sm">
          Assign a status to each of the {CAPABILITIES.length} capabilities before deriving the architecture.
        </p>
      </div>

      <div className="space-y-3" data-testid="capability-list">
        {CAPABILITIES.map((cap) => {
          const currentStatus = getStatus(selections, cap.id);
          return (
            <Card key={cap.id} className="border-border/50 bg-card/50">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 min-w-0">
                  <Label className="text-base font-semibold">{cap.name}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{cap.description}</p>
                </div>
                <div
                  className="flex gap-1 shrink-0"
                  role="group"
                  aria-label={`Status for ${cap.name}`}
                  data-testid={`status-group-${cap.id}`}
                >
                  {STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleStatusChange(cap.id, status)}
                      data-testid={`btn-${cap.id}-${status}`}
                      aria-pressed={currentStatus === status}
                      className={[
                        "px-3 py-1.5 text-xs font-semibold rounded border transition-colors",
                        currentStatus === status
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                      ].join(" ")}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-border/50">
        <span className="text-sm text-muted-foreground" data-testid="classified-count">
          {classifiedCount} / {CAPABILITIES.length} classified
        </span>
        <Button
          onClick={onNext}
          disabled={!allClassified}
          className="gap-2"
          data-testid="button-derive-architecture"
        >
          Derive Architecture <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

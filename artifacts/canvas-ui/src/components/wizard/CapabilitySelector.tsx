import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const allClassified = CAPABILITIES.every((cap) => getStatus(selections, cap.id) !== undefined);
  const classifiedCount = CAPABILITIES.filter((cap) => getStatus(selections, cap.id) !== undefined).length;

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Capability Scope</h1>
        <p className="text-muted-foreground text-sm">
          Classify each capability. All 7 must be assigned a status before deriving the architecture.
        </p>
      </div>

      <div className="space-y-3" data-testid="capability-list">
        {CAPABILITIES.map((cap) => {
          const status = getStatus(selections, cap.id);
          return (
            <Card key={cap.id} className="border-border/50 bg-card/50">
              <div className="flex items-center justify-between p-4 gap-4">
                <div className="flex-1 min-w-0">
                  <Label className="text-base font-semibold truncate block">{cap.name}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{cap.description}</p>
                </div>
                <div className="w-44 shrink-0">
                  <Select
                    value={status ?? ""}
                    onValueChange={(val: CapabilityStatus) => handleStatusChange(cap.id, val)}
                  >
                    <SelectTrigger
                      data-testid={`select-cap-${cap.id}`}
                      className={status === undefined ? "border-dashed text-muted-foreground" : ""}
                    >
                      <SelectValue placeholder="Classify..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_SCOPE">In Scope</SelectItem>
                      <SelectItem value="DEFERRED">Deferred</SelectItem>
                      <SelectItem value="OUT_OF_SCOPE">Out of Scope</SelectItem>
                    </SelectContent>
                  </Select>
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

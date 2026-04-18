import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Settings2 } from "lucide-react";
import type { CapabilitySelection, TradeOffSettings } from "@workspace/architecture-grammar";
import { CAPABILITIES } from "@workspace/architecture-grammar";

interface CapabilitySelectorProps {
  selections: CapabilitySelection[];
  onSelectionsChange: (selections: CapabilitySelection[]) => void;
  tradeOffs: TradeOffSettings;
  onTradeOffsChange: (tradeOffs: TradeOffSettings) => void;
  onNext: () => void;
  onBack: () => void;
}

export function CapabilitySelector({
  selections,
  onSelectionsChange,
  tradeOffs,
  onTradeOffsChange,
  onNext,
  onBack,
}: CapabilitySelectorProps) {
  const handleStatusChange = (id: string, status: CapabilitySelection["status"]) => {
    onSelectionsChange(
      selections.map((s) => (s.capabilityId === id ? { ...s, status } : s))
    );
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Capabilities & Trade-offs</h1>
          <p className="text-muted-foreground text-sm">Select required capabilities and define structural parameters.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Component Scope
          </h2>
          <div className="space-y-3">
            {CAPABILITIES.map((cap) => {
              const selection = selections.find((s) => s.capabilityId === cap.id);
              return (
                <Card key={cap.id} className="border-border/50 bg-card/50">
                  <div className="flex items-center justify-between p-4 gap-4">
                    <div className="flex-1 min-w-0">
                      <Label className="text-base font-semibold truncate block">{cap.name}</Label>
                      <p className="text-xs text-muted-foreground truncate mt-1">{cap.description}</p>
                    </div>
                    <div className="w-40 shrink-0">
                      <Select
                        value={selection?.status}
                        onValueChange={(val: any) => handleStatusChange(cap.id, val)}
                      >
                        <SelectTrigger data-testid={`select-cap-${cap.id}`}>
                          <SelectValue />
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
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Architecture Parameters
          </h2>
          <Card className="bg-muted/20">
            <CardContent className="p-4 space-y-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Architecture Style</Label>
                <Select
                  value={tradeOffs.architectureStyle}
                  onValueChange={(val: any) => onTradeOffsChange({ ...tradeOffs, architectureStyle: val })}
                >
                  <SelectTrigger data-testid="select-arch-style">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Simple">Simple / Monolithic</SelectItem>
                    <SelectItem value="Distributed">Distributed / Microservices</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Deployment Model</Label>
                <Select
                  value={tradeOffs.deploymentModel}
                  onValueChange={(val: any) => onTradeOffsChange({ ...tradeOffs, deploymentModel: val })}
                >
                  <SelectTrigger data-testid="select-deploy-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cloud">Cloud Native</SelectItem>
                    <SelectItem value="OnPrem">On-Premises</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase">Scope Level</Label>
                <Select
                  value={tradeOffs.scopeLevel}
                  onValueChange={(val: any) => onTradeOffsChange({ ...tradeOffs, scopeLevel: val })}
                >
                  <SelectTrigger data-testid="select-scope-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Minimal">Minimal MVP</SelectItem>
                    <SelectItem value="Full">Full Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-border/50">
        <Button variant="outline" onClick={onBack} className="gap-2" data-testid="button-back-step-2">
          <ArrowLeft className="w-4 h-4" /> Context
        </Button>
        <Button onClick={onNext} className="gap-2" data-testid="button-derive-architecture">
          Derive Architecture <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { deriveArchitecture } from "@workspace/architecture-grammar";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
  Component,
} from "@workspace/architecture-grammar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, Cpu, Activity, BarChart, Layers, ShieldAlert, ArrowRight } from "lucide-react";

const DEFAULT_TRADE_OFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

const LAYER_ORDER = ["UI", "Application", "Data", "Integration", "Security", "Operations"] as const;

const RISK_COLORS: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

interface ArchitectureResultDisplayProps {
  context: OrganisationContext;
  selections: CapabilitySelection[];
  onReset: () => void;
  onExplore: () => void;
}

export function ArchitectureResultDisplay({
  context,
  selections,
  onReset,
  onExplore,
}: ArchitectureResultDisplayProps) {
  const result = useMemo(() => {
    return deriveArchitecture(context, selections, DEFAULT_TRADE_OFFS);
  }, [context, selections]);

  const componentsByLayer = useMemo(() => {
    const grouped = result.requiredComponents.reduce<Record<string, Component[]>>((acc, comp) => {
      if (!acc[comp.layer]) acc[comp.layer] = [];
      acc[comp.layer].push(comp);
      return acc;
    }, {});

    return LAYER_ORDER
      .map((layer) => ({ layer, components: grouped[layer] ?? [] }))
      .filter((g) => g.components.length > 0);
  }, [result.requiredComponents]);

  const inScopeCount = selections.filter((s) => s.status === "IN_SCOPE").length;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Architecture Blueprint</h1>
          <p className="text-muted-foreground text-sm font-mono">
            Derived deterministically from {inScopeCount} in-scope {inScopeCount === 1 ? "capability" : "capabilities"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset} className="gap-2" data-testid="button-reset">
            <RotateCcw className="w-4 h-4" /> Start Over
          </Button>
          <Button onClick={onExplore} className="gap-2" data-testid="button-explore-tradeoffs">
            Explore Trade-offs <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <Cpu className="w-8 h-8 text-primary mb-2" />
            <div className="text-4xl font-bold" data-testid="indicator-complexity">
              {result.indicators.complexityScore}
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
              Complexity
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <Activity className="w-8 h-8 text-muted-foreground mb-2" />
            <div className="text-4xl font-bold" data-testid="indicator-operational">
              {result.indicators.operationalOverheadScore}
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
              Operational Overhead
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/50">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
            <BarChart className="w-8 h-8 text-muted-foreground mb-2" />
            <div className="text-4xl font-bold" data-testid="indicator-change">
              {result.indicators.changeCostLaterScore}
            </div>
            <div className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
              Change Cost Later
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Layers className="w-5 h-5" /> Required Components
          </h2>

          <div className="space-y-6">
            {componentsByLayer.map((group) => (
              <div key={group.layer} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  {group.layer} Layer
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.components.map((comp) => (
                    <div
                      key={comp.id}
                      className="border border-border/50 bg-card p-3 rounded-md flex justify-between items-center"
                      data-testid={`component-${comp.id}`}
                    >
                      <span className="font-semibold text-sm truncate pr-2">{comp.name}</span>
                      <div className="flex gap-2 text-xs font-mono text-muted-foreground shrink-0">
                        <span title="Complexity Weight">C:{comp.complexityWeight}</span>
                        <span title="Operational Impact">O:{comp.operationalImpact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5" /> Risk Assessment
          </h2>

          <div className="space-y-3">
            {result.risks.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed border-border p-4 rounded text-center">
                No risks identified under the derived configuration.
              </div>
            ) : (
              result.risks.map((risk, idx) => (
                <div
                  key={idx}
                  className={`p-3 border rounded-md text-sm space-y-1 ${RISK_COLORS[risk.level] ?? ""}`}
                  data-testid={`risk-${idx}`}
                >
                  <div className="flex justify-between items-center font-bold">
                    <span>{risk.category}</span>
                    <span className="text-[10px] tracking-widest px-1.5 py-0.5 rounded bg-background/50 border border-current/20">
                      {risk.level}
                    </span>
                  </div>
                  <p className="opacity-90">{risk.reason}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

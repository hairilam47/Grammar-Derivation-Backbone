import { useMemo } from "react";
import { deriveArchitecture } from "@workspace/architecture-grammar";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
  ArchitectureStyle,
  DeploymentModel,
  ScopeLevel,
  Component,
} from "@workspace/architecture-grammar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft,
  Cpu,
  Activity,
  BarChart,
  Layers,
  ShieldAlert,
  RotateCcw,
  Info,
} from "lucide-react";

const BASELINE_TRADE_OFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

const LAYER_ORDER = [
  "UI",
  "Application",
  "Data",
  "Integration",
  "Security",
  "Operations",
] as const;

const RISK_COLORS: Record<string, string> = {
  RED: "bg-destructive/10 text-destructive border-destructive/20",
  AMBER: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  GREEN: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

interface TradeOffExplorerProps {
  context: OrganisationContext;
  selections: CapabilitySelection[];
  tradeOffs: TradeOffSettings;
  onTradeOffsChange: (next: TradeOffSettings) => void;
  onBack: () => void;
}

export function TradeOffExplorer({
  context,
  selections,
  tradeOffs,
  onTradeOffsChange,
}: TradeOffExplorerProps) {
  const baseline = useMemo(
    () => deriveArchitecture(context, selections, BASELINE_TRADE_OFFS),
    [context, selections],
  );

  const explored = useMemo(
    () => deriveArchitecture(context, selections, tradeOffs),
    [context, selections, tradeOffs],
  );

  const componentsByLayer = useMemo(() => {
    const grouped = baseline.requiredComponents.reduce<Record<string, Component[]>>(
      (acc, comp) => {
        if (!acc[comp.layer]) acc[comp.layer] = [];
        acc[comp.layer].push(comp);
        return acc;
      },
      {},
    );
    return LAYER_ORDER.map((layer) => ({
      layer,
      components: grouped[layer] ?? [],
    })).filter((g) => g.components.length > 0);
  }, [baseline.requiredComponents]);

  const isAtBaseline =
    tradeOffs.architectureStyle === BASELINE_TRADE_OFFS.architectureStyle &&
    tradeOffs.deploymentModel === BASELINE_TRADE_OFFS.deploymentModel &&
    tradeOffs.scopeLevel === BASELINE_TRADE_OFFS.scopeLevel;

  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
            Step 4
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">What-If Exploration</h1>
          <p className="text-muted-foreground text-sm font-mono">
            Adjust posture toggles to observe consequence indicator movement.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onTradeOffsChange(BASELINE_TRADE_OFFS)}
            disabled={isAtBaseline}
            className="gap-2"
            data-testid="button-reset-baseline"
          >
            <RotateCcw className="w-4 h-4" /> Reset to Baseline
          </Button>
        </div>
      </div>

      <div
        className="flex items-start gap-3 p-4 border border-primary/30 bg-primary/5 rounded-md text-sm"
        data-testid="notice-structure-unchanged"
      >
        <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
        <span>This view explores consequences. Architecture structure remains unchanged.</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold uppercase tracking-wider">
            Trade-Off Posture
          </CardTitle>
          <CardDescription>
            Each toggle re-derives indicators only. Components and risks below stay fixed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Architecture Posture
            </Label>
            <RadioGroup
              value={tradeOffs.architectureStyle}
              onValueChange={(val: ArchitectureStyle) =>
                onTradeOffsChange({ ...tradeOffs, architectureStyle: val })
              }
              className="flex gap-4"
              data-testid="radio-arch-style"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Simple" id="arch-simple" data-testid="radio-arch-simple" />
                <Label htmlFor="arch-simple">Simple</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Distributed"
                  id="arch-distributed"
                  data-testid="radio-arch-distributed"
                />
                <Label htmlFor="arch-distributed">Distributed</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Deployment Posture
            </Label>
            <RadioGroup
              value={tradeOffs.deploymentModel}
              onValueChange={(val: DeploymentModel) =>
                onTradeOffsChange({ ...tradeOffs, deploymentModel: val })
              }
              className="flex gap-4"
              data-testid="radio-deployment"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Cloud" id="dep-cloud" data-testid="radio-dep-cloud" />
                <Label htmlFor="dep-cloud">Cloud</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="OnPrem" id="dep-onprem" data-testid="radio-dep-onprem" />
                <Label htmlFor="dep-onprem">On-Prem</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Scope Ambition
            </Label>
            <RadioGroup
              value={tradeOffs.scopeLevel}
              onValueChange={(val: ScopeLevel) =>
                onTradeOffsChange({ ...tradeOffs, scopeLevel: val })
              }
              className="flex gap-4"
              data-testid="radio-scope"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="Minimal"
                  id="scope-minimal"
                  data-testid="radio-scope-minimal"
                />
                <Label htmlFor="scope-minimal">Minimal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Full" id="scope-full" data-testid="radio-scope-full" />
                <Label htmlFor="scope-full">Full</Label>
              </div>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <IndicatorCard
          icon={<Cpu className="w-8 h-8 text-primary mb-2" />}
          baseline={baseline.indicators.complexityScore}
          current={explored.indicators.complexityScore}
          label="Complexity"
          testid="indicator-complexity"
          accent
        />
        <IndicatorCard
          icon={<Activity className="w-8 h-8 text-muted-foreground mb-2" />}
          baseline={baseline.indicators.operationalOverheadScore}
          current={explored.indicators.operationalOverheadScore}
          label="Operational Overhead"
          testid="indicator-operational"
        />
        <IndicatorCard
          icon={<BarChart className="w-8 h-8 text-muted-foreground mb-2" />}
          baseline={baseline.indicators.changeCostLaterScore}
          current={explored.indicators.changeCostLaterScore}
          label="Change Cost Later"
          testid="indicator-change"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold border-b border-border pb-2 flex items-center gap-2">
            <Layers className="w-5 h-5" /> Required Components
            <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
              Baseline · Read-Only
            </span>
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
                      className="border border-border/50 bg-card p-3 rounded-md flex justify-between items-center opacity-90"
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
            <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
              Baseline
            </span>
          </h2>
          <div className="space-y-3">
            {baseline.risks.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-dashed border-border p-4 rounded text-center">
                No risks identified under the baseline configuration.
              </div>
            ) : (
              baseline.risks.map((risk, idx) => (
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

interface IndicatorCardProps {
  icon: React.ReactNode;
  baseline: number;
  current: number;
  label: string;
  testid: string;
  accent?: boolean;
}

function IndicatorCard({ icon, baseline, current, label, testid, accent }: IndicatorCardProps) {
  const delta = current - baseline;
  const deltaLabel =
    delta === 0 ? "no change" : delta > 0 ? `+${delta} vs baseline` : `${delta} vs baseline`;
  const deltaClass =
    delta === 0
      ? "text-muted-foreground"
      : delta > 0
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <Card className={accent ? "bg-primary/10 border-primary/20" : "bg-secondary/50"}>
      <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
        {icon}
        <div className="text-4xl font-bold" data-testid={testid}>
          {current}
        </div>
        <div className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
          {label}
        </div>
        <div
          className={`text-[10px] font-mono ${deltaClass}`}
          data-testid={`${testid}-delta`}
        >
          {deltaLabel}
        </div>
      </CardContent>
    </Card>
  );
}

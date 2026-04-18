import { useState } from "react";
import { ContextForm } from "@/components/wizard/ContextForm";
import { CapabilitySelector } from "@/components/wizard/CapabilitySelector";
import { ArchitectureResultDisplay } from "@/components/wizard/ArchitectureResultDisplay";
import { TradeOffExplorer } from "@/components/wizard/TradeOffExplorer";
import { FreezeMetadataForm } from "@/components/wizard/FreezeMetadataForm";
import { FreezeAndExport } from "@/components/wizard/FreezeAndExport";
import type {
  OrganisationContext,
  CapabilitySelection,
  TradeOffSettings,
} from "@workspace/architecture-grammar";
import type { ProjectMetadata } from "@/governance/types";
import { Layout } from "lucide-react";
import { PortfolioHeaderNav } from "@/components/governance/PortfolioHeaderNav";

const BASELINE_TRADE_OFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

const EMPTY_METADATA: ProjectMetadata = {
  projectName: "",
  approvingAuthority: "",
};

export default function Wizard() {
  const [step, setStep] = useState<number>(1);

  const [context, setContext] = useState<Partial<OrganisationContext>>({
    expectedLifespanYears: 10,
  });

  const [selections, setSelections] = useState<CapabilitySelection[]>([]);

  const [tradeOffs, setTradeOffs] = useState<TradeOffSettings>(BASELINE_TRADE_OFFS);

  const [metadata, setMetadata] = useState<ProjectMetadata>(EMPTY_METADATA);

  const [freezeRequested, setFreezeRequested] = useState(false);

  const nextStep = () => setStep((s) => Math.min(s + 1, 5));
  const goToStep = (n: number) => setStep(n);

  const reset = () => {
    setStep(1);
    setContext({ expectedLifespanYears: 10 });
    setSelections([]);
    setTradeOffs(BASELINE_TRADE_OFFS);
    setMetadata(EMPTY_METADATA);
    setFreezeRequested(false);
  };

  const contextReady =
    !!context.organisationType &&
    !!context.sensitivityLevel &&
    !!context.systemIntent &&
    !!context.expectedLifespanYears;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Layout className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              Architecture Decision Canvas
            </span>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex gap-1 items-center">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className={`w-8 h-1 transition-colors ${
                    step >= i ? "bg-primary" : "bg-muted"
                  }`}
                  data-testid={`step-indicator-${i}`}
                />
              ))}
            </div>
            <PortfolioHeaderNav />
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        {step === 1 && (
          <ContextForm data={context} onChange={setContext} onNext={nextStep} />
        )}
        {step === 2 && (
          <CapabilitySelector
            selections={selections}
            onSelectionsChange={setSelections}
            onNext={nextStep}
          />
        )}
        {step === 3 && contextReady && (
          <ArchitectureResultDisplay
            context={context as OrganisationContext}
            selections={selections}
            onReset={reset}
            onExplore={() => goToStep(4)}
          />
        )}
        {step === 4 && contextReady && !freezeRequested && (
          <TradeOffExplorer
            context={context as OrganisationContext}
            selections={selections}
            tradeOffs={tradeOffs}
            onTradeOffsChange={setTradeOffs}
            onBack={() => goToStep(3)}
            onFreeze={() => setFreezeRequested(true)}
          />
        )}
        {step === 4 && contextReady && freezeRequested && (
          <FreezeMetadataForm
            initial={metadata}
            onCancel={() => setFreezeRequested(false)}
            onConfirm={(m) => {
              setMetadata(m);
              setFreezeRequested(false);
              goToStep(5);
            }}
          />
        )}
        {step === 5 && contextReady && (
          <FreezeAndExport
            context={context as OrganisationContext}
            selections={selections}
            baselineTradeOffs={BASELINE_TRADE_OFFS}
            metadata={metadata}
            onStartOver={reset}
          />
        )}
      </main>
    </div>
  );
}

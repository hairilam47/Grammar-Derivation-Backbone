import { useEffect, useState } from "react";
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

const BASELINE_TRADE_OFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

const EMPTY_METADATA: ProjectMetadata = {
  projectName: "",
  approvingAuthority: "",
};

export interface WizardProps {
  /** Optional callback fired whenever the internal step changes.
   *  The DecisionCanvasShell uses this to drive its phase indicator
   *  and to redirect to the portfolio after the freeze step. */
  onStepChange?: (step: number) => void;
}

export default function Wizard({ onStepChange }: WizardProps = {}) {
  const [step, setStep] = useState<number>(1);

  const [context, setContext] = useState<Partial<OrganisationContext>>({
    expectedLifespanYears: 10,
  });

  const [selections, setSelections] = useState<CapabilitySelection[]>([]);

  const [tradeOffs, setTradeOffs] = useState<TradeOffSettings>(BASELINE_TRADE_OFFS);

  const [metadata, setMetadata] = useState<ProjectMetadata>(EMPTY_METADATA);

  const [freezeRequested, setFreezeRequested] = useState(false);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

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
    <>
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
    </>
  );
}

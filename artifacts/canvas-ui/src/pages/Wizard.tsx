// Stage A (ADC Wizard Retrofit) — 5-step wizard.
//
//   Step 1 · Context              — captures OrganisationContext
//   Step 2 · Modules              — CRUD against moduleCatalogStore
//   Step 3 · Requirements Capture — CRUD against requirementsStore
//   Step 4 · Trade-Offs           — what-if exploration on derived
//                                   capability selections
//   Step 5 · Freeze               — dual freeze actions:
//                                     1) Freeze Requirements (contract)
//                                     2) Freeze Decision (portfolio entry)
//
// Capability scope is no longer a separate manual screen. The
// trade-off step receives a `CapabilitySelection[]` derived directly
// from the modules' `relatedCapabilityIds` — every capability claimed
// by at least one module is `IN_SCOPE`, every other capability is
// `OUT_OF_SCOPE`. This collapses the prior Capability Mapping +
// Architecture Result steps into a single derived input that flows
// straight from the Modules screen.

import { useEffect, useMemo, useState } from "react";
import { ContextForm } from "@/components/wizard/ContextForm";
import { ModulesScreen } from "@/components/wizard/ModulesScreen";
import { RequirementsCapture } from "@/components/wizard/RequirementsCapture";
import { TradeOffExplorer } from "@/components/wizard/TradeOffExplorer";
import { FreezeScreen } from "@/components/wizard/FreezeScreen";
import {
  CAPABILITIES,
  type OrganisationContext,
  type CapabilitySelection,
  type TradeOffSettings,
} from "@workspace/architecture-grammar";
import {
  listModules,
  subscribe as subscribeModules,
  type Module,
} from "@/governance/moduleCatalogStore";

const BASELINE_TRADE_OFFS: TradeOffSettings = {
  architectureStyle: "Simple",
  deploymentModel: "Cloud",
  scopeLevel: "Minimal",
};

export interface WizardProps {
  /** Optional callback fired whenever the internal step changes.
   *  The DecisionCanvasShell uses this to drive its phase indicator. */
  readonly onStepChange?: (step: number) => void;
  /** Callback fired AFTER the Freeze Decision action has persisted
   *  the portfolio entry. The shell uses this to redirect to the
   *  portfolio and reset session state for a future visit. */
  readonly onAfterFreezeDecision?: () => void;
}

function deriveSelections(modules: readonly Module[]): CapabilitySelection[] {
  const claimed = new Set<string>();
  for (const m of modules) {
    for (const cap of m.relatedCapabilityIds) claimed.add(cap);
  }
  return CAPABILITIES.map((c) => ({
    capabilityId: c.id,
    status: claimed.has(c.id) ? "IN_SCOPE" : "OUT_OF_SCOPE",
  }));
}

export default function Wizard({
  onStepChange,
  onAfterFreezeDecision,
}: WizardProps = {}) {
  const [step, setStep] = useState<number>(1);

  const [context, setContext] = useState<Partial<OrganisationContext>>({
    expectedLifespanYears: 10,
  });

  // Module catalogue snapshot — driven by the live store subscription
  // so changes made by ModulesScreen flow into the trade-off derivation
  // automatically.
  const [modules, setModules] = useState<readonly Module[]>(() => listModules());
  useEffect(() => {
    const unsub = subscribeModules(() => {
      setModules(listModules());
    });
    return () => {
      unsub();
    };
  }, []);

  const selections = useMemo(() => deriveSelections(modules), [modules]);

  const [tradeOffs, setTradeOffs] = useState<TradeOffSettings>(BASELINE_TRADE_OFFS);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  const nextStep = () => setStep((s) => Math.min(s + 1, 5));
  const goToStep = (n: number) => setStep(n);

  const reset = () => {
    setStep(1);
    setContext({ expectedLifespanYears: 10 });
    setTradeOffs(BASELINE_TRADE_OFFS);
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
        <ModulesScreen onBack={() => goToStep(1)} onNext={() => goToStep(3)} />
      )}
      {step === 3 && (
        <RequirementsCapture
          onBack={() => goToStep(2)}
          onNext={() => goToStep(4)}
        />
      )}
      {step === 4 && contextReady && (
        <TradeOffExplorer
          context={context as OrganisationContext}
          selections={selections}
          tradeOffs={tradeOffs}
          onTradeOffsChange={setTradeOffs}
          onBack={() => goToStep(3)}
          onFreeze={() => goToStep(5)}
        />
      )}
      {step === 5 && contextReady && (
        <FreezeScreen
          context={context as OrganisationContext}
          selections={selections}
          baselineTradeOffs={BASELINE_TRADE_OFFS}
          onBack={() => goToStep(4)}
          onStartOver={reset}
          onAfterFreezeDecision={() => onAfterFreezeDecision?.()}
        />
      )}
    </>
  );
}

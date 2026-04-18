import { useState } from "react";
import { ContextForm } from "@/components/wizard/ContextForm";
import { CapabilitySelector } from "@/components/wizard/CapabilitySelector";
import { ArchitectureResultDisplay } from "@/components/wizard/ArchitectureResultDisplay";
import type {
  OrganisationContext,
  CapabilitySelection,
} from "@workspace/architecture-grammar";
import { CAPABILITIES } from "@workspace/architecture-grammar";
import { Layout } from "lucide-react";

const DEFAULT_SELECTIONS: CapabilitySelection[] = CAPABILITIES.map((c) => ({
  capabilityId: c.id,
  status: "IN_SCOPE",
}));

export default function Wizard() {
  const [step, setStep] = useState<number>(1);

  const [context, setContext] = useState<Partial<OrganisationContext>>({
    expectedLifespanYears: 10,
  });

  const [selections, setSelections] = useState<CapabilitySelection[]>(DEFAULT_SELECTIONS);

  const nextStep = () => setStep((s) => Math.min(s + 1, 3));

  const reset = () => {
    setStep(1);
    setContext({ expectedLifespanYears: 10 });
    setSelections(DEFAULT_SELECTIONS);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Layout className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">Architecture Decision Canvas</span>
          </div>
          <div className="flex gap-1 items-center">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-8 h-1 transition-colors ${
                  step >= i ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        {step === 1 && (
          <ContextForm
            data={context}
            onChange={setContext}
            onNext={nextStep}
          />
        )}
        {step === 2 && (
          <CapabilitySelector
            selections={selections}
            onSelectionsChange={setSelections}
            onNext={nextStep}
          />
        )}
        {step === 3 &&
          context.organisationType &&
          context.sensitivityLevel &&
          context.systemIntent &&
          context.expectedLifespanYears && (
            <ArchitectureResultDisplay
              context={context as OrganisationContext}
              selections={selections}
              onReset={reset}
            />
          )}
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import Wizard from "@/pages/Wizard";

const PHASE_LABELS = [
  "Context",
  "Scope",
  "Architecture",
  "Trade-offs",
  "Freeze",
] as const;

export default function DecisionCanvasShell() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<number>(1);
  const [sessionKey, setSessionKey] = useState<number>(0);

  // After freeze (step 5) the wizard's freeze useEffect persists the
  // portfolio entry. Once that has happened the shell redirects the
  // user to the portfolio (read-only) and bumps `sessionKey` so a
  // future visit to /decision-canvas mounts a fresh empty wizard
  // rather than resuming the frozen one.
  useEffect(() => {
    if (step === 5) {
      setLocation("/portfolio");
      setSessionKey((k) => k + 1);
      setStep(1);
    }
  }, [step, setLocation]);

  const decisionInProgress = step >= 1 && step < 5;

  const handleExit = () => {
    const ok = window.confirm(
      "Exit the current decision? Any unsaved progress will be discarded.",
    );
    if (!ok) return;
    setSessionKey((k) => k + 1);
    setStep(1);
    setLocation("/");
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <div
        className="glass-rail border-b border-border/40"
        data-testid="decision-session-bar"
      >
        <div className="container max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {decisionInProgress && (
              <span
                className="text-[10px] uppercase tracking-[0.18em] text-primary tnum"
                data-testid="decision-in-progress"
              >
                Decision in Progress
              </span>
            )}
            <ol
              className="flex items-center gap-2"
              data-testid="phase-indicator"
              aria-label="Decision phases"
            >
              {PHASE_LABELS.map((label, i) => {
                const phase = i + 1;
                const active = step === phase;
                const done = step > phase;
                return (
                  <li
                    key={label}
                    className="flex items-center gap-2"
                    data-testid={`phase-${phase}`}
                    data-active={active ? "true" : "false"}
                    data-done={done ? "true" : "false"}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full transition-colors duration-[var(--motion-base)] ${
                        done || active ? "bg-primary" : "bg-muted"
                      }`}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-[10px] uppercase tracking-[0.18em] transition-colors duration-[var(--motion-base)] ${
                        active
                          ? "text-primary"
                          : done
                          ? "text-foreground/70"
                          : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          {decisionInProgress && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExit}
              data-testid="exit-decision"
            >
              <LogOut className="w-3.5 h-3.5" /> Exit Decision
            </Button>
          )}
        </div>
      </div>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8">
        <Wizard key={sessionKey} onStepChange={setStep} />
      </main>
    </div>
  );
}

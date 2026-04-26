import { Link } from "wouter";
import { FileSignature, Workflow, Layout, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlobalNav } from "@/components/governance/GlobalNav";

interface IntentCard {
  testId: string;
  icon: typeof FileSignature;
  title: string;
  description: string;
  hints: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  ctaTestId: string;
}

// NOTE on the CTAD card copy below: the LandingPage is META — it
// describes what each surface IS rather than acting as one of them.
// The CTAD card therefore uses denial vocabulary ("approved
// decision", "No approval, no recommendation, no scoring") to
// communicate CTAD's non-authoritative posture. These tokens are on
// the CTAD vocabulary tier's forbidden list when used inside CTAD-
// authored UI, but here they appear in the negative — declaring
// what CTAD does NOT do — so we deliberately do NOT run
// `assertAllCtadLanguage` over the landing-card strings. The
// vocabulary guard remains in force on every string rendered from
// inside `src/ctad/**` and `src/pages/ctad/**`.
const CARDS: readonly IntentCard[] = [
  {
    testId: "intent-card-adc",
    icon: FileSignature,
    title: "ADC \u2014 Design Contract",
    description:
      "Form, approve, and record a formal architecture decision.",
    hints: [
      "Grammar-based decision formation",
      "One-way freeze and governance record",
      "Produces ADS and ECP artefacts",
    ],
    ctaLabel: "Start a Decision",
    ctaHref: "/decision-canvas",
    ctaTestId: "intent-cta-adc",
  },
  {
    testId: "intent-card-ctad",
    icon: Layers,
    title: "CTAD \u2014 Technology Exploration",
    description:
      "Explore technology configurations permitted by an approved decision.",
    hints: [
      "Interpretive and reversible",
      "Reads an approved decision read-only",
      "No approval, no recommendation, no scoring",
    ],
    ctaLabel: "Open Technology Exploration",
    ctaHref: "/ctad",
    ctaTestId: "intent-cta-ctad",
  },
  {
    testId: "intent-card-acw",
    icon: Workflow,
    title: "ACW \u2014 Architecture Workspace",
    description:
      "Explore and map the current architecture and system structure.",
    hints: [
      "Non-governing and exploratory",
      "Safe to explore and experiment",
      "No decisions are recorded",
    ],
    ctaLabel: "Open Workspace",
    ctaHref: "/workspace",
    ctaTestId: "intent-cta-acw",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="glass-header sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark" aria-hidden="true">
              <Layout />
            </span>
            <span className="font-semibold tracking-tight text-sm">
              Architecture Decision Canvas
            </span>
          </div>
          <GlobalNav />
        </div>
        <div className="hairline-accent h-px w-full opacity-60" aria-hidden="true" />
      </header>

      <main className="flex-1 container max-w-6xl mx-auto px-4 py-16">
        <div className="mb-12 text-center space-y-4" data-testid="intent-heading">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Architecture Decision Canvas
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-tight max-w-3xl mx-auto">
            Choose how you want to{" "}
            <span className="gradient-text">engage with the architecture</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto">
            Three surfaces are available. They are independent and equal.
            Pick the one that matches what you want to do right now.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" data-testid="intent-cards">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.testId}
                data-testid={card.testId}
                className="lift flex flex-col group relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-base)] gradient-accent-soft pointer-events-none"
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-x-0 top-0 h-px hairline-accent opacity-0 group-hover:opacity-100 transition-opacity duration-[var(--motion-base)]"
                  aria-hidden="true"
                />
                <CardHeader className="space-y-3 relative">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-secondary/60 border border-border/60 text-foreground group-hover:text-primary transition-colors duration-[var(--motion-base)]">
                    <Icon
                      className="w-5 h-5"
                      aria-hidden="true"
                      data-testid={`${card.testId}-icon`}
                    />
                  </span>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-6 relative">
                  <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                    {card.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                  <Link href={card.ctaHref}>
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid={card.ctaTestId}
                    >
                      {card.ctaLabel}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}

import { Link } from "wouter";
import { FileSignature, Workflow, Layout } from "lucide-react";
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
    ctaHref: "/workspace/context",
    ctaTestId: "intent-cta-acw",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col font-mono">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Layout className="w-5 h-5" />
            <span className="font-bold tracking-tight text-sm uppercase">
              Architecture Decision Canvas
            </span>
          </div>
          <GlobalNav />
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12">
        <div className="mb-10 text-center space-y-3" data-testid="intent-heading">
          <h1 className="text-2xl font-bold tracking-tight">
            Choose how you want to engage with the architecture
          </h1>
          <p className="text-sm text-muted-foreground">
            Two surfaces are available. They are independent and equal.
            Pick the one that matches what you want to do right now.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="intent-cards">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.testId}
                data-testid={card.testId}
                className="flex flex-col"
              >
                <CardHeader className="space-y-3">
                  <Icon
                    className="w-8 h-8 text-muted-foreground"
                    aria-hidden="true"
                    data-testid={`${card.testId}-icon`}
                  />
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between gap-6">
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

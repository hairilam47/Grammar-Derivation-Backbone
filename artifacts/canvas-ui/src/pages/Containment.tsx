import { useState } from "react";
import { Link } from "wouter";
import { Shield, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import {
  TOGAF_ARTEFACT_DOCKING,
  MANDATORY_NON_AUTHORITY_DISCLAIMER,
  type DockingClass,
} from "@/governance/togafContainment";
import {
  detectMisuseIntent,
  CORRECTION_LANGUAGE,
  MISUSE_INTENTS,
  type MisuseIntent,
} from "@/governance/misusePlaybooks";
import { assertAllTogafContainmentLanguage } from "@/governance/staticTextGuard";

// Phase 6 surface labels. All registered into a single dictionary and
// asserted against TOGAF_CONTAINMENT_FORBIDDEN at module load. The
// verbatim mandatory disclaimer is intentionally NOT in this list: it
// negates words that the tier bans and is verified by spec-equality
// in togafContainment.ts (mirroring the Phase 1 banner pattern).
const PAGE_TITLE = "Constitutional Containment";
const INTRO =
  "This page records the constitutional position of Architecture Decision Canvas artefacts in relation to TOGAF artefacts, ArchiMate models, and EA tooling. It is read-only documentation; nothing on this page initiates, alters, or directs work.";
const SECTION_DISCLAIMER = "Mandatory non-authority disclaimer (verbatim)";
const SECTION_DOCKING = "TOGAF Artefact Docking";
const SECTION_DOCKING_HELPER =
  "Each TOGAF artefact type carries one docking class. Any artefact type not listed here is treated as FORBIDDEN by default.";
const COL_ARTEFACT = "Artefact";
const COL_DOCKING = "Docking class";
const COL_RATIONALE = "Notes";
const SECTION_PLAYBOOKS = "Misuse Playbooks";
const SECTION_PLAYBOOKS_HELPER =
  "Each phrasing pattern in the table carries one re-anchoring sentence. The check is advisory; no input is blocked, recorded, or referred onward.";
const COL_PATTERN = "Pattern";
const COL_REANCHOR = "Re-anchoring sentence";
const TRY_LABEL = "Try a phrase to see the matching re-anchor";
const TRY_PLACEHOLDER = "Type or paste any sentence";
const NO_INTENT = "No phrasing pattern detected.";
const SECTION_ARCHIMATE = "ArchiMate Containment";
const SECTION_ARCHIMATE_HELPER =
  "ADC artefacts are not ArchiMate elements. They do not appear in ArchiMate views, do not bind ArchiMate relationships, and may not be exported as ArchiMate models.";
const BACK_TO_PORTFOLIO = "Back to portfolio";

// PH6-HC1 / PH6-HC4 / PH6-HC5 — every label, helper, and column heading
// rendered on this page is asserted against the strictest tier.
assertAllTogafContainmentLanguage([
  PAGE_TITLE,
  INTRO,
  SECTION_DISCLAIMER,
  SECTION_DOCKING,
  SECTION_DOCKING_HELPER,
  COL_ARTEFACT,
  COL_DOCKING,
  COL_RATIONALE,
  SECTION_PLAYBOOKS,
  SECTION_PLAYBOOKS_HELPER,
  COL_PATTERN,
  COL_REANCHOR,
  TRY_LABEL,
  TRY_PLACEHOLDER,
  NO_INTENT,
  SECTION_ARCHIMATE,
  SECTION_ARCHIMATE_HELPER,
  BACK_TO_PORTFOLIO,
]);

// Static labels for misuse intent rows. These are the user-facing
// pattern labels; they describe the phrasing shape, never the
// authority of any artefact. Asserted alongside the page labels.
const INTENT_LABEL: Readonly<Record<MisuseIntent, string>> = {
  MANDATING: "Phrasing that asserts an obligation",
  JUSTIFYING: "Phrasing that claims an artefact provides grounds",
  EVALUATING: "Phrasing that compares or judges options",
  TRIGGERING: "Phrasing that implies process initiation",
  NORMALISING: "Phrasing that names an institutional default",
};
assertAllTogafContainmentLanguage(MISUSE_INTENTS.map((i) => INTENT_LABEL[i]));

// Static labels for docking-class column. Asserted alongside.
const DOCKING_LABEL: Readonly<Record<DockingClass, string>> = {
  REFERENCE_ONLY: "REFERENCE_ONLY",
  INTERPRETIVE_ATTACHMENT: "INTERPRETIVE_ATTACHMENT",
  FORBIDDEN: "FORBIDDEN",
};
assertAllTogafContainmentLanguage(Object.values(DOCKING_LABEL));

export default function Containment() {
  const [phrase, setPhrase] = useState("");
  const detected = detectMisuseIntent(phrase);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader icon={Shield} title={PAGE_TITLE} />

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-8 space-y-6">
        <Card data-testid="containment-intro" className="border-border bg-muted/30">
          <CardContent className="py-4 text-xs leading-relaxed text-muted-foreground">
            {INTRO}
          </CardContent>
        </Card>

        <Card data-testid="containment-disclaimer">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {SECTION_DISCLAIMER}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className="text-xs italic text-muted-foreground leading-relaxed"
              data-testid="mandatory-disclaimer"
            >
              {MANDATORY_NON_AUTHORITY_DISCLAIMER}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="containment-docking">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {SECTION_DOCKING}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <p className="text-muted-foreground mb-3">
              {SECTION_DOCKING_HELPER}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">{COL_ARTEFACT}</th>
                    <th className="py-2 pr-4 font-semibold">{COL_DOCKING}</th>
                    <th className="py-2 font-semibold">{COL_RATIONALE}</th>
                  </tr>
                </thead>
                <tbody>
                  {TOGAF_ARTEFACT_DOCKING.map((row) => (
                    <tr
                      key={row.artefact}
                      className="border-b border-border/30 align-top"
                      data-testid={`docking-row-${row.artefact.replace(/\s+/g, "-").toLowerCase()}`}
                    >
                      <td className="py-2 pr-4">{row.artefact}</td>
                      <td className="py-2 pr-4 font-bold">
                        {DOCKING_LABEL[row.dockingClass]}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {row.rationale}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="containment-playbooks">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {SECTION_PLAYBOOKS}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-4">
            <p className="text-muted-foreground">{SECTION_PLAYBOOKS_HELPER}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">{COL_PATTERN}</th>
                    <th className="py-2 font-semibold">{COL_REANCHOR}</th>
                  </tr>
                </thead>
                <tbody>
                  {MISUSE_INTENTS.map((intent) => (
                    <tr
                      key={intent}
                      className="border-b border-border/30 align-top"
                      data-testid={`playbook-row-${intent.toLowerCase()}`}
                    >
                      <td className="py-2 pr-4">{INTENT_LABEL[intent]}</td>
                      <td className="py-2 text-muted-foreground">
                        {CORRECTION_LANGUAGE[intent]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/30">
              <Label
                htmlFor="containment-try"
                className="text-[10px] uppercase tracking-widest text-muted-foreground"
              >
                {TRY_LABEL}
              </Label>
              <Input
                id="containment-try"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={TRY_PLACEHOLDER}
                data-testid="input-try-phrase"
              />
              <p
                className="text-xs text-muted-foreground italic min-h-[1.25rem]"
                data-testid="try-phrase-result"
              >
                {detected !== null
                  ? CORRECTION_LANGUAGE[detected]
                  : phrase.trim().length > 0
                    ? NO_INTENT
                    : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="containment-archimate">
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider">
              {SECTION_ARCHIMATE}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {SECTION_ARCHIMATE_HELPER}
          </CardContent>
        </Card>

        <div className="pt-2">
          <Link href="/portfolio">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              data-testid="link-back-portfolio"
            >
              <Layout className="w-3.5 h-3.5" /> {BACK_TO_PORTFOLIO}
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}

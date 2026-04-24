import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import DecisionCanvasShell from "@/components/DecisionCanvasShell";
import Portfolio from "@/pages/Portfolio";
import Signals from "@/pages/Signals";
import Reflection from "@/pages/Reflection";
import Exposure from "@/pages/Exposure";
import Containment from "@/pages/Containment";
import ContextDomain from "@/pages/acw/views/ContextDomain";
import SystemLandscape from "@/pages/acw/views/SystemLandscape";
import IntegrationView from "@/pages/acw/views/Integration";
import Deployment from "@/pages/acw/views/Deployment";
import OperationsContinuity from "@/pages/acw/views/OperationsContinuity";
import CtadEntry from "@/pages/ctad/CtadEntry";
import CtadShell from "@/pages/ctad/CtadShell";
import CtadArchitectureShell from "@/pages/ctad/CtadArchitectureShell";
import Track3Entry from "@/pages/acw/track3/Track3Entry";
import Track3Shell from "@/pages/acw/track3/Track3Shell";
// Phase 6 — module-load side effect: importing this module runs the
// negative-invariant assertions that fail the application bundle if
// any forbidden surface (structured ADC export, computed lifecycle
// field, override mechanism) is re-introduced.
import "@/governance/togafContainmentInvariants.test-shape";
// Phase 2 (decouple ADC ↔ architectures) — module-load side effect:
// the architecture-attachment store carries its own schema-version
// lock, idempotency / many-to-many / empty-leak probe, and
// malformed-id rejection. Importing it here fails the bundle if
// any of those guarantees regress.
import "@/governance/architectureAttachmentInvariants.test-shape";
// ACW Workspace Builder — module-load side effects: hook stubs and
// the build-time isolation invariant that fails the bundle if any
// ACW source file imports from the Decision Canvas decision pipeline.
import "@/acw/acwGrammarHooks";
import "@/acw/acwIsolationInvariants.test-shape";
// ACW v1 grammar invariants — fail the bundle if the canonical
// element registry, validator, or schema version drifts from the
// constitutional shape locked at v1 (Task #49 / master prompt §13).
import "@/acw/acwGrammarInvariants.test-shape";
// ACW v3 — structural-identity + forbidden-semantics invariants for
// the 3D canvas. They fail the bundle if 2D and 3D ever diverge in
// what they enumerate, or if the 3D renderer regresses toward
// judgemental / animated semantics.
import "@/acw/acw3DStructureInvariants.test-shape";
import "@/acw/acw3DForbiddenSemantics.test-shape";
// CTAD module — module-load side effects: build-time isolation
// invariant (CTAD source must not import from ADC pipeline modules
// or write helpers of the portfolio store) and grammar invariant
// (parameter registry shape locked at "ctad-1.0").
import "@/ctad/ctadIsolationInvariants.test-shape";
import "@/ctad/ctadGrammarInvariants.test-shape";
// CNCF reference catalog — module-load side effects: build-time
// isolation invariant (no decision-pipeline imports, no fetch /
// dynamic import — the catalog is bundled, never fetched) and
// catalog validation (every binding hint targets a paramId /
// option that exists in the live CTAD registry).
import "@/cncf/cncfIsolationInvariants.test-shape";
import "@/diagramspec/diagramspecIsolationInvariants.test-shape";
import "@/cncf/cncfCatalog";
import "@/components/ctad/quotedSourceBoundary.test-shape";
// ACW Track 3 — module-load side effects: build-time isolation
// (allowlist + denylist + read-only named-import scan), structural
// identity (both renderers consume `enumerateLensVisibility`),
// forbidden semantics (no animation / judgement / traffic-light /
// recommendation tokens), and derivation purity (deterministic,
// empty-in → empty-out, sensitive to input). Importing them here
// fails the bundle at load time if any Track 3 invariant regresses.
import "@/acw/track3/acwTrack3IsolationInvariants.test-shape";
import "@/acw/track3/acwTrack3StructureInvariants.test-shape";
import "@/acw/track3/acwTrack3ForbiddenSemantics.test-shape";
import "@/acw/track3/acwTrack3RendererIsolationInvariants.test-shape";
import "@/acw/track3/acwTrack3FocusIsolationInvariants.test-shape";
import "@/acw/track3/acwTrack3ViewPrefsInvariants.test-shape";

function DarkModeApplier() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/decision-canvas" component={DecisionCanvasShell} />
      <Route path="/portfolio" component={Portfolio} />
      <Route path="/signals" component={Signals} />
      <Route path="/reflection" component={Reflection} />
      <Route path="/exposure/:adsId" component={Exposure} />
      <Route path="/governance/containment" component={Containment} />
      <Route path="/workspace" component={ContextDomain} />
      <Route path="/workspace/context" component={ContextDomain} />
      <Route path="/workspace/landscape" component={SystemLandscape} />
      <Route path="/workspace/integration" component={IntegrationView} />
      <Route path="/workspace/deployment" component={Deployment} />
      <Route path="/workspace/operations" component={OperationsContinuity} />
      <Route path="/ctad" component={CtadEntry} />
      <Route path="/ctad/arch/:architectureId" component={CtadArchitectureShell} />
      <Route path="/ctad/:adsId/:adsVersion" component={CtadShell} />
      <Route path="/acw/derived" component={Track3Entry} />
      <Route path="/acw/derived/arch/:architectureId" component={Track3Shell} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <>
      <DarkModeApplier />
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </>
  );
}

export default App;

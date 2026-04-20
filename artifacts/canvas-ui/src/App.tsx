import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Wizard from "@/pages/Wizard";
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
// Phase 6 — module-load side effect: importing this module runs the
// negative-invariant assertions that fail the application bundle if
// any forbidden surface (structured ADC export, computed lifecycle
// field, override mechanism) is re-introduced.
import "@/governance/togafContainmentInvariants.test-shape";
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

function DarkModeApplier() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Wizard} />
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

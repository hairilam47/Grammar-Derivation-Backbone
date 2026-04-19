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
// Phase 6 — module-load side effect: importing this module runs the
// negative-invariant assertions that fail the application bundle if
// any forbidden surface (structured ADC export, computed lifecycle
// field, override mechanism) is re-introduced.
import "@/governance/togafContainmentInvariants.test-shape";

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

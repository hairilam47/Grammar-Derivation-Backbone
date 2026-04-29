import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppSidebar";
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
import StudioCanvas from "@/pages/acw/views/StudioCanvas";
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
// ACW v2 visual-invariant module — also carries the Phase 5
// boundParam / boundTechnologyCategory shape probes (see "(7)"
// inside that file).
import "@/acw/acwGrammarV2Invariants.test-shape";
// ACW Phase 5 — vendor-neutral icon-registry invariants. Fails
// the bundle if a brand / product name leaks into a registry entry
// or if the vendor denylist is silently weakened.
import "@/acw/icons/iconRegistryInvariants.test-shape";
// EAStudio Path B Phase 1 (Task #113) — palette-registry invariants.
// Fails the bundle if a tile-level `boundTechnologyCategory` no
// longer resolves through the icon registry, if a `boundParam`
// default ever lands with a malformed shape, or if Path B Phase 1
// coverage (a tile-level binding present in each of the data /
// application / technology domains) regresses.
import "@/acw/palette/paletteRegistryInvariants.test-shape";
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
// EAStudio Path B Phase 2 (LoS framework) — module-load side
// effects for the L3 carve-out: a build-time isolation invariant
// that limits `/src/acw/l3/` to a single named import from the
// CTAD store (plus types), and a generator-behaviour invariant
// that hard-fails the bundle if the L3 projector regresses on
// idempotency, on the no-orphan-recreate guarantee, or on the
// `lodRange: [3, 3]` contract every minted node must carry.
import "@/acw/l3/acwL3IsolationInvariants.test-shape";
import "@/acw/l3/acwL3GeneratorInvariants.test-shape";
// Stage A (ADC Wizard Retrofit) — module-load side effects for the
// three governance stores that back the requirements-capture
// foundation: schema-version locks (mod-1.0 / req-1.0 / rc-1.0),
// allow-list shape probes, draft-rule / approval-rule / freeze-
// rule enforcement, and idempotent-freeze guarantees. Each invariant
// uses an isolated localStorage snapshot so it does not perturb
// user data when it runs at bundle startup.
import "@/governance/moduleCatalogInvariants.test-shape";
import "@/governance/requirementsStoreInvariants.test-shape";
import "@/governance/requirementsContractStoreInvariants.test-shape";

// Dev-only deterministic seed page (Task #119). Both the lazy
// import expression and the route registration are gated on
// `import.meta.env.DEV`. Vite replaces `import.meta.env.DEV` with
// a literal `false` at production build time, which lets Rollup
// dead-code-eliminate the entire ternary branch — including the
// dynamic `import()` that would otherwise emit a separate chunk.
const SeedAllPage = import.meta.env.DEV
  ? lazy(() => import("@/dev/SeedAllPage"))
  : null;

// Dev-only seeder determinism invariant (Task #119). Loaded via a
// dynamic `import()` inside an `import.meta.env.DEV` guard so the
// production bundle dead-code-eliminates both the import call and
// every transitive byte of the seeder. The probe runs once at
// module load (browser only), snapshots the seeded keys, runs
// `seedAll` twice, asserts byte-identical persisted state across
// both runs, and restores the original snapshot.
if (import.meta.env.DEV) {
  void import("@/dev/seedAllInvariants.test-shape");
}

function DarkModeApplier() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}

// Route-fade transition wrapper. Re-keys on every wouter location
// change so the inner subtree re-mounts and the keyframed
// `route-fade-in` animation replays. The animation itself is defined
// in src/index.css and is collapsed to 0ms under
// `prefers-reduced-motion: reduce`.
function RouteTransition({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div key={location} className="route-fade-in">
      {children}
    </div>
  );
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
      <Route path="/workspace/studio" component={StudioCanvas} />
      <Route path="/ctad" component={CtadEntry} />
      <Route path="/ctad/arch/:architectureId" component={CtadArchitectureShell} />
      <Route path="/ctad/:adsId/:adsVersion" component={CtadShell} />
      <Route path="/acw/derived" component={Track3Entry} />
      <Route path="/acw/derived/arch/:architectureId" component={Track3Shell} />
      {import.meta.env.DEV && SeedAllPage !== null && (
        <Route path="/seed-all">
          <Suspense fallback={null}>
            <SeedAllPage />
          </Suspense>
        </Route>
      )}
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
          <AppShell>
            <RouteTransition>
              <Router />
            </RouteTransition>
          </AppShell>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </>
  );
}

export default App;

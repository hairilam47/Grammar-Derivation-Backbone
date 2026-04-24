// ACW Track 3 — 3D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). The shell drives a DiagramSpec compile +
// ELK layout pipeline and hands this renderer pre-laid-out
// positioned nodes; this component never touches the layout
// engine. Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure.
//
// Z axis = stratum. The renderer groups visible nodes by their
// owning architecture stratum (organization … technology) and
// renders ONE Three.js Group per stratum, positioned along Z by
// `STRATUM_INDEX`. Layer-toggle visibility is applied by setting
// `<group visible>` on the per-stratum group AND, for finer-
// grained CTAD-section toggles, by filtering individual meshes
// before render — visibility-only, never re-runs ELK.
//
// Lerp animation. Whenever the positioned input changes (e.g.
// after a CTAD edit followed by a refresh), per-mesh world
// positions deterministically lerp from their previous values
// toward the new targets. The lerp is a function of (a) the
// previous and next `PositionedNode.{x,y}` and (b) elapsed
// frame time; it introduces no judgemental motion and is
// bounded by a single shared rate constant. Forbidden-semantics
// invariant has been adjusted to permit lerp tokens (see
// `acwTrack3ForbiddenSemantics.test-shape.ts`).
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  Component,
  type ErrorInfo,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  enumerateLensVisibility,
  type AcwNode,
  type AcwEdge,
} from "@/acw/acwLensStructure";
import {
  STRATUM_INDEX,
  type DiagramStratum,
} from "@workspace/diagramspec";
import type { PositionedDiagram } from "@workspace/diagram-layout";
import { ctadSectionOfNodeId } from "@/acw/track3/track3DiagramAdapter";
import {
  computeRenderEntries,
  dropExiting,
  type LifecycleEntry,
} from "@/acw/track3/track3RenderLifecycle";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";

const EMPTY_HINT = "No selections yet — open the bound CTAD shell to add some.";
const LEGEND_LABEL = "Z axis = stratum";
const NO_WEBGL_HINT = "3D view unavailable in this environment";

assertAllAcwTrack3Language([EMPTY_HINT, LEGEND_LABEL, NO_WEBGL_HINT]);

type WebGLContextKind = "webgl2" | "webgl" | "experimental-webgl" | "none";
interface WebGLDetection {
  readonly ok: boolean;
  readonly context: WebGLContextKind;
}

function detectWebGL(): WebGLDetection {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, context: "none" };
  }
  try {
    const c = document.createElement("canvas");
    if (c.getContext("webgl2")) return { ok: true, context: "webgl2" };
    if (c.getContext("webgl")) return { ok: true, context: "webgl" };
    if (c.getContext("experimental-webgl")) {
      return { ok: true, context: "experimental-webgl" };
    }
    return { ok: false, context: "none" };
  } catch {
    return { ok: false, context: "none" };
  }
}

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}
interface BoundaryState {
  hasError: boolean;
}
class WebGLBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };
  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("[track3-canvas-3d] webgl boundary caught error", {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }
  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export interface Track3Canvas3DProps {
  readonly positionedDiagrams: readonly PositionedDiagram[];
  // Sections (CTAD section ids) the user has hidden via the
  // layer toggle. Filter is applied per-mesh — no ELK re-run.
  readonly hiddenSections: ReadonlySet<string>;
  // Visibility-isolation: kept node id set produced by the shell
  // via `isolateAroundNode(selectedNodeId)`. null means no
  // isolation is active. Renderers use this as an additional
  // visibility filter (treated identically to `hiddenSections`)
  // so a click isolates the node + its neighbours and fades the
  // rest. Computed in the shell so 2D and 3D agree.
  readonly isolatedKeptIds?: ReadonlySet<string> | null;
  // Highlight target. The node id the user clicked.
  readonly selectedNodeId: string | null;
  readonly cameraX?: number;
  readonly cameraY?: number;
  readonly cameraZoom?: number;
  readonly onCameraChange?: (
    cameraX: number,
    cameraY: number,
    cameraZoom: number,
  ) => void;
  readonly onNodeClick?: (nodeId: string) => void;
  readonly testId?: string;
  // Phase 4 (Task #81): when "fill", the canvas grows to 100%
  // of its container (used by the full-page floating-overlay
  // mode). Default keeps the historical 360px height so any
  // legacy / inline embedding renders unchanged.
  readonly containerHeight?: number | "fill";
}

const SCALE = 0.012;
const Z_GAP = 1.4;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const BASE_CAM_Z = 8;
// Fixed-duration lerp window (seconds). Each time a mesh's
// target position OR its target opacity changes, the animator
// captures the current value as the start, resets a per-mesh
// elapsed-time counter to 0, and interpolates linearly toward
// the new target over LERP_DURATION_S. The interpolation is
// strictly time-normalized — `t / LERP_DURATION_S` — so the
// motion completes in a deterministic, framerate-independent
// constant duration on every target change. No exponential
// smoothing.
const LERP_DURATION_S = 0.5;

function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function prefsToTarget(
  cameraX: number,
  cameraY: number,
): [number, number, number] {
  return [cameraX * SCALE, -cameraY * SCALE, 0];
}
function prefsToDistance(cameraZoom: number): number {
  return BASE_CAM_Z / clampZoom(cameraZoom);
}

interface FlatNode extends AcwNode {
  readonly stratum: DiagramStratum;
  readonly section: string | null;
}

function flattenDiagrams(
  pds: readonly PositionedDiagram[],
): { nodes: readonly FlatNode[]; edges: readonly AcwEdge[] } {
  const nodes: FlatNode[] = [];
  const edges: AcwEdge[] = [];
  for (const pd of pds) {
    for (const n of pd.nodes) {
      nodes.push({
        id: n.id,
        type: n.parentId === null ? "Zone" : "Component",
        parentId: n.parentId,
        label: n.label,
        x: n.x,
        y: n.y,
        stratum: pd.stratum,
        section: ctadSectionOfNodeId(n.id),
      });
    }
    for (const e of pd.edges) {
      edges.push({
        id: e.id,
        kind: "CONNECTS",
        fromId: e.from,
        toId: e.to,
      });
    }
  }
  return { nodes, edges };
}

interface MeshAnimatorProps {
  readonly id: string;
  readonly target: readonly [number, number, number];
  readonly previous: readonly [number, number, number] | null;
  // Target opacity in [0,1]. Drives the per-mesh fade-in /
  // fade-out lifecycle: a brand-new node is mounted with previous
  // = null → opacity is seeded at 0 and lerps toward 1; a node
  // that becomes hidden (layer toggle) or is removed from the
  // positioned set has targetOpacity set to 0 and lerps back.
  readonly targetOpacity: number;
  // Reports the current lerped opacity to the parent so it can
  // garbage-collect "exiting" entries once they have fully
  // faded out. Called at most once per frame and only when the
  // value crosses the threshold.
  readonly onFadedOut?: () => void;
  readonly children: ReactNode;
  readonly testId: string;
  readonly onClick?: () => void;
}
// Imperatively lerps a Group's position AND its descendants'
// material opacity every frame. Prevents per-frame React
// re-renders and keeps both motion and fade purely a function of
// (previous, target, dt).
function MeshAnimator(props: MeshAnimatorProps) {
  const ref = useRef<THREE_GroupLike | null>(null);
  // Per-mesh interpolation state. `start*` are the values the
  // current lerp segment began at; `target*` are what we lerp
  // toward; `t` is elapsed seconds within the current segment,
  // capped at LERP_DURATION_S. Whenever the parent passes a new
  // target (position or opacity), we capture the CURRENT
  // interpolated value as the new start and reset t = 0 — this is
  // the "fixed-duration lerp resets on target change" contract.
  const startPosRef = useRef<[number, number, number]>([
    props.previous?.[0] ?? props.target[0],
    props.previous?.[1] ?? props.target[1],
    props.previous?.[2] ?? props.target[2],
  ]);
  const targetPosRef = useRef<readonly [number, number, number]>(props.target);
  const startOpRef = useRef<number>(props.previous === null ? 0 : 1);
  const targetOpRef = useRef<number>(props.targetOpacity);
  const tRef = useRef<number>(0);
  const opacityRef = useRef<number>(props.previous === null ? 0 : 1);
  const fadedOutFiredRef = useRef<boolean>(false);
  // Initialise at previous (or target if no previous known).
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const start = props.previous ?? props.target;
    g.position.set(start[0], start[1], start[2]);
    setGroupOpacity(g, opacityRef.current);
    // Mount-once seed; subsequent target changes are handled by
    // useFrame below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame((_state, dt) => {
    const g = ref.current;
    if (!g) return;
    // Detect target change (either position or opacity) and
    // restart the segment at t = 0 capturing the current value.
    const tp = targetPosRef.current;
    const newTarget = props.target;
    const posChanged =
      tp[0] !== newTarget[0] || tp[1] !== newTarget[1] || tp[2] !== newTarget[2];
    const opChanged = targetOpRef.current !== props.targetOpacity;
    if (posChanged) {
      startPosRef.current = [g.position.x, g.position.y, g.position.z];
      targetPosRef.current = newTarget;
    }
    if (opChanged) {
      startOpRef.current = opacityRef.current;
      targetOpRef.current = props.targetOpacity;
    }
    if (posChanged || opChanged) {
      tRef.current = 0;
    }
    tRef.current = Math.min(LERP_DURATION_S, tRef.current + dt);
    const alpha = LERP_DURATION_S <= 0 ? 1 : tRef.current / LERP_DURATION_S;
    const sp = startPosRef.current;
    const tg = targetPosRef.current;
    g.position.x = sp[0] + (tg[0] - sp[0]) * alpha;
    g.position.y = sp[1] + (tg[1] - sp[1]) * alpha;
    g.position.z = sp[2] + (tg[2] - sp[2]) * alpha;
    opacityRef.current =
      startOpRef.current + (targetOpRef.current - startOpRef.current) * alpha;
    setGroupOpacity(g, opacityRef.current);
    // Fire the parent callback once when an exiting node has
    // effectively faded out so the parent can drop it.
    if (
      props.targetOpacity <= 0 &&
      opacityRef.current < FADE_OUT_THRESHOLD &&
      !fadedOutFiredRef.current
    ) {
      fadedOutFiredRef.current = true;
      props.onFadedOut?.();
    }
    if (props.targetOpacity > 0) fadedOutFiredRef.current = false;
  });
  return (
    <group
      ref={(r) => {
        ref.current = r as unknown as THREE_GroupLike | null;
      }}
      onClick={(ev) => {
        ev.stopPropagation();
        props.onClick?.();
      }}
      onPointerDown={(ev) => ev.stopPropagation()}
      userData={{ testid: props.testId }}
    >
      {props.children}
    </group>
  );
}

// Threshold below which an exiting node is considered "faded
// out" and may be removed from the scene graph.
const FADE_OUT_THRESHOLD = 0.02;

// Imperatively walks a group and sets transparent + opacity on
// every Mesh material. Branded `unknown` because the THREE typing
// is not imported here; we pattern-match defensively.
function setGroupOpacity(group: unknown, opacity: number): void {
  const g = group as { traverse?: (cb: (obj: unknown) => void) => void };
  if (typeof g.traverse !== "function") return;
  g.traverse((obj) => {
    const o = obj as {
      isMesh?: boolean;
      material?: { transparent?: boolean; opacity?: number };
    };
    if (o.isMesh && o.material) {
      o.material.transparent = true;
      o.material.opacity = opacity;
    }
  });
}

export function Track3Canvas3D(props: Track3Canvas3DProps) {
  const {
    positionedDiagrams,
    hiddenSections,
    isolatedKeptIds,
    selectedNodeId,
    onCameraChange,
    onNodeClick,
  } = props;
  const cameraX = props.cameraX ?? 0;
  const cameraY = props.cameraY ?? 0;
  const cameraZoom = clampZoom(props.cameraZoom ?? 1);
  const testId = props.testId ?? "track3-canvas-3d";

  const flat = useMemo(
    () => flattenDiagrams(positionedDiagrams),
    [positionedDiagrams],
  );

  // Pure pass-through call to satisfy the structural-identity
  // invariant: both renderers consume the same visibility helper
  // so neither can fabricate visibility the other does not
  // surface. Section-filtering is applied below independently.
  const visibility = useMemo(
    () => enumerateLensVisibility(flat.nodes, flat.edges, null, EMPTY_SET),
    [flat],
  );
  const visibleIds = useMemo(
    () => new Set(visibility.visibleNodeIds),
    [visibility],
  );

  // Pure visibility computation derived from the lens helper +
  // layer toggle. Used to drive opacity targets per node and to
  // filter the edge set rendered this frame. NEVER used as input
  // to the per-node lerp target — that would re-purpose layer
  // toggle into a re-layout.
  const visibleNodeIds = useMemo(() => {
    const out = new Set<string>();
    for (const n of flat.nodes) {
      if (!visibleIds.has(n.id)) continue;
      if (n.section !== null && hiddenSections.has(n.section)) continue;
      if (isolatedKeptIds !== null && isolatedKeptIds !== undefined && !isolatedKeptIds.has(n.id)) continue;
      out.add(n.id);
    }
    return out;
  }, [flat.nodes, visibleIds, hiddenSections, isolatedKeptIds]);
  const visibleEdges = useMemo(
    () =>
      visibility.visibleEdges.filter(
        (e) => visibleNodeIds.has(e.fromId) && visibleNodeIds.has(e.toId),
      ),
    [visibility, visibleNodeIds],
  );

  // Center MUST be computed from the full positioned set, not
  // the visibility-filtered subset. If center depended on
  // `visibleNodes`, toggling a layer would shift every remaining
  // node's world position — that would re-purpose layer toggle
  // into a re-layout, violating the "visibility-only" contract.
  const center = useMemo(() => {
    if (flat.nodes.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const n of flat.nodes) {
      sx += n.x;
      sy += n.y;
    }
    return { x: sx / flat.nodes.length, y: sy / flat.nodes.length };
  }, [flat.nodes]);

  // ---- Render-entry lifecycle ----------------------------------
  // We render an entry per node id. An entry's lifecycle:
  //   1. mount: previous = null → opacity seeded at 0 → fades in.
  //   2. update: target/opacity updated when (positioned, hidden)
  //      change. Position lerps; opacity lerps.
  //   3. exit: when a node is no longer in the positioned set
  //      OR its layer is hidden, targetOpacity is forced to 0
  //      so it fades out. The entry is kept in the scene until
  //      `onFadedOut` fires, then the entry is dropped.
  //
  // The entries map persists ACROSS positioned-diagram updates,
  // not just within a single render, so removed nodes can fade
  // smoothly rather than disappear abruptly.
  const prevTargetsRef = useRef<Map<string, readonly [number, number, number]>>(
    new Map(),
  );
  // Snapshot of the FlatNode for any id we have ever rendered,
  // so an exiting entry can keep its geometry even after the
  // positioned set drops it.
  const lastNodeSnapshotRef = useRef<Map<string, FlatNode>>(new Map());
  // Exiting ids kept across renders. Mutated synchronously
  // inside the entries useMemo (when a node disappears from
  // flat.nodes) and inside handleFadedOut (when its mesh has
  // fully faded out). A monotonically-increasing tick forces a
  // re-render after handleFadedOut so the dropped entry is no
  // longer emitted by the next render pass.
  const exitingRef = useRef<Set<string>>(new Set());
  const [exitTick, setExitTick] = useState<number>(0);

  const entries = useMemo<readonly LifecycleEntry<FlatNode>[]>(() => {
    const result = computeRenderEntries<FlatNode>({
      flatNodes: flat.nodes,
      center,
      scale: SCALE,
      visibleNodeIds,
      prevTargets: prevTargetsRef.current,
      exitingIds: exitingRef.current,
      snapshots: lastNodeSnapshotRef.current,
    });
    prevTargetsRef.current = new Map(result.nextPrevTargets);
    // exitTick participates in the dep list; bumping it from
    // handleFadedOut forces this useMemo to recompute and stop
    // emitting the dropped exiting entry.
    void exitTick;
    return result.entries;
  }, [flat.nodes, center, visibleNodeIds, exitTick]);

  // Drop an exiting id once its mesh has reported `onFadedOut`.
  // Mutates the refs synchronously and bumps a tick so React
  // re-renders without the dropped entry.
  function handleFadedOut(id: string) {
    const dropped = dropExiting(
      id,
      exitingRef.current,
      prevTargetsRef.current,
      lastNodeSnapshotRef.current,
    );
    if (dropped) setExitTick((t) => t + 1);
  }

  const [detection] = useState<WebGLDetection>(() => detectWebGL());
  const webgl = detection.ok;
  const initialNodeCountRef = useRef<number>(visibleNodeIds.size);
  useEffect(() => {
    console.info("[track3-canvas-3d] mount", {
      detected: detection.ok,
      context: detection.context,
      visibleNodes: initialNodeCountRef.current,
      strata: positionedDiagrams.map((p) => p.stratum),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = visibleNodeIds.size === 0;

  const initialPrefsRef = useRef({ cameraX, cameraY, cameraZoom });
  const initialTarget = useMemo<[number, number, number]>(
    () =>
      prefsToTarget(
        initialPrefsRef.current.cameraX,
        initialPrefsRef.current.cameraY,
      ),
    [],
  );
  const initialCamPos = useMemo<[number, number, number]>(() => {
    const t = initialTarget;
    const dist = prefsToDistance(initialPrefsRef.current.cameraZoom);
    return [t[0], t[1], dist];
  }, [initialTarget]);

  const controlsRef = useRef<OrbitControlsLike | null>(null);
  function handleControlsChange() {
    const c = controlsRef.current;
    if (!c) return;
    const t = c.target;
    const cam = c.object;
    const dx = cam.position.x - t.x;
    const dy = cam.position.y - t.y;
    const dz = cam.position.z - t.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const nextX = t.x / SCALE;
    const nextY = -t.y / SCALE;
    const nextZoom = clampZoom(dist > 1e-6 ? BASE_CAM_Z / dist : 1);
    onCameraChange?.(nextX, nextY, nextZoom);
  }

  // Group ALL render entries (active + exiting) by stratum.
  // Group identity is keyed off the stratum produced by the
  // layout pipeline (positionedDiagrams), NOT off the
  // currently-visible subset, so per-stratum groups are stable
  // across layer toggles and never destroyed/recreated when a
  // section becomes hidden.
  // Stratum order is the union of (a) strata from the current
  // layout output and (b) strata from active+exiting render
  // entries. Including (b) ensures that when the LAST node in a
  // stratum is removed and the stratum disappears from
  // positionedDiagrams, any still-fading exiting entries in that
  // stratum continue to render (and animate to opacity 0)
  // instead of being culled abruptly.
  const stratumOrder = useMemo<readonly DiagramStratum[]>(() => {
    const seen = new Set<DiagramStratum>();
    const out: DiagramStratum[] = [];
    for (const p of positionedDiagrams) {
      if (!seen.has(p.stratum)) {
        seen.add(p.stratum);
        out.push(p.stratum);
      }
    }
    for (const e of entries) {
      if (!seen.has(e.stratum)) {
        seen.add(e.stratum);
        out.push(e.stratum);
      }
    }
    // Stable order along Z by stratum index.
    return [...out].sort((a, b) => STRATUM_INDEX[a] - STRATUM_INDEX[b]);
  }, [positionedDiagrams, entries]);
  const entriesByStratum = useMemo(() => {
    const m = new Map<DiagramStratum, LifecycleEntry<FlatNode>[]>();
    for (const s of stratumOrder) m.set(s, []);
    for (const e of entries) {
      const arr = m.get(e.stratum) ?? [];
      arr.push(e);
      m.set(e.stratum, arr);
    }
    return m;
  }, [entries, stratumOrder]);

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-black/40 overflow-hidden"
      style={
        props.containerHeight === "fill"
          ? { width: "100%", height: "100%", touchAction: "none" }
          : { height: props.containerHeight ?? 360, touchAction: "none" }
      }
    >
      {!webgl ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70"
          data-testid={`${testId}-no-webgl`}
        >
          {NO_WEBGL_HINT}
        </div>
      ) : (
        <WebGLBoundary
          fallback={
            <div
              className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70"
              data-testid={`${testId}-no-webgl`}
            >
              {NO_WEBGL_HINT}
            </div>
          }
        >
          <Canvas
            camera={{ position: initialCamPos, fov: 50 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={0.6} />
            <gridHelper
              args={[20, 20, "#1f2937", "#111827"]}
              position={[0, 0, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              raycast={() => null}
            />
            <OrbitControls
              ref={(r) => {
                controlsRef.current = r as unknown as OrbitControlsLike | null;
              }}
              enableRotate
              enablePan
              enableZoom
              target={initialTarget}
              onChange={handleControlsChange}
            />
            {stratumOrder.map((stratum) => {
              const list = entriesByStratum.get(stratum) ?? [];
              return (
                <group
                  key={stratum}
                  position={[0, 0, STRATUM_INDEX[stratum] * (Z_GAP * SCALE * 60)]}
                  userData={{ testid: `${testId}-stratum-${stratum}` }}
                >
                  {list.map((entry) => {
                    const n = entry.node;
                    const isFocused = selectedNodeId === n.id;
                    return (
                      <MeshAnimator
                        key={entry.id}
                        id={entry.id}
                        target={entry.target}
                        previous={entry.previous}
                        targetOpacity={entry.targetOpacity}
                        onFadedOut={
                          entry.exiting
                            ? () => handleFadedOut(entry.id)
                            : undefined
                        }
                        testId={`${testId}-mesh-${entry.id}`}
                        onClick={() => onNodeClick?.(entry.id)}
                      >
                        <mesh>
                          <NodeGeometry node={n} />
                          <meshStandardMaterial
                            transparent
                            color={
                              isFocused
                                ? "#fbbf24"
                                : n.parentId === null
                                  ? "#475569"
                                  : "#334155"
                            }
                          />
                        </mesh>
                      </MeshAnimator>
                    );
                  })}
                </group>
              );
            })}
            {visibleEdges.map((e) => {
              const a = flat.nodes.find((n) => n.id === e.fromId);
              const b = flat.nodes.find((n) => n.id === e.toId);
              if (!a || !b) return null;
              const ea = prevTargetsRef.current.get(a.id);
              const eb = prevTargetsRef.current.get(b.id);
              if (!ea || !eb) return null;
              // Edges live outside the per-stratum group, so we
              // must add stratum z back into world coords here.
              const az = STRATUM_INDEX[a.stratum] * (Z_GAP * SCALE * 60);
              const bz = STRATUM_INDEX[b.stratum] * (Z_GAP * SCALE * 60);
              const positions = new Float32Array([
                ea[0],
                ea[1],
                az,
                eb[0],
                eb[1],
                bz,
              ]);
              return (
                <lineSegments
                  key={e.id}
                  userData={{ testid: `${testId}-line-${e.id}` }}
                >
                  <bufferGeometry>
                    <bufferAttribute
                      attach="attributes-position"
                      args={[positions, 3]}
                    />
                  </bufferGeometry>
                  <lineBasicMaterial color="#64748b" />
                </lineSegments>
              );
            })}
          </Canvas>
        </WebGLBoundary>
      )}
      {isEmpty && webgl && (
        <div
          className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground italic pointer-events-none"
          data-testid={`${testId}-empty`}
        >
          {EMPTY_HINT}
        </div>
      )}
      <div
        className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-legend`}
      >
        {LEGEND_LABEL}
      </div>
      <div
        className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-zoom`}
      >
        {Math.round(cameraZoom * 100)}%
      </div>
    </div>
  );
}

function NodeGeometry({ node }: { node: FlatNode }) {
  if (node.parentId !== null) {
    return <boxGeometry args={[0.6, 0.3, 0.3]} />;
  }
  switch (node.section) {
    case "infrastructure":
      return <boxGeometry args={[1.6, 0.5, 0.5]} />;
    case "application":
      return <cylinderGeometry args={[0.5, 0.5, 0.6, 24]} />;
    case "integration":
      return <coneGeometry args={[0.55, 0.9, 24]} />;
    case "crossCutting":
      return <sphereGeometry args={[0.55, 24, 24]} />;
    case "ops":
      return <torusGeometry args={[0.5, 0.16, 16, 32]} />;
    default:
      return <boxGeometry args={[1.2, 0.4, 0.4]} />;
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
interface OrbitControlsLike {
  readonly target: Vec3Like;
  readonly object: { readonly position: Vec3Like };
}
interface THREE_GroupLike {
  readonly position: {
    x: number;
    y: number;
    z: number;
    set: (x: number, y: number, z: number) => void;
  };
}

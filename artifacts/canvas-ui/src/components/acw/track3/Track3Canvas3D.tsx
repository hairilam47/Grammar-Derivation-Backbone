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
  // Highlight target only. Visibility-isolation happens in the
  // shell; the helper is invoked here as a pure pass-through to
  // satisfy the structural-identity invariant (both 2D and 3D
  // surface the same node set).
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
}

const SCALE = 0.012;
const Z_GAP = 1.4;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const BASE_CAM_Z = 8;
// Lerp rate per second: at 60fps the mesh covers ~98% of its
// remaining delta in ~0.5s. Value is a constant so motion is
// reproducible across frames.
const LERP_RATE = 8;

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
  readonly children: ReactNode;
  readonly testId: string;
  readonly onClick?: () => void;
}
// Imperatively lerps a Group's position toward `target` every
// frame. Prevents per-frame React re-renders and keeps motion
// purely a function of (previous, target, dt).
function MeshAnimator(props: MeshAnimatorProps) {
  const ref = useRef<THREE_GroupLike | null>(null);
  // Initialise at previous (or target if no previous known).
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const start = props.previous ?? props.target;
    g.position.set(start[0], start[1], start[2]);
    // Mount-once seed; subsequent target changes are handled by
    // useFrame below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFrame((_state, dt) => {
    const g = ref.current;
    if (!g) return;
    const alpha = 1 - Math.exp(-LERP_RATE * dt);
    g.position.x += (props.target[0] - g.position.x) * alpha;
    g.position.y += (props.target[1] - g.position.y) * alpha;
    g.position.z += (props.target[2] - g.position.z) * alpha;
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

export function Track3Canvas3D(props: Track3Canvas3DProps) {
  const {
    positionedDiagrams,
    hiddenSections,
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

  // Apply layer-toggle filter on top — visibility-only, no
  // re-layout, no re-compile.
  const visibleNodes = useMemo(
    () =>
      flat.nodes.filter((n) => {
        if (!visibleIds.has(n.id)) return false;
        if (n.section !== null && hiddenSections.has(n.section)) return false;
        return true;
      }),
    [flat.nodes, visibleIds, hiddenSections],
  );
  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );
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

  // Track previous targets for the lerp seed. Keyed by node id.
  // Targets are computed for ALL positioned nodes (not just the
  // currently-visible subset) so that hiding/unhiding a layer
  // never alters per-node target positions and therefore never
  // triggers a lerp. Local target z is 0; stratum depth is
  // applied as a group transform below.
  const prevTargetsRef = useRef<Map<string, [number, number, number]>>(
    new Map(),
  );
  const targetByIdAndPrev = useMemo(() => {
    const out = new Map<
      string,
      {
        readonly target: [number, number, number];
        readonly previous: [number, number, number] | null;
      }
    >();
    for (const n of flat.nodes) {
      const x = (n.x - center.x) * SCALE;
      const y = -(n.y - center.y) * SCALE;
      const target: [number, number, number] = [x, y, 0];
      const previous = prevTargetsRef.current.get(n.id) ?? null;
      out.set(n.id, { target, previous });
    }
    // Snapshot for next pass.
    const next = new Map<string, [number, number, number]>();
    for (const [id, e] of out) next.set(id, e.target);
    prevTargetsRef.current = next;
    return out;
  }, [flat.nodes, center]);

  const [detection] = useState<WebGLDetection>(() => detectWebGL());
  const webgl = detection.ok;
  const initialNodeCountRef = useRef<number>(visibleNodes.length);
  useEffect(() => {
    console.info("[track3-canvas-3d] mount", {
      detected: detection.ok,
      context: detection.context,
      visibleNodes: initialNodeCountRef.current,
      strata: positionedDiagrams.map((p) => p.stratum),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = visibleNodes.length === 0;

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

  // Group visible nodes by stratum so each stratum gets its own
  // Three.js Group along Z.
  const nodesByStratum = useMemo(() => {
    const m = new Map<DiagramStratum, FlatNode[]>();
    for (const n of visibleNodes) {
      const arr = m.get(n.stratum) ?? [];
      arr.push(n);
      m.set(n.stratum, arr);
    }
    return m;
  }, [visibleNodes]);

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-black/40 overflow-hidden"
      style={{ height: 360, touchAction: "none" }}
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
            {Array.from(nodesByStratum.entries()).map(([stratum, ns]) => (
              <group
                key={stratum}
                position={[0, 0, STRATUM_INDEX[stratum] * (Z_GAP * SCALE * 60)]}
                userData={{ testid: `${testId}-stratum-${stratum}` }}
              >
                {ns.map((n) => {
                  const entry = targetByIdAndPrev.get(n.id);
                  if (!entry) return null;
                  const isFocused = selectedNodeId === n.id;
                  return (
                    <MeshAnimator
                      key={n.id}
                      id={n.id}
                      target={entry.target}
                      previous={entry.previous}
                      testId={`${testId}-mesh-${n.id}`}
                      onClick={() => onNodeClick?.(n.id)}
                    >
                      <mesh>
                        <NodeGeometry node={n} />
                        <meshStandardMaterial
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
            ))}
            {visibleEdges.map((e) => {
              const a = visibleNodes.find((n) => n.id === e.fromId);
              const b = visibleNodes.find((n) => n.id === e.toId);
              if (!a || !b) return null;
              const ea = targetByIdAndPrev.get(a.id);
              const eb = targetByIdAndPrev.get(b.id);
              if (!ea || !eb) return null;
              // Edges live outside the per-stratum group, so we
              // must add stratum z back into world coords here.
              const az = STRATUM_INDEX[a.stratum] * (Z_GAP * SCALE * 60);
              const bz = STRATUM_INDEX[b.stratum] * (Z_GAP * SCALE * 60);
              const positions = new Float32Array([
                ea.target[0],
                ea.target[1],
                az,
                eb.target[0],
                eb.target[1],
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

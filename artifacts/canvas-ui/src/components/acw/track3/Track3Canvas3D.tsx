// ACW Track 3 — 3D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure. Depth represents containment only:
// layer-root nodes sit at z = 0; their child param-value nodes
// sit at z = +1 inside the same XY footprint as their parent.
//
// Camera + navigation: the perspective camera is owned by drei's
// OrbitControls, which provides true 3D rotate + pan + zoom.
// View-prefs (cameraX / cameraY / cameraZoom) persist via the
// pre-existing per-binding storage key (`acw.track3.viewprefs.v1`)
// — this renderer does NOT change the schema. A pure mapping is
// applied between the three persisted numbers and the controls
// state:
//
//   target.x = cameraX * SCALE
//   target.y = -cameraY * SCALE     (Y flip preserves 2D pan sign)
//   distance = BASE_CAM_Z / cameraZoom
//
// On mount the camera + controls target are seeded from the
// initial prefs. On every controls change event the inverse
// mapping is fed back to `onCameraChange` so the shell persists
// the new triple. There are no per-frame hooks in our source
// (no useFrame, no setInterval, no requestAnimationFrame); the
// controls' onChange callback is event-driven.
//
// Why this also fixes the original "blank 3D" symptom on first
// switch from 2D: with the camera+target mapped from the same
// pan/zoom triple the 2D view writes, persisted 2D state
// always points the camera at the same scene region, never
// empty space.
//
// Focus / isolate: clicking a mesh fires `onNodeClick(id)`. The
// shell sets `focusedParentId` accordingly; the shared
// visibility helper isolates the node and its neighbours.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  Component,
  type ErrorInfo,
} from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  enumerateLensVisibility,
  type AcwNode,
  type AcwEdge,
} from "@/acw/acwLensStructure";
import {
  layerOfNodeId,
  type Track3Layer,
} from "@/acw/track3/track3Types";
import { assertAllAcwTrack3Language } from "@/governance/staticTextGuard";

const EMPTY_HINT = "No selections yet — open the bound CTAD shell to add some.";
const LEGEND_LABEL = "Depth = containment";
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
  readonly nodes: readonly AcwNode[];
  readonly edges: readonly AcwEdge[];
  readonly collapsedIds: ReadonlySet<string>;
  // Highlight target only. Visibility filtering happens in the
  // shell BEFORE this component is invoked (see Track3Shell);
  // the helper below is therefore called with focusedParentId
  // === null and simply enumerates everything in `nodes`/`edges`.
  // This keeps a single source of truth for "what is visible"
  // (the shell) and makes `enumerateLensVisibility` a pure
  // pass-through here.
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
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const BASE_CAM_Z = 8;

function clampZoom(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Pure mapping from persisted view-prefs to controls target +
// camera distance along the view axis. Kept inline for clarity.
function prefsToTarget(
  cameraX: number,
  cameraY: number,
): [number, number, number] {
  return [cameraX * SCALE, -cameraY * SCALE, 0];
}
function prefsToDistance(cameraZoom: number): number {
  return BASE_CAM_Z / clampZoom(cameraZoom);
}

interface LayerGeometryProps {
  readonly node: AcwNode;
}
function LayerGeometry({ node }: LayerGeometryProps) {
  // Param-value children keep the existing small box.
  if (node.parentId !== null) {
    return <boxGeometry args={[0.6, 0.3, 0.3]} />;
  }
  const layer: Track3Layer | null = layerOfNodeId(node.id);
  switch (layer) {
    case "infrastructure":
      return <boxGeometry args={[1.6, 0.5, 0.5]} />;
    case "application":
      return <cylinderGeometry args={[0.5, 0.5, 0.6, 24]} />;
    case "integration":
      return <coneGeometry args={[0.55, 0.9, 24]} />;
    case "crossCutting":
      return <sphereGeometry args={[0.55, 24, 24]} />;
    default:
      return <boxGeometry args={[1.2, 0.4, 0.4]} />;
  }
}

export function Track3Canvas3D(props: Track3Canvas3DProps) {
  const {
    nodes,
    edges,
    collapsedIds,
    selectedNodeId,
    onCameraChange,
    onNodeClick,
  } = props;
  const cameraX = props.cameraX ?? 0;
  const cameraY = props.cameraY ?? 0;
  const cameraZoom = clampZoom(props.cameraZoom ?? 1);
  const testId = props.testId ?? "track3-canvas-3d";

  const visibility = useMemo(
    // Visibility was already isolated in the shell; pass null so
    // the helper is a pure pass-through across the input set.
    () => enumerateLensVisibility(nodes, edges, null, collapsedIds),
    [nodes, edges, collapsedIds],
  );
  const visibleNodes: AcwNode[] = useMemo(() => {
    const ids = new Set(visibility.visibleNodeIds);
    return nodes.filter((n) => ids.has(n.id));
  }, [nodes, visibility]);
  const visibleEdges = visibility.visibleEdges;

  const center = useMemo(() => {
    if (visibleNodes.length === 0) return { x: 0, y: 0 };
    let sx = 0;
    let sy = 0;
    for (const n of visibleNodes) {
      sx += n.x;
      sy += n.y;
    }
    return { x: sx / visibleNodes.length, y: sy / visibleNodes.length };
  }, [visibleNodes]);

  const [detection] = useState<WebGLDetection>(() => detectWebGL());
  const webgl = detection.ok;
  const initialNodeCountRef = useRef<number>(visibleNodes.length);
  useEffect(() => {
    console.info("[track3-canvas-3d] mount", {
      detected: detection.ok,
      context: detection.context,
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "n/a",
      visibleNodes: initialNodeCountRef.current,
    });
    // Mount-only diagnostic; deliberately runs once per renderer instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = visibleNodes.length === 0;

  // Initial camera placement: read from prefs ONCE on mount via a
  // ref so user-driven prop updates do not re-seed the camera
  // mid-session. The shell forces a fresh mount when the bound
  // ADS changes by passing a key, so this is correct per binding.
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

  // OrbitControls ref so the change callback can read camera +
  // target back out and feed them through the inverse mapping.
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
            {/* Faint XY reference grid at z = 0; rotated into the
                XY plane and made non-interactive so node clicks
                still land on the meshes below. */}
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
            {visibleNodes.map((n) => {
              const x = (n.x - center.x) * SCALE;
              const y = -(n.y - center.y) * SCALE;
              const z = n.parentId === null ? 0 : 1;
              const isFocused = selectedNodeId === n.id;
              return (
                <mesh
                  key={n.id}
                  position={[x, y, z]}
                  onPointerDown={(ev) => {
                    ev.stopPropagation();
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onNodeClick?.(n.id);
                  }}
                  userData={{ testid: `${testId}-mesh-${n.id}` }}
                >
                  <LayerGeometry node={n} />
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
              );
            })}
            {visibleEdges.map((e) => {
              const a = visibleNodes.find((n) => n.id === e.fromId);
              const b = visibleNodes.find((n) => n.id === e.toId);
              if (!a || !b) return null;
              const ax = (a.x - center.x) * SCALE;
              const ay = -(a.y - center.y) * SCALE;
              const az = a.parentId === null ? 0 : 1;
              const bx = (b.x - center.x) * SCALE;
              const by = -(b.y - center.y) * SCALE;
              const bz = b.parentId === null ? 0 : 1;
              const positions = new Float32Array([ax, ay, az, bx, by, bz]);
              return (
                // `<lineSegments>` is used instead of `<line>` to
                // avoid the JSX intrinsic collision with the SVG
                // `<line>` element. Functionally identical for a
                // two-vertex segment: it renders THREE.LineSegments
                // with a `<bufferGeometry>` + `<lineBasicMaterial>`
                // and replaces the previous rotated-box edge mesh.
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

// Minimal structural shape of the OrbitControls instance we
// actually read from in `handleControlsChange`. Avoids pulling
// in concrete THREE.* types just for a ref read.
interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
interface OrbitControlsLike {
  readonly target: Vec3Like;
  readonly object: { readonly position: Vec3Like };
}

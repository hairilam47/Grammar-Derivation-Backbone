// ACW Track 3 — 3D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure. Depth represents containment only:
// layer-root nodes sit at z = 0; their child param-value nodes
// sit at z = +1 inside the same XY footprint as their parent.
//
// Camera + pan: the perspective camera is mounted once at a
// fixed `(0, 0, BASE_CAM_Z)` looking at the origin and never
// moves. Pan and zoom are applied to a `<group>` transform that
// wraps every mesh — `position = (-cameraX * SCALE, +cameraY *
// SCALE, 0)` and `scale = cameraZoom`. Wheel-zoom and drag-pan
// write back via `onCameraChange`; the shell updates the
// per-binding view-prefs and re-renders, which feeds the new
// transform values into the group on the next render.
//
// Why a group transform and not a live camera prop: R3F's
// `<Canvas camera={...}>` initialises the default camera on
// mount only, so updating `cameraX/Y/Zoom` afterwards would not
// move the view. Using a group keeps the prop static (correct
// at mount, never goes stale) and makes pan/zoom genuinely
// reactive without `useFrame`, `setInterval`, or
// `requestAnimationFrame` — pure render-time math.
//
// Why this also fixes the "blank 3D" symptom on first switch
// from 2D: the 2D and 3D views share `cameraX/Y/Zoom` in
// view-prefs, but the 2D values are in pixel-pan space. With
// the previous implementation the 3D camera was placed at
// `(cameraX * SCALE, -cameraY * SCALE, ...)` while the scene
// was recentered around its visible centroid, so any persisted
// 2D pan pointed the camera at empty space. With the camera
// fixed and the same numbers driving a group offset, persisted
// 2D pan now translates the scene by the same amount in scene
// units — at zoom 1 with cameraX=cameraY=0 the centroid sits
// dead-centre, and panning shifts the boxes exactly the way it
// does in 2D.
//
// Focus / isolate: clicking a mesh fires `onNodeClick(id)`. The
// shell sets `focusedParentId` accordingly; the shared
// visibility helper isolates the node and its neighbours.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type WheelEvent,
  Component,
  type ErrorInfo,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  enumerateLensVisibility,
  type AcwNode,
  type AcwEdge,
} from "@/acw/acwLensStructure";
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

  // The camera is mounted once at this fixed position and never
  // moves — pan/zoom are applied to a group transform below.
  // See the file-header comment for the rationale.
  const camPos = useMemo<[number, number, number]>(
    () => [0, 0, BASE_CAM_Z],
    [],
  );
  // Group transform: pan applied as scene translation (in scene
  // units, via SCALE), zoom applied as uniform scale. Sign of
  // `position.x` is negative because increasing `cameraX` in 2D
  // means "pan view to the right", which in this scene means
  // shifting the scene to the LEFT. `position.y` is positive
  // because the per-node Y is already flipped (`-(n.y - center.y)
  // * SCALE`), so increasing `cameraY` in 2D ("pan view down")
  // corresponds to translating the scene UP in scene-Y.
  const groupPos = useMemo<[number, number, number]>(
    () => [-cameraX * SCALE, cameraY * SCALE, 0],
    [cameraX, cameraY],
  );

  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startCamX: number;
    startCamY: number;
  } | null>(null);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startCamX: cameraX,
      startCamY: cameraY,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d || !d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // Drag delta in pixels → scene units (same axis convention as 2D).
    const next = {
      x: d.startCamX - dx / cameraZoom,
      y: d.startCamY - dy / cameraZoom,
    };
    onCameraChange?.(next.x, next.y, cameraZoom);
  }
  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (dragRef.current) dragRef.current.active = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }
  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clampZoom(cameraZoom * factor);
    if (next !== cameraZoom) {
      onCameraChange?.(cameraX, cameraY, next);
    }
  }

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-black/40 overflow-hidden"
      style={{ height: 360, touchAction: "none", cursor: "grab" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
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
            camera={{ position: camPos, fov: 50 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ambientLight intensity={0.5} />
            <pointLight position={[5, 5, 5]} intensity={0.4} />
            <group position={groupPos} scale={cameraZoom}>
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
                  <boxGeometry args={[1.6, 0.4, 0.4]} />
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
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;
              const mz = (az + bz) / 2;
              const dx = bx - ax;
              const dy = by - ay;
              const dz = bz - az;
              const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
              // Orient the box (which is built along the local
              // X axis with length=len) to point from a → b.
              // We compute a quaternion that rotates the unit
              // vector (1,0,0) onto the unit edge direction,
              // using axis = X × dir and angle = acos(X · dir).
              // This is a one-shot per-render computation (no
              // per-frame hooks, no animation), so it stays
              // within Track 3's "static, mechanical" envelope.
              let qx = 0;
              let qy = 0;
              let qz = 0;
              let qw = 1;
              if (len > 1e-9) {
                const tx = dx / len;
                const ty = dy / len;
                const tz = dz / len;
                // axis = (1,0,0) × (tx,ty,tz) = (0, -tz, ty)
                let axx = 0;
                let axy = -tz;
                let axz = ty;
                const axLen = Math.sqrt(
                  axx * axx + axy * axy + axz * axz,
                );
                if (axLen < 1e-9) {
                  // Edge is parallel to ±X; either no rotation
                  // (forward) or 180° around any perpendicular
                  // axis (backward). Pick Z as a stable choice.
                  if (tx >= 0) {
                    qx = 0;
                    qy = 0;
                    qz = 0;
                    qw = 1;
                  } else {
                    qx = 0;
                    qy = 0;
                    qz = 1;
                    qw = 0;
                  }
                } else {
                  axx /= axLen;
                  axy /= axLen;
                  axz /= axLen;
                  const cosT = Math.max(-1, Math.min(1, tx));
                  const angle = Math.acos(cosT);
                  const s = Math.sin(angle / 2);
                  qx = axx * s;
                  qy = axy * s;
                  qz = axz * s;
                  qw = Math.cos(angle / 2);
                }
              }
              return (
                <mesh
                  key={e.id}
                  position={[mx, my, mz]}
                  quaternion={[qx, qy, qz, qw]}
                  userData={{ testid: `${testId}-line-${e.id}` }}
                >
                  <boxGeometry args={[len, 0.02, 0.02]} />
                  <meshStandardMaterial color="#64748b" />
                </mesh>
              );
            })}
            </group>
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

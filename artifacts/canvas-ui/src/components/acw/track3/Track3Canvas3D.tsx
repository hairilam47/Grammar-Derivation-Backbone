// ACW Track 3 — 3D derived canvas.
//
// Reads only the props passed by the shell (no workspace hook,
// no store import). Computes visibility through the shared
// `enumerateLensVisibility` helper so the 2D and 3D renderers
// surface the same structure. Depth represents containment only:
// layer-root nodes sit at z = 0; their child param-value nodes
// sit at z = +1 inside the same XY footprint as their parent.
// No camera motion, no easing, no per-frame hooks.
import { useMemo, useState, type ReactNode, Component } from "react";
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

function detectWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl");
    return gl !== null;
  } catch {
    return false;
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
  componentDidCatch(): void {
    // intentional no-op
  }
  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export interface Track3Canvas3DProps {
  readonly nodes: readonly AcwNode[];
  readonly edges: readonly AcwEdge[];
  readonly collapsedIds: ReadonlySet<string>;
  readonly focusedParentId: string | null;
  readonly testId?: string;
}

const SCALE = 0.012;

export function Track3Canvas3D(props: Track3Canvas3DProps) {
  const { nodes, edges, collapsedIds, focusedParentId } = props;
  const testId = props.testId ?? "track3-canvas-3d";

  const visibility = useMemo(
    () => enumerateLensVisibility(nodes, edges, focusedParentId, collapsedIds),
    [nodes, edges, focusedParentId, collapsedIds],
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

  const [webgl] = useState<boolean>(() => detectWebGL());

  const isEmpty = visibleNodes.length === 0;

  return (
    <div
      data-testid={testId}
      className="relative rounded-md border border-border/40 bg-black/40 overflow-hidden"
      style={{ height: 360 }}
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
            camera={{ position: [0, 0, 8], fov: 50 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ambientLight intensity={0.5} />
            <pointLight position={[5, 5, 5]} intensity={0.4} />
            {visibleNodes.map((n) => {
              const x = (n.x - center.x) * SCALE;
              const y = -(n.y - center.y) * SCALE;
              const z = n.parentId === null ? 0 : 1;
              return (
                <mesh
                  key={n.id}
                  position={[x, y, z]}
                  data-testid={`${testId}-mesh-${n.id}`}
                >
                  <boxGeometry args={[1.6, 0.4, 0.4]} />
                  <meshStandardMaterial
                    color={n.parentId === null ? "#475569" : "#334155"}
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
              return (
                <mesh
                  key={e.id}
                  position={[mx, my, mz]}
                  data-testid={`${testId}-line-${e.id}`}
                >
                  <boxGeometry args={[len, 0.02, 0.02]} />
                  <meshStandardMaterial color="#64748b" />
                </mesh>
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
    </div>
  );
}

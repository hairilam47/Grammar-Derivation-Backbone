// ACW Workspace Builder — reusable 3D canvas primitive.
//
// Containment-based: depth represents decomposition only. Inert
// (renders no default scene content). Ambient lighting is the only
// passive scene element so that any supplied containers are visible
// once provided. No camera animation, no auto-arrangement, no
// example geometry.
//
// All static labels asserted against ACW_PLACEHOLDER_FORBIDDEN at
// module load.
import { Component, useEffect, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";

// Probe for WebGL availability synchronously. The R3F Canvas throws
// synchronously when WebGL context creation fails (headless
// screenshots, locked-down browsers); the probe lets us render the
// fallback hint instead of attempting Canvas mount.
function detectWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return gl !== null;
  } catch {
    return false;
  }
}
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const EMPTY_TITLE = "Empty 3D canvas";
const EMPTY_SUBTITLE = "Add systems to begin";
const DEPTH_LEGEND = "Depth represents decomposition";
const NO_WEBGL_HINT = "3D canvas unavailable in this environment";

assertAllAcwPlaceholderLanguage([
  EMPTY_TITLE,
  EMPTY_SUBTITLE,
  DEPTH_LEGEND,
  NO_WEBGL_HINT,
]);

// React error boundary so a missing-WebGL environment (headless
// screenshots, locked-down browsers) renders the empty state in
// place of crashing the whole view. The boundary remains inert: it
// catches and shows a neutral hint, never retries or escalates.
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
    // intentional no-op; constraint: no escalation, no logging callbacks
  }
  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export interface Canvas3DProps {
  /**
   * Optional scene content. When omitted, the canvas renders inert
   * (only ambient light, no geometry).
   */
  children?: ReactNode;
  emptyHint?: string;
  height?: number | string;
  testId?: string;
}

export function Canvas3D(props: Canvas3DProps) {
  const {
    children,
    emptyHint,
    height = 360,
    testId = "acw-canvas-3d",
  } = props;

  const isEmpty = children === undefined || children === null;
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setWebglAvailable(detectWebGL());
  }, []);

  return (
    <div
      data-testid={testId}
      style={{ position: "relative", height }}
      className="rounded-md border border-border/40 bg-black/40 overflow-hidden"
    >
      {webglAvailable === false ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70"
          data-testid={`${testId}-no-webgl`}
        >
          {NO_WEBGL_HINT}
        </div>
      ) : webglAvailable === true ? (
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
            <ambientLight intensity={0.4} />
            {children}
          </Canvas>
        </WebGLBoundary>
      ) : null}

      {/* Empty state overlay — suppressed when WebGL is unavailable
          because the no-WebGL hint already occupies the centre. */}
      {isEmpty && webglAvailable !== false && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none"
          data-testid={`${testId}-empty`}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {EMPTY_TITLE}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 italic">
            {emptyHint ?? EMPTY_SUBTITLE}
          </p>
        </div>
      )}

      {/* Depth-axis legend (always visible, neutral) */}
      <div
        className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-muted-foreground"
        data-testid={`${testId}-legend`}
      >
        {DEPTH_LEGEND}
      </div>
    </div>
  );
}

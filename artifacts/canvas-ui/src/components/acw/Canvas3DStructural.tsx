// ACW v3 — full-scale structural 3D canvas.
//
// Renders the SAME structure as InteractiveCanvas2D, mapped onto a
// containment-as-depth volume. Every container is drawn as a
// translucent box that encloses its visible direct children;
// children sit deeper on the z axis inside their parent's volume.
// Depth here represents decomposition only (master prompt v3 brief)
// — never priority, risk, severity, or any computed weight.
//
// Forbidden semantics (asserted at build time by
// `acw3DForbiddenSemantics.test-shape.ts`):
//   - No animation primitives (no useFrame / useSpring / setInterval
//     / requestAnimationFrame / easing / tween / keyframe / lerp).
//   - No tokens implying judgement (priority, risk, severity, score,
//     weight, urgency, importance, traffic-light colours, etc.).
//   - No camera animation; the camera position is constant.
//
// Single source of truth: this component consumes the SAME
// `enumerateLensVisibility` helper as InteractiveCanvas2D, so 2D
// and 3D necessarily render the same set of nodes and edges at
// every depth. The structural-identity invariant
// (`acw3DStructureInvariants.test-shape.ts`) verifies both
// renderers reference that helper.
//
// Zoom-through (Zone → ComputeNode → System → Component): clicking
// a container invokes `onDrillDown(nodeId)`, which the host lens
// uses to advance its depth path. The next render simply shows
// that container's children at the focus level. There is no
// camera flight or transition — the change is direct, matching
// the "direct camera move, no easing" constraint.
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Canvas3D } from "./Canvas3D";
import type { AcwNode, AcwEdge } from "@/acw/acwStore";
import { enumerateLensVisibility } from "@/acw/acwLensStructure";
import {
  getActiveLod,
  getCollapsedIds,
  subscribeViewState,
} from "@/acw/acwViewState";
import { assertAllAcwPlaceholderLanguage } from "@/governance/staticTextGuard";

const EMPTY_HINT_DEFAULT = "Add systems to begin";

assertAllAcwPlaceholderLanguage([EMPTY_HINT_DEFAULT]);

export interface Canvas3DStructuralProps {
  lensId: string;
  nodes: readonly AcwNode[];
  edges: readonly AcwEdge[];
  focusedParentId: string | null;
  onDrillDown?: (nodeId: string) => void;
  emptyHint?: string;
  height?: number | string;
  testId?: string;
}

// Pure rendering geometry. Carries no semantic weight — every
// container is the same colour, every leaf is the same size.
const SCALE = 0.012; // canvas-px → world units
const LEAF_SIZE: [number, number, number] = [1.0, 0.34, 0.18];
const CONTAINER_DEPTH = 1.4;
const CONTAINER_PAD = 24; // canvas-px around children before scaling
const CONTAINER_HEADER_PAD = 18; // canvas-px header strip allowance

// Neutral palette: same hue for containers and leaves; opacity
// distinguishes container shells from solid leaves. No traffic-
// light or judgemental colour mapping.
const SHELL_COLOR = "#5b8def";
const LEAF_COLOR = "#cdd6f4";
const SHELL_OPACITY = 0.18;
const EDGE_COLOR = "#9aa5c4";

interface ContainerBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function boxFromChildren(children: readonly AcwNode[]): ContainerBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  // Use leaf width/height in canvas px so the container hugs the
  // children at the same scale 2D uses.
  const NODE_W = 96;
  const NODE_H = 32;
  for (const c of children) {
    minX = Math.min(minX, c.x - NODE_W / 2);
    minY = Math.min(minY, c.y - NODE_H / 2);
    maxX = Math.max(maxX, c.x + NODE_W / 2);
    maxY = Math.max(maxY, c.y + NODE_H / 2);
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX + CONTAINER_PAD * 2,
    h: maxY - minY + CONTAINER_PAD * 2 + CONTAINER_HEADER_PAD,
  };
}

export function Canvas3DStructural(props: Canvas3DStructuralProps) {
  const {
    lensId,
    nodes,
    edges,
    focusedParentId,
    onDrillDown,
    emptyHint,
    height = 460,
    testId = "acw-canvas-3d-structural",
  } = props;

  // Re-render when collapse state flips in this lens. Subscribing
  // here keeps the 3D canvas in sync with the 2D view-state
  // singleton — both renderers respond to the same toggles.
  const [viewTick, setViewTick] = useState(0);
  useEffect(() => subscribeViewState(() => setViewTick((t) => t + 1)), []);

  const collapsedIds = useMemo(
    () => new Set(getCollapsedIds(lensId)),
    [lensId, viewTick],
  );

  // EAStudio Phase 2 (LoS framework) — pass the lens-active LoS
  // through to the shared enumerator so the 3D renderer drops
  // nodes whose `lodRange` does not include the active level. The
  // L3 surface uses this to show ONLY `[3, 3]` nodes; legacy
  // (lodRange-less) nodes always pass.
  const activeLod = getActiveLod(lensId);
  const visibility = useMemo(
    () =>
      enumerateLensVisibility(
        nodes,
        edges,
        focusedParentId,
        collapsedIds,
        activeLod,
      ),
    [nodes, edges, focusedParentId, collapsedIds, activeLod],
  );

  // Map node id → world position (centre). For direct siblings, x/y
  // come from node.x/y and z = 0. For visible children of a
  // container, we place them deeper on z inside their parent's
  // volume but keep their x/y centred relative to the parent box,
  // again using node.x/y as the source so 2D and 3D agree on
  // relative arrangement.
  interface Placement {
    id: string;
    x: number;
    y: number;
    z: number;
  }
  const placements = useMemo<Map<string, Placement>>(() => {
    const out = new Map<string, Placement>();
    for (const d of visibility.drawables) {
      out.set(d.node.id, {
        id: d.node.id,
        x: d.node.x * SCALE,
        // Negate y so positive canvas y (down) maps to scene y (down).
        y: -d.node.y * SCALE,
        z: 0,
      });
      for (const c of d.childRefs) {
        out.set(c.id, {
          id: c.id,
          x: c.x * SCALE,
          y: -c.y * SCALE,
          z: -CONTAINER_DEPTH / 2,
        });
      }
    }
    return out;
  }, [visibility]);

  // Center the whole view by translating around the bounding box of
  // all placements. Camera stays fixed; recentring is structural,
  // not a camera move.
  const sceneOrigin = useMemo<[number, number]>(() => {
    if (placements.size === 0) return [0, 0];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of placements.values()) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    return [-(minX + maxX) / 2, -(minY + maxY) / 2];
  }, [placements]);

  const isEmpty = visibility.drawables.length === 0;

  // Build the scene content. We render two layers:
  //   1. Container shells (translucent, click → drill down)
  //   2. Leaf cubes for every visible node (siblings + visible children)
  // Edges between visible endpoints are drawn as thin line segments
  // in scene space.
  const sceneContent = (
    <group position={[sceneOrigin[0], sceneOrigin[1], 0]}>
      {/* Soft ambient + a single directional light so volumes read as
          shapes rather than flat polygons. No animation, no
          time-varying intensity. */}
      <directionalLight position={[3, 4, 5]} intensity={0.55} />

      {visibility.drawables.map((d) => {
        const p = placements.get(d.node.id);
        if (!p) return null;
        if (d.isContainer && !d.isCollapsedHere && d.childRefs.length > 0) {
          const box = boxFromChildren(d.childRefs);
          const w = box.w * SCALE;
          const h = box.h * SCALE;
          const cx = box.cx * SCALE;
          const cy = -box.cy * SCALE;
          return (
            <group key={d.node.id} position={[cx, cy, -CONTAINER_DEPTH / 2]}>
              <mesh
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (onDrillDown) onDrillDown(d.node.id);
                }}
              >
                <boxGeometry args={[w, h, CONTAINER_DEPTH]} />
                <meshStandardMaterial
                  color={SHELL_COLOR}
                  transparent
                  opacity={SHELL_OPACITY}
                />
              </mesh>
              {/* Wireframe outline so the shell reads clearly even at
                  low opacity. Same neutral hue. */}
              <mesh>
                <boxGeometry args={[w, h, CONTAINER_DEPTH]} />
                <meshBasicMaterial color={SHELL_COLOR} wireframe />
              </mesh>
            </group>
          );
        }
        // Leaf or collapsed-container sibling: render a solid cube at
        // the sibling's own position. Click drills in.
        return (
          <mesh
            key={d.node.id}
            position={[p.x, p.y, p.z]}
            onClick={(ev) => {
              ev.stopPropagation();
              if (onDrillDown) onDrillDown(d.node.id);
            }}
          >
            <boxGeometry args={LEAF_SIZE} />
            <meshStandardMaterial color={LEAF_COLOR} />
          </mesh>
        );
      })}

      {/* Visible children inside their containers. */}
      {visibility.drawables.flatMap((d) =>
        d.childRefs.map((c) => {
          const p = placements.get(c.id);
          if (!p) return null;
          return (
            <mesh
              key={`child-${c.id}`}
              position={[p.x, p.y, p.z]}
              onClick={(ev) => {
                ev.stopPropagation();
                if (onDrillDown) onDrillDown(c.id);
              }}
            >
              <boxGeometry args={LEAF_SIZE} />
              <meshStandardMaterial color={LEAF_COLOR} />
            </mesh>
          );
        }),
      )}

      {/* Edges between visible endpoints. Drawn as straight line
          segments — no arrowheads (which would imply direction /
          flow / sequence). */}
      {visibility.visibleEdges.map((e) => {
        const a = placements.get(e.fromId);
        const b = placements.get(e.toId);
        if (!a || !b) return null;
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(a.x, a.y, a.z),
          new THREE.Vector3(b.x, b.y, b.z),
        ]);
        return (
          <primitive
            key={e.id}
            object={
              new THREE.Line(
                geometry,
                new THREE.LineBasicMaterial({ color: EDGE_COLOR }),
              )
            }
          />
        );
      })}
    </group>
  );

  return (
    <Canvas3D
      height={height}
      testId={testId}
      emptyHint={emptyHint ?? EMPTY_HINT_DEFAULT}
    >
      {isEmpty ? null : sceneContent}
    </Canvas3D>
  );
}

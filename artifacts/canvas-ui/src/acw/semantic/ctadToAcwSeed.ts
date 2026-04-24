// ACW Phase 5 — CTAD → ACW seeding service.
//
// Pure transform. Accepts a CTAD-state-like input (the structural
// shape produced by `exportCtadState` / `exportArchitectureState`)
// and returns a fresh `AcwWorkspace` document populated with bound
// nodes for every non-null parameter plus a node per environment.
//
// This module is the *one* place where the structural shape of an
// ACW workspace is synthesised from CTAD data. The function is
// pure — it does not call `createNode` or write to localStorage;
// the caller decides when to persist (typically via a "Seed from
// CTAD" affordance that overwrites the empty workspace).
//
// Constitutional posture:
//   - One-way read of CTAD into ACW. The seeder never mutates the
//     CTAD store; the ACW isolation invariant statically forbids
//     a write-back path.
//   - Vendor-neutral category assignment: the seeder maps each
//     CTAD parameter to a `boundTechnologyCategory` drawn from the
//     icon registry's categorical names. Brand names from CTAD
//     option strings (none today) would NOT be carried into the
//     category field; the category is decided by the parameter id
//     and section, not by the option value.
import { CTAD_SECTIONS, type CtadSectionId } from "@/ctad/ctadRegistry";
import {
  ACW_SCHEMA_VERSION,
  type AcwEdge,
  type AcwNode,
  type AcwWorkspace,
} from "../acwStore";
import type { CtadStateLike, CtadParamValueLike } from "./techNodeBinding";

export interface CtadEnvironmentDefLike {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly hostingModel: string | null;
}

export interface SeedInput extends CtadStateLike {
  readonly environments: readonly CtadEnvironmentDefLike[];
}

// Map from `${sectionId}/${paramId}` to a categorical
// `boundTechnologyCategory` value drawn from `acw/icons/iconRegistry`.
// Parameters not listed here seed without a `boundTechnologyCategory`
// (the renderer falls through to the plain node template).
const PARAM_CATEGORY_MAP: ReadonlyMap<string, string> = new Map([
  // Application & Platform
  ["application/frontendArchitecture", "Server-rendered frontend"],
  ["application/frontendFrameworkClass", "Component-tree frontend"],
  ["application/backendFrameworkClass", "Backend service"],
  ["application/runtimeCategory", "Managed runtime"],
  ["application/applicationStyle", "Generic component"],
  // Infrastructure
  ["infrastructure/databaseClass", "Relational database"],
  ["infrastructure/virtualisationClass", "Container runtime"],
  ["infrastructure/networkTopology", "Network boundary"],
  ["infrastructure/identityModel", "Identity provider"],
  ["infrastructure/serverScaleClass", "Compute host"],
  // Integration
  ["integration/integrationPattern", "API gateway"],
  ["integration/messageExchange", "Message broker"],
  // Ops & Lifecycle
  ["ops/containerOrchestration", "Container orchestrator"],
  ["ops/serviceMesh", "Service-mesh data plane"],
]);

function categoryFor(sectionId: string, paramId: string): string | undefined {
  return PARAM_CATEGORY_MAP.get(`${sectionId}/${paramId}`);
}

function isNonEmptyValue(v: CtadParamValueLike): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return false;
}

function firstString(v: CtadParamValueLike): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string") return v[0] as string;
  return null;
}

// Stable, deterministic id generator. The seeder is pure — it does
// not call `crypto.randomUUID` (which would make the output depend
// on a non-deterministic source). Persisted nodes will carry these
// stable ids; if the caller wants random ids they can re-id after
// `seedAcwWorkspace` returns.
function seedId(prefix: string, key: string): string {
  return `seed-${prefix}-${key}`;
}

// `seedAcwWorkspace`
// -----------------
// Pure. Returns a fresh `AcwWorkspace` document, never writing to
// the store. The caller decides when (and whether) to persist the
// returned document.
//
// Structural shape produced:
//   - One root-level `Zone` per environment (`zone-<envId>`).
//   - Inside that Zone, one root-level (per-environment-implicit)
//     `ComputeNode` ("Compute host") to hold the Systems.
//   - One `System` per non-null param with a `boundParam`. When a
//     `boundTechnologyCategory` exists for the param, the System
//     also carries it; otherwise just `boundParam` is set.
//   - When there are zero environments, the seeder still emits a
//     single workspace-root ComputeNode and the per-param Systems
//     hang off it, so the result is always non-empty when the
//     input has at least one non-null param.
export function seedAcwWorkspace(input: SeedInput): AcwWorkspace {
  const nodes: AcwNode[] = [];
  const edges: AcwEdge[] = [];

  // Layout: lightweight grid. The seeder is pure but we do want the
  // produced positions to render visibly when the user persists the
  // result; values here are intentionally far apart so the canvas
  // does not need an auto-layout pass before the first interaction.
  const ZONE_X_STEP = 480;
  const SYS_X_STEP = 220;
  const SYS_Y_BASE = 220;

  // Per-environment containers. When `environments` is empty we
  // synthesise a single sentinel container at the workspace root.
  type Container = { zoneId: string | null; computeId: string };
  const containers: Container[] = [];
  if (input.environments.length === 0) {
    const computeId = seedId("compute", "default");
    nodes.push(
      Object.freeze({
        id: computeId,
        type: "ComputeNode",
        parentId: null,
        label: "Compute host",
        x: 0,
        y: 0,
        boundTechnologyCategory: "Compute host",
      }),
    );
    containers.push({ zoneId: null, computeId });
  } else {
    input.environments.forEach((env, i) => {
      const zoneId = seedId("zone", env.id);
      nodes.push(
        Object.freeze({
          id: zoneId,
          type: "Zone",
          parentId: null,
          label: env.name,
          x: i * ZONE_X_STEP,
          y: 0,
        }),
      );
      const computeId = seedId("compute", env.id);
      nodes.push(
        Object.freeze({
          id: computeId,
          type: "ComputeNode",
          parentId: zoneId,
          label: "Compute host",
          x: i * ZONE_X_STEP + 40,
          y: 80,
          boundTechnologyCategory: "Compute host",
        }),
      );
      containers.push({ zoneId, computeId });
    });
  }

  // Iterate the registry in canonical (registry) order to keep the
  // seeded layout deterministic across runs and across environments.
  let sysCol = 0;
  for (const section of CTAD_SECTIONS) {
    for (const param of section.parameters) {
      const sectionKey = section.id as CtadSectionId & keyof CtadStateLike;
      const sectionDict = input[sectionKey];
      const raw = sectionDict[param.id];
      if (!isNonEmptyValue(raw)) continue;
      const optionValue = firstString(raw);
      const category = categoryFor(section.id, param.id);
      // Mirror per-environment: every container gets the System.
      // Single-container case (no envs) places them under the lone
      // root ComputeNode.
      containers.forEach((container, envIdx) => {
        const sysId = seedId("sys", `${param.id}-${envIdx}`);
        nodes.push(
          Object.freeze({
            id: sysId,
            type: "System",
            parentId: container.computeId,
            label: param.label,
            x: envIdx * ZONE_X_STEP + 80 + sysCol * SYS_X_STEP,
            y: SYS_Y_BASE,
            boundParam: Object.freeze({
              sectionId: section.id,
              paramId: param.id,
              optionValue,
            }),
            ...(category !== undefined ? { boundTechnologyCategory: category } : {}),
          }),
        );
      });
      sysCol++;
    }
  }

  return Object.freeze({
    schemaVersion: ACW_SCHEMA_VERSION,
    structureGraph: Object.freeze({
      nodes: Object.freeze(nodes),
      edges: Object.freeze(edges),
    }),
  });
}

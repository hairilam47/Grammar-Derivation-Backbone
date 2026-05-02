// Helpers that read BPMN task summaries from a persisted ACW
// workspace document. ACW documents have shape
// `{ schemaVersion, structureGraph: { nodes, edges } }`.

import { isAcwElementType, type AcwElementType } from "@/acw/acwGrammar";
import { BASE_STORAGE_KEY as ACW_BASE_STORAGE_KEY } from "@/acw/acwStore";
import { getScopedKey } from "@/governance/storageKeyUtils";
import { readScoped } from "@/governance/scopedStorageClient";

export interface BpmnTaskSummary {
  readonly id: string;
  readonly label: string;
  readonly type: AcwElementType | null;
  readonly moduleId: string | null;
}

interface PersistedAcwDocLike {
  readonly structureGraph?: {
    readonly nodes?: ReadonlyArray<{
      readonly id?: string;
      readonly label?: string;
      readonly type?: string;
      readonly diagramType?: string;
      readonly moduleId?: string;
    }>;
  };
}

export function parseBpmnTasksFromDoc(
  raw: string | null,
): readonly BpmnTaskSummary[] {
  if (raw === null) return [];
  let parsed: PersistedAcwDocLike;
  try {
    parsed = JSON.parse(raw) as PersistedAcwDocLike;
  } catch {
    return [];
  }
  const nodes = parsed?.structureGraph?.nodes;
  if (!Array.isArray(nodes)) return [];
  const out: BpmnTaskSummary[] = [];
  for (const node of nodes) {
    if (!node || node.diagramType !== "bpmn") continue;
    if (typeof node.id !== "string" || node.id.length === 0) continue;
    const label =
      typeof node.label === "string" && node.label.length > 0
        ? node.label
        : node.id;
    const type = isAcwElementType(node.type) ? node.type : null;
    const moduleId =
      typeof node.moduleId === "string" && node.moduleId.length > 0
        ? node.moduleId
        : null;
    out.push({ id: node.id, label, type, moduleId });
  }
  return out;
}

export function countBoundBpmnTasks(
  tasks: readonly BpmnTaskSummary[],
): number {
  let count = 0;
  for (const t of tasks) if (t.moduleId !== null) count += 1;
  return count;
}

export function readBpmnTasksForBlueprint(
  orgId: string,
  blueprintId: string,
): readonly BpmnTaskSummary[] {
  const key = getScopedKey(ACW_BASE_STORAGE_KEY, orgId, blueprintId);
  return parseBpmnTasksFromDoc(readScoped(key));
}

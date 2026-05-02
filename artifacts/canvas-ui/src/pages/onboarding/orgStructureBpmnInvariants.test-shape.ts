// Build-time invariants for the BPMN-task reader used by the
// Organisation Home and Organisation Structure pages.
//
// Asserts at module load:
//   1. Top-level `nodes` (the WRONG shape) yields zero results.
//   2. The real ACW shape `{ structureGraph: { nodes } }` yields
//      one entry per BPMN node.
//   3. Non-BPMN diagramTypes are skipped.
//   4. `moduleId` is preserved when set, null when missing/empty.
//   5. `countBoundBpmnTasks` only counts entries with a moduleId.
//   6. `null` raw and malformed JSON both return zero results.

import {
  countBoundBpmnTasks,
  parseBpmnTasksFromDoc,
} from "./orgStructureBpmn";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    throw new Error(`[orgStructureBpmn invariants] ${msg}`);
  }
}

function probe(): void {
  assert(parseBpmnTasksFromDoc(null).length === 0, "null raw → []");
  assert(
    parseBpmnTasksFromDoc("not-json").length === 0,
    "malformed JSON → []",
  );

  const wrongShape = JSON.stringify({
    nodes: [
      { id: "n1", diagramType: "bpmn", moduleId: "mod-1" },
    ],
  });
  assert(
    parseBpmnTasksFromDoc(wrongShape).length === 0,
    "top-level `nodes` (wrong shape) must yield 0 entries",
  );

  const realShape = JSON.stringify({
    schemaVersion: "acw-1.0",
    structureGraph: {
      nodes: [
        {
          id: "n-bpmn-1",
          label: "Receive order",
          type: "Component",
          diagramType: "bpmn",
          moduleId: "mod-orders",
        },
        {
          id: "n-bpmn-2",
          label: "Pick item",
          type: "Component",
          diagramType: "bpmn",
        },
        {
          id: "n-erd-1",
          label: "Customer",
          type: "Component",
          diagramType: "erd",
          moduleId: "mod-orders",
        },
      ],
      edges: [],
    },
  });
  const tasks = parseBpmnTasksFromDoc(realShape);
  assert(tasks.length === 2, `BPMN tasks must be 2; got ${tasks.length}`);
  assert(
    tasks[0].moduleId === "mod-orders",
    `first task moduleId must be "mod-orders"; got ${String(tasks[0].moduleId)}`,
  );
  assert(
    tasks[0].type === "Component",
    `first task type must be Component; got ${String(tasks[0].type)}`,
  );
  assert(
    tasks[1].moduleId === null,
    `second task moduleId must be null; got ${String(tasks[1].moduleId)}`,
  );

  assert(
    countBoundBpmnTasks(tasks) === 1,
    `countBoundBpmnTasks must equal 1; got ${countBoundBpmnTasks(tasks)}`,
  );
}

probe();

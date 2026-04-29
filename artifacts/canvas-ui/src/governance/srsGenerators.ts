// IEEE-830 SRS content generators.
//
// Phase 1B (Task #144). Pure synchronous functions keyed by the
// `contentGenerator` strings used in `srsTemplateConfig.ts`. Each
// generator takes an `SrsContext` (live snapshot of the placeholder
// WorkItem, Module catalogue, Requirement set, latest contract,
// CTAD architectures, and ACW workspace) and returns a list of
// `SrsBlock` values (paragraph, bullets, table) that the exporter
// renders into PDF / DOCX.
//
// Architectural constraints:
//   - Generators are PURE: no I/O, no Date.now, no store mutation,
//     no random ids. Same context in → same blocks out.
//   - Empty inputs always yield a single `[No data]` paragraph so
//     the exported document still matches the standard's skeleton.
//   - Urgency labels are computed from the internal urgency enum
//     by `URGENCY_LABEL` and never persisted back into the store.
//
// Vocabulary: every static string this module generates (table
// headers, fixed paragraph text, `[No data]`, the Urgency labels
// themselves) is checked against `assertAllGovernanceLanguage` at
// module load to keep prescriptive vocabulary out of the document.

import { assertAllGovernanceLanguage } from "./staticTextGuard";
import type { Module } from "./moduleCatalogStore";
import type {
  Requirement,
  RequirementUrgency,
} from "./requirementsStore";
import type { RequirementsContract } from "./requirementsContractStore";
import type { CtadArchitectureDoc } from "../ctad/ctadStore";
import type { AcwWorkspace } from "../acw/acwStore";

// --- Context + block types ---------------------------------------------------

export interface SrsWorkItem {
  readonly workItemId: string;
  readonly title: string;
}

export interface SrsContext {
  readonly workItem: SrsWorkItem;
  readonly modules: readonly Module[];
  readonly requirements: readonly Requirement[];
  readonly contract: RequirementsContract | null;
  // Full chronological list of frozen contracts for this work item,
  // ascending by frozen time. Used by the title-page revision-history
  // block and other generators that need the freeze sequence rather
  // than only the most recent freeze.
  readonly allContracts: readonly RequirementsContract[];
  readonly ctadArchitectures: readonly CtadArchitectureDoc[];
  readonly acwWorkspace: AcwWorkspace | null;
}

export type SrsBlock =
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "bullets"; readonly items: readonly string[] }
  | {
      readonly kind: "table";
      readonly headers: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type SrsGeneratorFn = (ctx: SrsContext) => SrsBlock[];

// --- Urgency label map -------------------------------------------------------

export const URGENCY_LABEL: Readonly<Record<RequirementUrgency, string>> =
  Object.freeze({
    low: "Routine",
    medium: "Standard",
    high: "Elevated",
    critical: "Acute",
  });

// Type label map keeps SRS-friendly phrasing distinct from the
// internal enum value — same write-once / read-only stance as
// URGENCY_LABEL.
export const TYPE_LABEL: Readonly<Record<Requirement["type"], string>> =
  Object.freeze({
    functional: "Functional",
    "non-functional": "Non-Functional",
    constraint: "Constraint",
    hardware: "Hardware",
  });

// --- Helpers -----------------------------------------------------------------

const NO_DATA = "[No data]";

function noData(): SrsBlock[] {
  return [{ kind: "paragraph", text: NO_DATA }];
}

function moduleNameById(
  modules: readonly Module[],
  id: string | null,
): string {
  if (!id) return "Unassigned";
  const m = modules.find((x) => x.id === id);
  return m ? m.name : "Unassigned";
}

function byUrgencyDesc(a: Requirement, b: Requirement): number {
  const order: Record<RequirementUrgency, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return order[b.urgency] - order[a.urgency];
}

// --- Individual generators ---------------------------------------------------

const purpose: SrsGeneratorFn = (ctx) => [
  {
    kind: "paragraph",
    text:
      `This Software Requirements Specification documents the requirements for ${ctx.workItem.title}. ` +
      `It follows the IEEE 830-1998 outline and is generated directly from the live Architecture Decision Canvas data set ` +
      `(modules, requirements, hardware items, and the latest requirements contract).`,
  },
];

const scope: SrsGeneratorFn = (ctx) => {
  const moduleNames = ctx.modules.map((m) => m.name);
  const blocks: SrsBlock[] = [
    {
      kind: "paragraph",
      text:
        `The scope of this specification covers the system named "${ctx.workItem.title}" as captured in work item ` +
        `${ctx.workItem.workItemId}. The scope is defined by the set of Modules currently registered against this work item.`,
    },
  ];
  if (moduleNames.length === 0) {
    blocks.push({ kind: "paragraph", text: NO_DATA });
  } else {
    blocks.push({ kind: "bullets", items: moduleNames });
  }
  return blocks;
};

const definitions: SrsGeneratorFn = (ctx) => {
  const rows: string[][] = [
    ["SRS", "Software Requirements Specification."],
    ["IEEE 830-1998", "Software Requirements Specifications standard published by IEEE."],
    ["ADC", "Architecture Decision Canvas."],
    ["Module", "A named grouping of related capabilities within the work item."],
    [
      "Requirement",
      "A captured statement of need, classified by type and urgency, optionally linked to a Module.",
    ],
    [
      "Requirements Contract",
      "An immutable snapshot of approved requirements at freeze time.",
    ],
    [
      "Urgency",
      "An internal classification of a requirement, surfaced as the labels Routine / Standard / Elevated / Acute.",
    ],
  ];
  if (ctx.modules.length === 0 && ctx.requirements.length === 0) {
    return noData();
  }
  return [
    {
      kind: "table",
      headers: ["Term", "Definition"],
      rows,
    },
  ];
};

const references: SrsGeneratorFn = (ctx) => {
  const items: string[] = [
    "IEEE Std 830-1998 — Software Requirements Specifications standard published by IEEE.",
    `Work item identifier: ${ctx.workItem.workItemId}.`,
  ];
  if (ctx.contract) {
    items.push(
      `Requirements Contract ${ctx.contract.contractId} frozen at ${ctx.contract.frozenAt}.`,
    );
  }
  return [{ kind: "bullets", items }];
};

const overview: SrsGeneratorFn = () => [
  {
    kind: "paragraph",
    text:
      "Section 1 introduces the document. Section 2 describes the system from an overall standpoint. " +
      "Section 3 enumerates the specific functional, non-functional, and hardware requirements. " +
      "The Appendices carry a glossary of terms harvested from the requirement descriptions and a list of items still marked TBD.",
  },
];

const productPerspective: SrsGeneratorFn = (ctx) => {
  const items: string[] = [];
  items.push(`Modules registered: ${ctx.modules.length}`);
  items.push(`Requirements captured: ${ctx.requirements.length}`);
  items.push(`CTAD architectures attached: ${ctx.ctadArchitectures.length}`);
  if (ctx.acwWorkspace) {
    const nodeCount = ctx.acwWorkspace.structureGraph.nodes.length;
    const edgeCount = ctx.acwWorkspace.structureGraph.edges.length;
    items.push(
      `ACW workspace: ${nodeCount} structural element(s), ${edgeCount} connection(s)`,
    );
  } else {
    items.push("ACW workspace: not initialised");
  }
  return [
    {
      kind: "paragraph",
      text:
        "The system relates to the surrounding environment through the architectural composition described below.",
    },
    { kind: "bullets", items },
  ];
};

const productFunctions: SrsGeneratorFn = (ctx) => {
  const fr = ctx.requirements
    .filter((r) => r.type === "functional")
    .slice()
    .sort(byUrgencyDesc);
  if (fr.length === 0) return noData();
  const rows = fr.map((r) => [
    r.title,
    moduleNameById(ctx.modules, r.moduleId),
    URGENCY_LABEL[r.urgency],
    r.status,
  ]);
  return [
    {
      kind: "table",
      headers: ["Function", "Module", "Urgency", "Status"],
      rows,
    },
  ];
};

const userCharacteristics: SrsGeneratorFn = (ctx) => {
  if (ctx.modules.length === 0) return noData();
  return [
    {
      kind: "paragraph",
      text:
        "Users of the system are expected to be familiar with the domain implied by the registered Modules. " +
        "No further user-class taxonomy is captured in the current ADC data set.",
    },
  ];
};

const constraints: SrsGeneratorFn = (ctx) => {
  const cs = ctx.requirements.filter((r) => r.type === "constraint");
  if (cs.length === 0) return noData();
  return [
    {
      kind: "bullets",
      items: cs.map(
        (r) => `${r.title}${r.description ? ` — ${r.description}` : ""}`,
      ),
    },
  ];
};

const assumptionsAndDependencies: SrsGeneratorFn = (ctx) => {
  const items: string[] = [];
  const drafts = ctx.requirements.filter((r) => r.status === "draft");
  if (drafts.length > 0) {
    items.push(
      `${drafts.length} requirement(s) remain in draft status and may evolve before freeze.`,
    );
  }
  const unassigned = ctx.requirements.filter((r) => r.moduleId === null);
  if (unassigned.length > 0) {
    items.push(
      `${unassigned.length} requirement(s) are not yet linked to a Module and remain provisional.`,
    );
  }
  if (ctx.contract === null) {
    items.push(
      "No Requirements Contract has been frozen for this work item; contents may change without version increment.",
    );
  }
  if (items.length === 0) return noData();
  return [{ kind: "bullets", items }];
};

const externalInterfaces: SrsGeneratorFn = (ctx) => {
  if (!ctx.acwWorkspace || ctx.acwWorkspace.structureGraph.edges.length === 0) {
    return noData();
  }
  const nodes = ctx.acwWorkspace.structureGraph.nodes;
  const nameById = (id: string): string => {
    const n = nodes.find((x) => x.id === id);
    return n ? n.label : id;
  };
  const rows = ctx.acwWorkspace.structureGraph.edges.map((e) => [
    nameById(e.fromId),
    nameById(e.toId),
    e.kind,
  ]);
  return [
    {
      kind: "table",
      headers: ["From", "To", "Connection Type"],
      rows,
    },
  ];
};

const systemFeatures: SrsGeneratorFn = (ctx) => {
  if (ctx.modules.length === 0) return noData();
  const blocks: SrsBlock[] = [];
  for (const m of ctx.modules) {
    const linked = ctx.requirements.filter((r) => r.moduleId === m.id);
    blocks.push({
      kind: "paragraph",
      text: `Module: ${m.name}${m.description ? ` — ${m.description}` : ""}`,
    });
    if (linked.length === 0) {
      blocks.push({ kind: "paragraph", text: NO_DATA });
    } else {
      const rows = linked
        .slice()
        .sort(byUrgencyDesc)
        .map((r) => [
          r.title,
          TYPE_LABEL[r.type],
          URGENCY_LABEL[r.urgency],
          r.status,
        ]);
      blocks.push({
        kind: "table",
        headers: ["Requirement", "Type", "Urgency", "Status"],
        rows,
      });
    }
  }
  return blocks;
};

const performanceRequirements: SrsGeneratorFn = (ctx) => {
  const perf = ctx.requirements.filter(
    (r) =>
      r.type === "non-functional" &&
      (r.urgency === "high" || r.urgency === "critical"),
  );
  if (perf.length === 0) return noData();
  const rows = perf.map((r) => [
    r.title,
    URGENCY_LABEL[r.urgency],
    r.description || NO_DATA,
  ]);
  return [
    {
      kind: "table",
      headers: ["Requirement", "Urgency", "Description"],
      rows,
    },
  ];
};

const designConstraints: SrsGeneratorFn = (ctx) => {
  const blocks: SrsBlock[] = [];
  if (ctx.ctadArchitectures.length > 0) {
    blocks.push({
      kind: "paragraph",
      text:
        "The following technology architectures are attached to the work item via the CTAD plane:",
    });
    blocks.push({
      kind: "bullets",
      items: ctx.ctadArchitectures.map((a) => a.architectureName),
    });
  }
  const cs = ctx.requirements.filter((r) => r.type === "constraint");
  if (cs.length > 0) {
    blocks.push({
      kind: "table",
      headers: ["Constraint", "Module", "Urgency"],
      rows: cs.map((r) => [
        r.title,
        moduleNameById(ctx.modules, r.moduleId),
        URGENCY_LABEL[r.urgency],
      ]),
    });
  }
  if (blocks.length === 0) return noData();
  return blocks;
};

const softwareSystemAttributes: SrsGeneratorFn = (ctx) => {
  const nf = ctx.requirements.filter((r) => r.type === "non-functional");
  if (nf.length === 0) return noData();
  const rows = nf
    .slice()
    .sort(byUrgencyDesc)
    .map((r) => [
      r.title,
      URGENCY_LABEL[r.urgency],
      moduleNameById(ctx.modules, r.moduleId),
    ]);
  return [
    {
      kind: "table",
      headers: ["Attribute", "Urgency", "Module"],
      rows,
    },
  ];
};

const otherRequirements: SrsGeneratorFn = (ctx) => {
  const other = ctx.requirements.filter((r) => r.moduleId === null);
  if (other.length === 0) return noData();
  const rows = other.map((r) => [
    r.title,
    TYPE_LABEL[r.type],
    URGENCY_LABEL[r.urgency],
    r.status,
  ]);
  return [
    {
      kind: "table",
      headers: ["Requirement", "Type", "Urgency", "Status"],
      rows,
    },
  ];
};

const hardwareInterfaces: SrsGeneratorFn = (ctx) => {
  const hw = ctx.requirements.filter(
    (r) => r.type === "hardware" && r.hardwareDetails,
  );
  if (hw.length === 0) return noData();
  let total = 0;
  const rows = hw.map((r) => {
    const h = r.hardwareDetails!;
    const lineTotal = h.quantity * h.unitCostEstimate;
    total += lineTotal;
    return [
      r.title,
      h.itemName,
      h.model,
      String(h.quantity),
      h.unitCostEstimate.toFixed(2),
      lineTotal.toFixed(2),
      h.notes || "",
    ];
  });
  rows.push(["", "", "", "", "Total estimated cost:", total.toFixed(2), ""]);
  return [
    {
      kind: "table",
      headers: [
        "Requirement",
        "Item",
        "Model",
        "Quantity",
        "Unit Cost",
        "Line Total",
        "Notes",
      ],
      rows,
    },
  ];
};

const nonFunctional: SrsGeneratorFn = (ctx) => {
  const list = ctx.requirements.filter(
    (r) => r.type === "non-functional" || r.type === "constraint",
  );
  if (list.length === 0) return noData();
  const rows = list
    .slice()
    .sort(byUrgencyDesc)
    .map((r) => [
      r.title,
      TYPE_LABEL[r.type],
      URGENCY_LABEL[r.urgency],
      moduleNameById(ctx.modules, r.moduleId),
      r.status,
    ]);
  return [
    {
      kind: "table",
      headers: ["Requirement", "Type", "Urgency", "Module", "Status"],
      rows,
    },
  ];
};

const TERM_RE = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3})\b/g;
const TERM_STOPWORDS = new Set([
  "The",
  "This",
  "That",
  "These",
  "Those",
  "When",
  "Where",
  "Which",
  "What",
  "While",
  "With",
  "From",
  "Into",
  "Onto",
  "Over",
  "Under",
  "TBD",
  "TODO",
]);

const glossary: SrsGeneratorFn = (ctx) => {
  const collected = new Set<string>();
  for (const r of ctx.requirements) {
    const haystack = `${r.title} ${r.description}`;
    for (const match of haystack.matchAll(TERM_RE)) {
      const term = match[1].trim();
      const first = term.split(/\s+/)[0];
      if (TERM_STOPWORDS.has(first)) continue;
      collected.add(term);
    }
  }
  for (const m of ctx.modules) collected.add(m.name);
  if (collected.size === 0) return noData();
  const sorted = Array.from(collected).sort((a, b) =>
    a.localeCompare(b),
  );
  return [
    {
      kind: "table",
      headers: ["Term", "Source"],
      rows: sorted.map((t) => [t, "Auto-collected from descriptions"]),
    },
  ];
};

const TBD_RE = /\b(TBD|TODO)\b/i;

const tbdList: SrsGeneratorFn = (ctx) => {
  const items: string[] = [];
  for (const r of ctx.requirements) {
    if (TBD_RE.test(r.title) || TBD_RE.test(r.description)) {
      items.push(`${r.title}: marked outstanding in description.`);
    }
    if (r.status === "draft") {
      items.push(`${r.title}: still in draft status.`);
    }
    if (r.moduleId === null) {
      items.push(`${r.title}: no Module link assigned.`);
    }
    if (r.type === "hardware" && !r.hardwareDetails) {
      items.push(`${r.title}: hardware item missing details block.`);
    }
  }
  if (items.length === 0) return noData();
  return [{ kind: "bullets", items }];
};

// --- Registry ----------------------------------------------------------------

export const SRS_GENERATORS: Readonly<Record<string, SrsGeneratorFn>> =
  Object.freeze({
    purpose,
    scope,
    definitions,
    references,
    overview,
    productPerspective,
    productFunctions,
    userCharacteristics,
    constraints,
    assumptionsAndDependencies,
    externalInterfaces,
    systemFeatures,
    performanceRequirements,
    designConstraints,
    softwareSystemAttributes,
    otherRequirements,
    hardwareInterfaces,
    nonFunctional,
    glossary,
    tbdList,
  });

// --- DRAFT detection ---------------------------------------------------------

export function isDraftDataset(ctx: SrsContext): boolean {
  if (ctx.requirements.length === 0) return true;
  for (const r of ctx.requirements) {
    if (r.status !== "frozen") return true;
  }
  return false;
}

// --- Module-load vocabulary guard --------------------------------------------
//
// Every fixed string this module renders into the document (table
// headers, fixed paragraph templates, the Urgency labels themselves,
// and the `[No data]` placeholder) is asserted at module load. Data
// pulled from the live stores (requirement titles, module names) is
// user-authored and intentionally NOT checked here.
const STATIC_TEXTS: string[] = [
  NO_DATA,
  "Functional",
  "Non-Functional",
  "Constraint",
  "Hardware",
  "Routine",
  "Standard",
  "Elevated",
  "Acute",
  "Function",
  "Module",
  "Urgency",
  "Status",
  "Term",
  "Definition",
  "From",
  "To",
  "Connection Type",
  "Description",
  "Attribute",
  "Requirement",
  "Item",
  "Model",
  "Quantity",
  "Unit Cost",
  "Line Total",
  "Notes",
  "Type",
  "Source",
  "Total estimated cost:",
  "Auto-collected from descriptions",
  "Unassigned",
  "Software Requirements Specification.",
  "Architecture Decision Canvas.",
  "A named grouping of related capabilities within the work item.",
  "An immutable snapshot of approved requirements at freeze time.",
  "An internal classification of a requirement, surfaced as the labels Routine / Standard / Elevated / Acute.",
  "A captured statement of need, classified by type and urgency, optionally linked to a Module.",
  "IEEE Std 830-1998 — Software Requirements Specifications standard published by IEEE.",
  "IEEE 830-1998",
  "Software Requirements Specifications standard published by IEEE.",
  "Section 1 introduces the document. Section 2 describes the system from an overall standpoint. Section 3 enumerates the specific functional, non-functional, and hardware requirements. The Appendices carry a glossary of terms harvested from the requirement descriptions and a list of items still marked TBD.",
  "The system relates to the surrounding environment through the architectural composition described below.",
  "Users of the system are expected to be familiar with the domain implied by the registered Modules. No further user-class taxonomy is captured in the current ADC data set.",
  "The following technology architectures are attached to the work item via the CTAD plane:",
  "ACW workspace: not initialised",
  "No Requirements Contract has been frozen for this work item; contents may change without version increment.",
  // --- Phase 1B IEEE-830 title-page labels (rendered by ieeeSrsExporter)
  "Software Requirements Specification",
  "Document Date",
  "Approving Authority",
  "Pending freeze",
  "Revision History",
  "Version",
  "Date",
  "Frozen By",
  "Requirements",
];
assertAllGovernanceLanguage(STATIC_TEXTS);

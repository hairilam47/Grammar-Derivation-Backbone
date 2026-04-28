#!/usr/bin/env node
// Orchestrator generator for the enterprise-architecture skill.
//
// Reads designs/system-model.yaml (or --json file) and writes:
//   - designs/diagrams/ea-overview.puml   (one layered overview diagram)
//   - designs/ea-traceability.md          (markdown traceability report)
//
// Cross-layer gap report is printed to stdout. The orchestrator never edits
// layer-owned sections — it only reads them. ID grammar and cross-reference
// resolution are owned by the foundation validator
// (.agents/skills/design-model/scripts/validate.mjs).
//
// Optional --render-all also runs the six sibling generators sequentially
// (user-story, use-case, BPMN, ERD, system, code-structure) so all layer
// diagrams refresh in one shot.
//
// Exit codes:
//   0 — success (warnings allowed)
//   1 — non-informational gap report entries AND --strict was passed
//       (informational categories — e.g. orphan nodes, stories without
//       use cases — are reported but do NOT count toward the strict total)
//   2 — internal failure (file unreadable, parse error)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { argv, exit, stdout, stderr } from "node:process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = resolve(HERE, "..", "..");

async function loadModel(path, asJson) {
  const text = await readFile(path, "utf8");
  if (asJson) {
    try { return JSON.parse(text); }
    catch (e) { fatal(`Failed to parse JSON: ${e.message}`); }
  }
  let yaml;
  try { yaml = await import("yaml"); }
  catch {
    fatal(
      "The 'yaml' package is not installed.\n" +
      "Install it once at the workspace root: pnpm add -D -w yaml\n" +
      "Or pass --json with a JSON model file."
    );
  }
  try { return yaml.parse(text); }
  catch (e) { fatal(`Failed to parse YAML: ${e.message}`); }
}

function fatal(message) {
  stderr.write(`generate.mjs: ${message}\n`);
  exit(2);
}

function alias(id) {
  if (typeof id !== "string") return "n_unknown";
  const [kind, rest] = id.split(":", 2);
  const safe = (rest ?? id).replace(/[^A-Za-z0-9]/g, "_");
  const prefix =
    kind === "process"  ? "proc_" :
    kind === "actor"    ? "actor_" :
    kind === "entity"   ? "ent_" :
    kind === "service"  ? "svc_" :
    kind === "function" ? "fn_" :
    kind === "module"   ? "mod_" :
    kind === "node"     ? "node_" :
    kind === "usecase"  ? "uc_" :
    kind === "story"    ? "story_" :
    kind === "task"     ? "task_" :
    "n_";
  return prefix + safe;
}

// epic / system label → slug for stable nested-rectangle aliases.
function labelSlug(label, fallback) {
  const slug = (label ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || fallback;
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// Build cross-layer indexes used by both the diagram and the report.
// Entries that lack a string `id` are skipped with a warning — the foundation
// validator hard-fails on those; this generator stays useful when regenerating
// from a partially-edited model that has not yet been re-validated.
function withId(list, sectionName) {
  if (!Array.isArray(list)) return [];
  const out = [];
  let dropped = 0;
  for (const item of list) {
    if (item && typeof item.id === "string" && item.id.length > 0) out.push(item);
    else dropped += 1;
  }
  if (dropped > 0) {
    stderr.write(`generate.mjs: skipped ${dropped} entr${dropped === 1 ? "y" : "ies"} in ${sectionName} that lack an \`id\` (run validate.mjs to fix).\n`);
  }
  return out;
}

function buildIndex(model) {
  const processes = withId(model.processes,           "processes[]");
  const actors    = withId(model.actors,              "actors[]");
  const entities  = withId(model.entities,            "entities[]");
  const services  = withId(model.services,            "services[]");
  const functions = withId(model.functions,           "functions[]");
  const modules   = withId(model.modules,             "modules[]");
  const nodes     = withId(model.technology?.nodes,   "technology.nodes[]");
  const usecases  = withId(model.usecases,            "usecases[]");
  const stories   = withId(model.stories,             "stories[]");
  const environments = Array.isArray(model.technology?.environments) ? model.technology.environments : [];
  const runtimes     = Array.isArray(model.technology?.runtimes)     ? model.technology.runtimes     : [];

  const fnById  = new Map(functions.map((f) => [f.id, f]));
  const svcById = new Map(services.map((s)  => [s.id, s]));
  const modById = new Map(modules.map((m)   => [m.id, m]));
  const entById = new Map(entities.map((e)  => [e.id, e]));
  const nodeById = new Map(nodes.map((n)    => [n.id, n]));
  const procById = new Map(processes.map((p) => [p.id, p]));
  const ucById  = new Map(usecases.map((u)  => [u.id, u]));
  const storyById = new Map(stories.map((s) => [s.id, s]));

  // service → module: prefer modules[].contains[]; fall back to services[].module.
  const serviceToModule = new Map();
  for (const m of modules) {
    for (const sId of m?.contains ?? []) serviceToModule.set(sId, m.id);
  }
  for (const s of services) {
    if (s?.module && !serviceToModule.has(s.id)) serviceToModule.set(s.id, s.module);
  }

  // module → environment names (a node may be in multiple environments).
  const nodeToEnvs = new Map();
  for (const env of environments) {
    for (const nId of env?.nodes ?? []) {
      if (!nodeToEnvs.has(nId)) nodeToEnvs.set(nId, []);
      nodeToEnvs.get(nId).push(env.name);
    }
  }

  // Reverse index: usecase → stories[] that realize it.
  const usecaseToStories = new Map();
  for (const s of stories) {
    for (const ucId of s?.realizes ?? []) {
      if (!usecaseToStories.has(ucId)) usecaseToStories.set(ucId, []);
      usecaseToStories.get(ucId).push(s);
    }
  }

  return {
    processes, actors, entities, services, functions, modules, nodes, usecases, stories,
    environments, runtimes,
    fnById, svcById, modById, entById, nodeById, procById, ucById, storyById,
    serviceToModule, nodeToEnvs, usecaseToStories,
  };
}

// Resolve the set of process tasks a usecase reaches via stories.
// A usecase → task arrow is drawn when at least one story realizing the
// usecase shares an `implementedBy` function with the task. Use cases
// have no `implementedBy` field of their own, so the linkage is purely
// transitive through the story layer.
function usecaseTaskLinks(idx) {
  const links = []; // [{ usecaseId, processId, taskId }]
  const seen = new Set();
  for (const uc of idx.usecases) {
    const stories = idx.usecaseToStories.get(uc.id) ?? [];
    if (stories.length === 0) continue;
    const ucImplFns = new Set();
    for (const s of stories) for (const fn of s?.implementedBy ?? []) ucImplFns.add(fn);
    if (ucImplFns.size === 0) continue;
    for (const p of idx.processes) {
      for (const t of p?.tasks ?? []) {
        const taskFns = t?.implementedBy ?? [];
        const hit = taskFns.some((fn) => ucImplFns.has(fn));
        if (!hit) continue;
        const key = `${uc.id}|${p.id}|${t.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ usecaseId: uc.id, processId: p.id, taskId: t.id });
      }
    }
  }
  return links;
}

// ─── Overview diagram ─────────────────────────────────────────────────────
function renderOverview(idx) {
  const lines = [];
  lines.push("@startuml ea-overview");
  lines.push("' Generated from designs/system-model.yaml — do not hand-edit.");
  lines.push("' Regenerate with: node .agents/skills/enterprise-architecture/scripts/generate.mjs designs/system-model.yaml");
  lines.push("title Enterprise Architecture — Overview");
  lines.push("");

  // Requirements layer (stories grouped by epic, use cases grouped by system).
  // Two distinct epic labels can slugify to the same alias ("Cust A" and
  // "cust-a" both → cust_a), which would produce a duplicate-alias PlantUML
  // error. Disambiguate by ordinal suffix after the first collision.
  const assignSlugs = (keys, prefix) => {
    const used = new Set();
    const out = new Map();
    let ord = 0;
    for (const key of keys) {
      ord += 1;
      const base = labelSlug(key, `${prefix}_${ord}`);
      let slug = base;
      let suffix = 2;
      while (used.has(slug)) slug = `${base}_${suffix++}`;
      used.add(slug);
      out.set(key, slug);
    }
    return out;
  };

  lines.push(`rectangle "Requirements Layer (stories, use cases)" as L_requirements #E1D5E7 {`);
  if (idx.stories.length > 0) {
    const storiesByEpic = new Map();
    for (const s of idx.stories) {
      const key = typeof s.epic === "string" && s.epic.trim() !== "" ? s.epic : "";
      if (!storiesByEpic.has(key)) storiesByEpic.set(key, []);
      storiesByEpic.get(key).push(s);
    }
    const epicKeys = [...storiesByEpic.keys()].sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    });
    const epicSlugs = assignSlugs(epicKeys, "epic");
    for (const key of epicKeys) {
      const label = key === "" ? "Unassigned" : key;
      lines.push(`  rectangle "epic: ${plantQuote(label)}" as L_req_epic_${epicSlugs.get(key)} {`);
      for (const s of storiesByEpic.get(key)) {
        const prio = s.priority ? ` (${s.priority})` : "";
        const lbl = `${s.id}${prio}`;
        lines.push(`    rectangle "${plantQuote(lbl)}" as ${alias(s.id)}`);
      }
      lines.push(`  }`);
    }
  }
  if (idx.usecases.length > 0) {
    const ucBySystem = new Map();
    for (const uc of idx.usecases) {
      const key = typeof uc.system === "string" && uc.system.trim() !== "" ? uc.system : "";
      if (!ucBySystem.has(key)) ucBySystem.set(key, []);
      ucBySystem.get(key).push(uc);
    }
    const sysKeys = [...ucBySystem.keys()].sort((a, b) => {
      if (a === "") return 1;
      if (b === "") return -1;
      return a.localeCompare(b);
    });
    const sysSlugs = assignSlugs(sysKeys, "system");
    for (const key of sysKeys) {
      const label = key === "" ? "(ungrouped)" : key;
      lines.push(`  rectangle "system: ${plantQuote(label)}" as L_req_sys_${sysSlugs.get(key)} {`);
      for (const uc of ucBySystem.get(key)) {
        const lbl = uc.name ? `${uc.id}\\n${uc.name}` : uc.id;
        lines.push(`    usecase "${plantQuote(lbl)}" as ${alias(uc.id)}`);
      }
      lines.push(`  }`);
    }
  }
  if (idx.stories.length === 0 && idx.usecases.length === 0) {
    lines.push(`  rectangle "(no stories or use cases declared)" as L_requirements_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Business layer. Tasks are rendered as nested rectangles inside
  // each process container so that cross-layer arrows from use cases
  // can terminate at the specific task being implemented (rather than
  // collapsing to the process as a whole).
  lines.push(`rectangle "Business Layer (BPMN — processes, actors)" as L_business #FFF2CC {`);
  for (const p of idx.processes) {
    const label = p.name ? `${p.id}\\n${p.name}` : p.id;
    const tasks = Array.isArray(p?.tasks) ? p.tasks.filter((t) => t?.id) : [];
    if (tasks.length === 0) {
      lines.push(`  rectangle "${plantQuote(label)}" as ${alias(p.id)}`);
    } else {
      lines.push(`  rectangle "${plantQuote(label)}" as ${alias(p.id)} {`);
      for (const t of tasks) {
        const tLabel = t.name ? `${t.id}\\n${t.name}` : t.id;
        lines.push(`    rectangle "${plantQuote(tLabel)}" as ${alias(t.id)}`);
      }
      lines.push(`  }`);
    }
  }
  for (const a of idx.actors) {
    const label = a.name ? `${a.id}\\n${a.name}` : a.id;
    lines.push(`  rectangle "${plantQuote(label)}" as ${alias(a.id)}`);
  }
  if (idx.processes.length === 0 && idx.actors.length === 0) {
    lines.push(`  rectangle "(no processes or actors declared)" as L_business_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Data layer.
  lines.push(`rectangle "Data Layer (ERD — entities)" as L_data #DAE8FC {`);
  for (const e of idx.entities) {
    lines.push(`  rectangle "${plantQuote(e.id)}" as ${alias(e.id)}`);
  }
  if (idx.entities.length === 0) {
    lines.push(`  rectangle "(no entities declared)" as L_data_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Application layer (modules nest services; functions float).
  lines.push(`rectangle "Application Layer (services, functions, modules)" as L_application #D5E8D4 {`);
  // Modules with their contained services.
  const placedServices = new Set();
  for (const m of idx.modules) {
    lines.push(`  rectangle "${plantQuote(m.id)}" as ${alias(m.id)} {`);
    for (const sId of m?.contains ?? []) {
      const svc = idx.svcById.get(sId);
      const label = svc?.name ?? sId.replace(/^service:/, "");
      lines.push(`    component "${plantQuote(label)}" as ${alias(sId)}`);
      placedServices.add(sId);
    }
    lines.push(`  }`);
  }
  // Services not placed in any module — render at module level.
  for (const s of idx.services) {
    if (placedServices.has(s.id)) continue;
    const label = s.name ?? s.id.replace(/^service:/, "");
    lines.push(`  component "${plantQuote(label)}" as ${alias(s.id)}`);
  }
  // Functions float.
  for (const f of idx.functions) {
    const label = f.id.replace(/^function:/, "");
    lines.push(`  component "${plantQuote(label)}" as ${alias(f.id)}`);
  }
  if (idx.services.length === 0 && idx.functions.length === 0 && idx.modules.length === 0) {
    lines.push(`  rectangle "(no services, functions, or modules declared)" as L_application_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // Technology layer.
  lines.push(`rectangle "Technology Layer (deployment nodes)" as L_technology #F8CECC {`);
  for (const n of idx.nodes) {
    const envs = idx.nodeToEnvs.get(n.id) ?? [];
    const envTag = envs.length > 0 ? `\\n[${envs.join(", ")}]` : "";
    const kindTag = n.kind ? `\\n«${n.kind}»` : "";
    const label = `${n.id}${kindTag}${envTag}`;
    lines.push(`  rectangle "${plantQuote(label)}" as ${alias(n.id)}`);
  }
  if (idx.nodes.length === 0) {
    lines.push(`  rectangle "(no deployment nodes declared)" as L_technology_empty`);
  }
  lines.push(`}`);
  lines.push("");

  // ─── Cross-layer arrows ────────────────────────────────────────────────
  // Process tasks → functions (implementedBy).
  const seenProcFn = new Set();
  for (const p of idx.processes) {
    for (const t of p?.tasks ?? []) {
      for (const fnId of t?.implementedBy ?? []) {
        if (!idx.fnById.has(fnId)) continue;
        const key = `${p.id}|${fnId}`;
        if (seenProcFn.has(key)) continue;
        seenProcFn.add(key);
        lines.push(`${alias(p.id)} ..> ${alias(fnId)} : "implementedBy"`);
      }
    }
  }
  // Functions → entities (reads / writes).
  for (const f of idx.functions) {
    for (const eId of f?.reads ?? []) {
      if (!idx.entById.has(eId)) continue;
      lines.push(`${alias(f.id)} ..> ${alias(eId)} : "reads"`);
    }
    for (const eId of f?.writes ?? []) {
      if (!idx.entById.has(eId)) continue;
      lines.push(`${alias(f.id)} ..> ${alias(eId)} : "writes"`);
    }
  }
  // Modules → nodes (deployedTo).
  for (const m of idx.modules) {
    for (const nId of m?.deployedTo ?? []) {
      if (!idx.nodeById.has(nId)) continue;
      lines.push(`${alias(m.id)} ..> ${alias(nId)} : "deployedTo"`);
    }
  }
  // Story → use case (realizes).
  for (const s of idx.stories) {
    for (const ucId of s?.realizes ?? []) {
      if (!idx.ucById.has(ucId)) continue;
      lines.push(`${alias(s.id)} ..> ${alias(ucId)} : "realizes"`);
    }
  }
  // Use case → process task (computed transitively via stories).
  // Tasks are first-class diagram nodes nested inside their process
  // container, so the arrow terminates at the specific task being
  // implemented. One arrow per usecase/task pair.
  const ucTaskSeen = new Set();
  for (const link of usecaseTaskLinks(idx)) {
    const key = `${link.usecaseId}|${link.taskId}`;
    if (ucTaskSeen.has(key)) continue;
    ucTaskSeen.add(key);
    lines.push(`${alias(link.usecaseId)} ..> ${alias(link.taskId)} : "implementedBy"`);
  }

  lines.push("");
  lines.push("@enduml");

  return lines.join("\n") + "\n";
}

// ─── Traceability report ──────────────────────────────────────────────────
function renderTraceability(idx) {
  const out = [];
  out.push("# Architecture Traceability");
  out.push("");
  out.push(`Generated from \`designs/system-model.yaml\` on ${new Date().toISOString()}.`);
  out.push("");
  out.push("This report walks every business process down through the stack: tasks → functions → entities → services → modules → deployment nodes. Gaps in the trace are flagged with ⚠ and listed in the summary at the bottom.");
  out.push("");

  if (idx.runtimes.length > 0) {
    out.push("## Runtime platforms");
    out.push("");
    out.push("Informational — declared in `technology.runtimes[]`. No cross-references are validated against this list.");
    out.push("");
    for (const r of idx.runtimes) {
      const usedBy = Array.isArray(r?.usedBy) && r.usedBy.length > 0 ? ` — used by ${r.usedBy.join(", ")}` : "";
      out.push(`- **${r?.name ?? "(unnamed runtime)"}**${usedBy}`);
    }
    out.push("");
  }

  if (idx.processes.length === 0) {
    out.push("> No processes are declared. Add some via the `bpmn-design` skill.");
    out.push("");
  }

  for (const p of idx.processes) {
    const heading = p.name ? `${p.id} — ${p.name}` : p.id;
    out.push(`## ${heading}`);
    if (p.description) {
      out.push("");
      out.push(`> ${p.description}`);
    }
    out.push("");

    // Requirements subsection — stories whose `implementedBy[]` intersects
    // any task's `implementedBy[]` for this process, plus the use cases
    // those stories realize. Skipped when no stories or use cases are
    // declared, so the subsection only appears once a model uses the
    // requirements layer.
    if (idx.stories.length > 0 || idx.usecases.length > 0) {
      const taskFns = new Set();
      for (const t of p?.tasks ?? []) for (const fn of t?.implementedBy ?? []) taskFns.add(fn);
      const matchingStories = [];
      const realizedUcs = new Set();
      for (const s of idx.stories) {
        const hit = (s?.implementedBy ?? []).some((fn) => taskFns.has(fn));
        if (!hit) continue;
        matchingStories.push(s);
        for (const ucId of s?.realizes ?? []) realizedUcs.add(ucId);
      }
      out.push("### Requirements");
      if (matchingStories.length === 0 && realizedUcs.size === 0) {
        out.push("- _No stories or use cases trace down into this process._");
      } else {
        if (realizedUcs.size > 0) {
          out.push("- **Use cases**:");
          for (const ucId of [...realizedUcs].sort()) {
            const uc = idx.ucById.get(ucId);
            const name = uc?.name ? ` — ${uc.name}` : "";
            out.push(`  - ${ucId}${name}`);
          }
        }
        if (matchingStories.length > 0) {
          out.push("- **Stories**:");
          for (const s of matchingStories) {
            const goal = s.goal ? ` — ${s.goal}` : "";
            const prio = s.priority ? ` *(${s.priority})*` : "";
            out.push(`  - ${s.id}${goal}${prio}`);
          }
        }
      }
      out.push("");
    }

    const tasks = p.tasks ?? [];
    if (tasks.length === 0) {
      out.push("⚠ NO TASKS DECLARED");
      out.push("");
      continue;
    }
    for (const t of tasks) {
      const taskHeading = t.name ? `${t.id} — "${t.name}"` : t.id;
      out.push(`### ${taskHeading}`);
      if (t.lane) out.push(`- **Lane**: ${t.lane}`);
      const impls = t.implementedBy ?? [];
      if (impls.length === 0) {
        out.push("- ⚠ NO IMPLEMENTING FUNCTIONS DECLARED — gap");
        out.push("");
        continue;
      }
      out.push("- **Implemented by**:");
      for (const fnId of impls) {
        const fn = idx.fnById.get(fnId);
        out.push(`  - **${fnId}**`);
        if (!fn) {
          out.push(`    - ⚠ function not found in services[].functions[] — run validate.mjs`);
          continue;
        }
        const svcId = fn.service ?? null;
        if (svcId) out.push(`    - Service: ${svcId}`);
        else out.push(`    - ⚠ function has no \`service\` — gap`);
        const modId = svcId ? idx.serviceToModule.get(svcId) : null;
        if (modId) out.push(`    - Module:  ${modId}`);
        else if (svcId) out.push(`    - ⚠ service ${svcId} not contained by any module — gap`);
        if ((fn.reads ?? []).length > 0) out.push(`    - Reads:   ${fn.reads.join(", ")}`);
        if ((fn.writes ?? []).length > 0) out.push(`    - Writes:  ${fn.writes.join(", ")}`);
        if (modId) {
          const mod = idx.modById.get(modId);
          const deployedTo = mod?.deployedTo ?? [];
          if (deployedTo.length === 0) {
            out.push(`    - ⚠ module ${modId} declares no \`deployedTo[]\` — gap`);
          } else {
            const formatted = deployedTo.map((nId) => {
              const envs = idx.nodeToEnvs.get(nId) ?? [];
              return envs.length > 0 ? `${nId} *(${envs.join(", ")})*` : nId;
            }).join(", ");
            out.push(`    - Deployed to: ${formatted}`);
          }
        }
      }
      out.push("");
    }
  }

  return out.join("\n");
}

// ─── Cross-layer gap report ───────────────────────────────────────────────
function buildGapReport(idx) {
  const tasksWithoutImpl = [];
  for (const p of idx.processes) {
    for (const t of p?.tasks ?? []) {
      if ((t?.implementedBy?.length ?? 0) === 0) {
        tasksWithoutImpl.push(`${p.id} / ${t.id}`);
      }
    }
  }

  const fnWithoutService = [];
  for (const f of idx.functions) {
    if (!f.service) fnWithoutService.push(f.id);
  }

  const svcWithoutModule = [];
  for (const s of idx.services) {
    if (!idx.serviceToModule.has(s.id)) svcWithoutModule.push(s.id);
  }

  const modWithoutDeploy = [];
  for (const m of idx.modules) {
    if ((m?.deployedTo?.length ?? 0) === 0) {
      modWithoutDeploy.push(m.id);
    }
  }

  const referencedNodes = new Set();
  for (const m of idx.modules) for (const nId of m?.deployedTo ?? []) referencedNodes.add(nId);
  const orphanNodes = idx.nodes
    .filter((n) => !referencedNodes.has(n.id))
    .map((n) => n.id);

  const procWithoutTasks = idx.processes
    .filter((p) => (p?.tasks?.length ?? 0) === 0)
    .map((p) => p.id);

  // Requirements-layer gaps — informational (excluded from the --strict
  // exit-1 total, in line with the orphan-nodes precedent above).
  const storiesWithoutUsecase = idx.stories
    .filter((s) => (s?.realizes?.length ?? 0) === 0)
    .map((s) => s.id);
  const usecasesWithoutStory = idx.usecases
    .filter((uc) => !idx.usecaseToStories.has(uc.id) || idx.usecaseToStories.get(uc.id).length === 0)
    .map((uc) => uc.id);

  return {
    tasksWithoutImpl,
    fnWithoutService,
    svcWithoutModule,
    modWithoutDeploy,
    orphanNodes,
    procWithoutTasks,
    storiesWithoutUsecase,
    usecasesWithoutStory,
  };
}

// Section list shared by printGapReport and appendGapSummaryToTrace.
// `informational: true` excludes a section from the --strict exit-1 total,
// keeping it in the report for visibility but not failing the build.
function gapSections(rep) {
  return [
    { title: "Process tasks without an implementing function", items: rep.tasksWithoutImpl },
    { title: "Functions without an owning service",            items: rep.fnWithoutService },
    { title: "Services not placed in any module",              items: rep.svcWithoutModule },
    { title: "Modules not deployed",                           items: rep.modWithoutDeploy },
    { title: "Processes with no tasks",                        items: rep.procWithoutTasks },
    { title: "Nodes referenced by no module",                  items: rep.orphanNodes,            informational: true },
    { title: "Stories that realize no use case",               items: rep.storiesWithoutUsecase,  informational: true },
    { title: "Use cases not realized by any story",            items: rep.usecasesWithoutStory,   informational: true },
  ];
}

function printGapReport(rep) {
  const sections = gapSections(rep);
  let total = 0;
  stdout.write("\nCross-layer gap report:\n");
  for (const sec of sections) {
    const tag = sec.informational ? " (informational)" : "";
    if (sec.items.length === 0) {
      stdout.write(`  ✓ ${sec.title}${tag}: none\n`);
    } else {
      stdout.write(`  ⚠ ${sec.title}${tag} (${sec.items.length}):\n`);
      for (const it of sec.items) stdout.write(`      - ${it}\n`);
      if (!sec.informational) total += sec.items.length;
    }
  }
  return total;
}

function appendGapSummaryToTrace(trace, rep) {
  const out = [trace, "---", "", "## Cross-layer gap summary", ""];
  const sections = gapSections(rep);
  let any = false;
  for (const sec of sections) {
    if (sec.items.length === 0) continue;
    any = true;
    const tag = sec.informational ? " (informational)" : "";
    out.push(`- **${sec.title}${tag}** (${sec.items.length}):`);
    for (const it of sec.items) out.push(`  - ${it}`);
  }
  if (!any) out.push("_No cross-layer gaps detected._");
  out.push("");
  return out.join("\n");
}

// ─── --render-all: run sibling generators ─────────────────────────────────
function renderSiblings(modelPath, asJson) {
  const siblings = [
    ["bpmn-design",           "scripts/generate.mjs"],
    ["erd-design",            "scripts/generate.mjs"],
    ["system-design",         "scripts/generate.mjs"],
    ["code-structure-design", "scripts/generate.mjs"],
    ["use-case-design",       "scripts/generate.mjs"],
    ["user-story-design",     "scripts/generate.mjs"],
  ];
  for (const [skill, rel] of siblings) {
    const script = join(SKILLS_ROOT, skill, rel);
    const args = asJson ? ["--json", modelPath] : [modelPath];
    stdout.write(`\n── running ${skill}/${rel} ──\n`);
    const r = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
    if (r.status !== 0) {
      stderr.write(`(${skill} exited with status ${r.status})\n`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let renderAll = false;
  let writeOverview = true;
  let writeTrace = true;
  let strict = false;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--render-all") renderAll = true;
    else if (a === "--no-overview") writeOverview = false;
    else if (a === "--no-trace") writeTrace = false;
    else if (a === "--strict") strict = true;
    else if (a === "-h" || a === "--help") {
      stdout.write(
        "Usage: node generate.mjs [--json] [--render-all] [--no-overview] [--no-trace] [--strict] <path-to-model>\n",
      );
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write(
      "Usage: node generate.mjs [--json] [--render-all] [--no-overview] [--no-trace] [--strict] <path-to-model>\n",
    );
    exit(2);
  }
  const modelPath = resolve(files[0]);
  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  const idx = buildIndex(model);

  if (writeOverview) {
    await mkdir(diagramsDir, { recursive: true });
    const text = renderOverview(idx);
    const path = join(diagramsDir, "ea-overview.puml");
    await writeFile(path, text, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  const gap = buildGapReport(idx);

  if (writeTrace) {
    const trace = renderTraceability(idx);
    const fullTrace = appendGapSummaryToTrace(trace, gap);
    const path = join(designsDir, "ea-traceability.md");
    await writeFile(path, fullTrace, "utf8");
    stdout.write(`Wrote ${path}\n`);
  }

  if (renderAll) renderSiblings(modelPath, asJson);

  stdout.write("\nSummary:\n");
  stdout.write(
    `  • EA — ${idx.processes.length} processes · ${idx.entities.length} entities · ` +
    `${idx.services.length} services · ${idx.functions.length} functions · ` +
    `${idx.modules.length} modules · ${idx.nodes.length} nodes\n`,
  );

  const totalGaps = printGapReport(gap);

  if (strict && totalGaps > 0) {
    stdout.write(`\n--strict: ${totalGaps} gap(s) found, exiting 1.\n`);
    exit(1);
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));

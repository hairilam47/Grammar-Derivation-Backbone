#!/usr/bin/env node
// Generator for the use-case design layer.
//
// Reads designs/system-model.yaml (or --json file), writes one
// designs/diagrams/usecase-<system-slug>.puml file per distinct
// `system` value declared on usecases[]. Use cases with no `system`
// are emitted into designs/diagrams/usecases.puml.
//
// Per-boundary summary and use-case-layer warnings are printed to
// stdout. The foundation validator is invoked before generation so
// grammar / cross-reference errors fail fast — see
// .agents/skills/design-model/scripts/validate.mjs.
//
// Exit codes:
//   0 — success (warnings allowed); also returned for an empty / absent
//       usecases[] section so the script is safe to run on a fresh model
//   1 — foundation validation failed (ID grammar or cross-ref errors)
//   2 — internal failure (file unreadable, parse error)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit, stdout, stderr } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = resolve(__dirname, "..", "..", "design-model", "scripts", "validate.mjs");

// Run the foundation validator as a subprocess on the same model file
// and forward its stdio. Resolves to its exit code.
function runValidator(modelPath, asJson) {
  return new Promise((resolveCode) => {
    const args = [VALIDATOR_PATH];
    if (asJson) args.push("--json");
    args.push(modelPath);
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", (err) => {
      stderr.write(`generate.mjs: failed to spawn foundation validator: ${err.message}\n`);
      resolveCode(2);
    });
    child.on("exit", (code) => resolveCode(code ?? 2));
  });
}

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

// ─── Slug & alias helpers ─────────────────────────────────────────────────
// system label → slug. "Restaurant POS" → "restaurant-pos". Empty
// system maps to the file usecases.puml (handled by the caller).
function systemSlug(label) {
  if (typeof label !== "string") return "ungrouped";
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ungrouped";
}

// usecase:order-food → uc_order_food
function usecaseAlias(id) {
  if (typeof id !== "string") return "uc_unknown";
  return "uc_" + id.replace(/^usecase:/, "").replace(/[^A-Za-z0-9]/g, "_");
}

// actor:Customer → actor_Customer
function actorAlias(id) {
  if (typeof id !== "string") return "actor_unknown";
  return "actor_" + id.replace(/^actor:/, "").replace(/[^A-Za-z0-9]/g, "_");
}

function plantQuote(s) {
  if (s == null) return "";
  return String(s).replace(/"/g, '\\"');
}

// ─── Per-boundary rendering ───────────────────────────────────────────────
// Render one diagram for the given system label and the use cases that
// belong to it. Cross-boundary include/extend/generalizationOf references are
// skipped with a warning so each boundary diagram stays self-contained.
function renderBoundary(systemLabel, ucsInBoundary, model, warnings) {
  const knownActors = new Map(
    (model.actors ?? []).filter((a) => a?.id).map((a) => [a.id, a]),
  );
  const allUcs = new Map(
    (model.usecases ?? []).filter((u) => u?.id).map((u) => [u.id, u]),
  );
  const ucIdsInBoundary = new Set(ucsInBoundary.map((u) => u.id));

  // Diagram-side label — used in @startuml, title, rectangle. PlantUML
  // doesn't like parens in identifiers, so the ungrouped fallback uses
  // a clean "System" label here.
  const diagramLabel = systemLabel || "System";
  // Stdout-side label — used in warning prefixes so they match the
  // summary's "(ungrouped)" string for the no-system bucket.
  const reportLabel = systemLabel || "(ungrouped)";
  const slug = systemLabel ? `usecase-${systemSlug(systemLabel)}` : "usecases";

  const lines = [];
  lines.push(`@startuml ${slug}`);
  lines.push(`' Generated from designs/system-model.yaml — do not hand-edit.`);
  lines.push(`' System boundary: ${diagramLabel}`);
  lines.push(`' Regenerate with: node .agents/skills/use-case-design/scripts/generate.mjs designs/system-model.yaml`);
  lines.push(`title ${plantQuote(diagramLabel)}`);
  lines.push(`left to right direction`);
  lines.push(`skinparam packageStyle rectangle`);
  lines.push(`skinparam backgroundColor white`);
  lines.push("");

  // Actors — union of every actor associated with use cases in this
  // boundary, in declaration order. The first actor of each use case is
  // the primary actor; we don't reorder the global list, but we do mark
  // primaries so a downstream tweak could place them on the left.
  const actorOrder = [];
  const seenActors = new Set();
  for (const uc of ucsInBoundary) {
    for (const a of uc.actors ?? []) {
      if (typeof a !== "string") continue;
      if (seenActors.has(a)) continue;
      seenActors.add(a);
      actorOrder.push(a);
    }
  }
  for (const aid of actorOrder) {
    const actor = knownActors.get(aid);
    const display = actor?.name ?? aid.replace(/^actor:/, "");
    lines.push(`actor "${plantQuote(display)}" as ${actorAlias(aid)}`);
  }
  if (actorOrder.length > 0) lines.push("");

  // Use case rectangle for the system boundary.
  lines.push(`rectangle "${plantQuote(diagramLabel)}" {`);
  for (const uc of ucsInBoundary) {
    const display = uc.name ?? uc.id.replace(/^usecase:/, "");
    lines.push(`  usecase "${plantQuote(display)}" as ${usecaseAlias(uc.id)}`);
  }
  lines.push(`}`);
  lines.push("");

  // Associations: every (actor, use case) pair from actors[].
  for (const uc of ucsInBoundary) {
    for (const aid of uc.actors ?? []) {
      if (typeof aid !== "string") continue;
      if (!seenActors.has(aid)) continue;
      lines.push(`${actorAlias(aid)} --> ${usecaseAlias(uc.id)}`);
    }
  }
  if (ucsInBoundary.some((u) => (u.actors ?? []).length > 0)) lines.push("");

  // Relationships — include, extend, generalization. Cross-boundary
  // references are skipped with a warning; missing references are
  // skipped (foundation validator hard-fails on these).
  const renderRel = (kind, fromId, toId, label) => {
    if (!allUcs.has(toId)) {
      warnings.push(`${reportLabel}: ${fromId} ${kind} ${toId} skipped (target use case is not declared in the model)`);
      return;
    }
    if (!ucIdsInBoundary.has(toId)) {
      warnings.push(`${reportLabel}: ${fromId} ${kind} ${toId} skipped (target lives in a different system boundary)`);
      return;
    }
    const fromAlias = usecaseAlias(fromId);
    const toAlias = usecaseAlias(toId);
    if (kind === "<<include>>") {
      lines.push(`${fromAlias} ..> ${toAlias} : <<include>>`);
    } else if (kind === "<<extend>>") {
      const cond = label ? ` [${plantQuote(label)}]` : "";
      lines.push(`${fromAlias} ..> ${toAlias} : <<extend>>${cond}`);
    } else if (kind === "generalization") {
      // child --|> parent : open triangle on parent end
      lines.push(`${fromAlias} --|> ${toAlias}`);
    }
  };

  let hasRel = false;
  for (const uc of ucsInBoundary) {
    for (const inc of uc.include ?? []) {
      if (typeof inc !== "string") continue;
      if (inc === uc.id) {
        warnings.push(`${reportLabel}: ${uc.id} includes itself — remove the self-reference`);
        continue;
      }
      hasRel = true;
      renderRel("<<include>>", uc.id, inc);
    }
    for (const ext of uc.extend ?? []) {
      const target = ext?.usecase;
      if (typeof target !== "string") continue;
      if (target === uc.id) {
        warnings.push(`${reportLabel}: ${uc.id} extends itself — remove the self-reference`);
        continue;
      }
      hasRel = true;
      renderRel("<<extend>>", uc.id, target, ext.condition);
    }
    if (uc.generalizationOf) {
      const parent = uc.generalizationOf;
      if (parent === uc.id) {
        warnings.push(`${reportLabel}: ${uc.id} declares generalizationOf itself — remove the self-reference`);
      } else {
        hasRel = true;
        renderRel("generalization", uc.id, parent);
      }
    }
  }
  if (hasRel) lines.push("");

  lines.push("@enduml");
  return { puml: lines.join("\n") + "\n", slug };
}

// ─── Per-boundary summary + use-case-layer warnings ───────────────────────
function summariseBoundary(systemLabel, ucsInBoundary, warnings) {
  const boundaryName = systemLabel || "(ungrouped)";
  const actorSet = new Set();
  let includes = 0;
  let extendsCount = 0;
  let generalizations = 0;
  for (const uc of ucsInBoundary) {
    for (const a of uc.actors ?? []) actorSet.add(a);
    includes += (uc.include ?? []).length;
    extendsCount += (uc.extend ?? []).length;
    if (uc.generalizationOf) generalizations += 1;
  }
  const summary =
    `${boundaryName} — ${actorSet.size} actors · ${ucsInBoundary.length} use cases · ` +
    `${includes} includes · ${extendsCount} extends · ${generalizations} generalizations`;

  // No-actor warning
  for (const uc of ucsInBoundary) {
    if (!(uc.actors ?? []).length) {
      warnings.push(`${boundaryName}: ${uc.id} has no actors — every use case needs at least one primary actor`);
    }
  }

  return summary;
}

// ─── Cross-cutting checks (not boundary-scoped) ───────────────────────────
function lintAll(model, warnings) {
  const usecases = model.usecases ?? [];
  const byId = new Map(usecases.filter((u) => u?.id).map((u) => [u.id, u]));

  // Isolation report — a use case is isolated when it has no actors AND
  // is not referenced by any *other* use case's include[],
  // extend[].usecase, or generalizationOf. Self-references are excluded
  // from the reference set so a no-actor use case that only self-
  // includes, self-extends, or names itself as its own generalizationOf
  // still surfaces as isolated (those self-loops are also flagged
  // separately in renderBoundary).
  const referenced = new Set();
  for (const uc of usecases) {
    if (!uc?.id) continue;
    for (const inc of uc.include ?? []) {
      if (inc !== uc.id) referenced.add(inc);
    }
    for (const ext of uc.extend ?? []) {
      if (ext?.usecase && ext.usecase !== uc.id) referenced.add(ext.usecase);
    }
    if (uc.generalizationOf && uc.generalizationOf !== uc.id) referenced.add(uc.generalizationOf);
  }
  for (const uc of usecases) {
    if (!uc?.id) continue;
    const hasActor = (uc.actors ?? []).length > 0;
    if (!hasActor && !referenced.has(uc.id)) {
      warnings.push(`${uc.id}: isolated — no actor associations and not included, extended, or generalized by any other use case`);
    }
  }

  // Generalization-cycle detection via depth-first walk over `generalizationOf`.
  // Multiple start nodes can lead into the same cycle, so canonicalise
  // each detected cycle by its sorted node-set signature and warn at
  // most once per distinct cycle.
  const reportedCycles = new Set();
  for (const start of usecases) {
    if (!start?.id || !start.generalizationOf) continue;
    const path = [start.id];
    const indexInPath = new Map([[start.id, 0]]);
    let cursor = start.generalizationOf;
    while (cursor) {
      if (indexInPath.has(cursor)) {
        // Cycle nodes: from the first occurrence of cursor through the end of path.
        const cycleNodes = path.slice(indexInPath.get(cursor));
        const signature = [...cycleNodes].sort().join("→");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          warnings.push(`generalization cycle detected: ${cycleNodes.concat(cursor).join(" → ")}`);
        }
        break;
      }
      indexInPath.set(cursor, path.length);
      path.push(cursor);
      const next = byId.get(cursor);
      if (!next) break; // unresolved — foundation validator hard-fails
      cursor = next.generalizationOf;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = argv.slice(2);
  let asJson = false;
  let onlySystem = null;
  const files = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") asJson = true;
    else if (a === "--system") onlySystem = args[++i];
    else if (a === "-h" || a === "--help") {
      stdout.write("Usage: node generate.mjs [--json] [--system <label>] <path-to-model>\n");
      exit(0);
    } else files.push(a);
  }
  if (files.length !== 1) {
    stderr.write("Usage: node generate.mjs [--json] [--system <label>] <path-to-model>\n");
    exit(2);
  }
  const modelPath = resolve(files[0]);

  // Run the foundation validator first so grammar / cross-reference
  // errors surface before we try to render anything. Sibling skills
  // delegate this to the user; this skill enforces it because use-case
  // diagrams cross-link heavily (actors, include, extend, generalizationOf)
  // and partial validation makes the warnings here hard to trust.
  const validatorCode = await runValidator(modelPath, asJson);
  if (validatorCode === 1) {
    stderr.write("generate.mjs: foundation validation failed — fix the errors above before regenerating.\n");
    exit(1);
  }
  if (validatorCode !== 0) {
    // 2 = internal failure inside the validator (e.g. missing yaml package).
    // The validator already printed its own diagnostic to stderr.
    exit(2);
  }

  const model = await loadModel(modelPath, asJson);
  if (!model || typeof model !== "object") fatal("Model file did not parse to an object.");
  if (!Array.isArray(model.usecases) || model.usecases.length === 0) {
    // Empty/absent usecases[] is a clean no-op — the model may simply
    // not use this layer yet. Mirrors the "skill is safe to run on a
    // fresh model" requirement so a top-level "regenerate everything"
    // script can call this without special-casing.
    stdout.write("No usecases[] section in the model — nothing to generate.\n");
    exit(0);
  }

  const designsDir = dirname(modelPath);
  const diagramsDir = join(designsDir, "diagrams");
  await mkdir(diagramsDir, { recursive: true });

  // Group by system field. Empty / missing system goes into the
  // "" bucket which renders to designs/diagrams/usecases.puml.
  const groups = new Map();
  for (const uc of model.usecases) {
    if (!uc?.id) continue;
    const key = typeof uc.system === "string" && uc.system.trim() !== ""
      ? uc.system
      : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(uc);
  }

  // Filter by --system if requested. Match the literal label (case-sensitive)
  // against the user's input — that is what they declared in the model.
  let targets = [...groups.entries()];
  if (onlySystem !== null) {
    targets = targets.filter(([label]) => label === onlySystem);
    if (targets.length === 0) {
      const known = [...groups.keys()].map((k) => k === "" ? "(ungrouped)" : k).join(", ");
      fatal(`No use cases match --system "${onlySystem}". Known boundaries: ${known}`);
    }
  }

  // Guard against system labels that slugify to the same filename
  // (e.g. "A B" and "A-B" both → "a-b") — silent overwrite would lose
  // a diagram. Detect across the FULL group set (not just --system
  // targets) so a partial regenerate never clobbers a previously-
  // emitted file from a colliding boundary.
  const slugToLabels = new Map();
  for (const [label] of groups.entries()) {
    const s = label ? `usecase-${systemSlug(label)}` : "usecases";
    if (!slugToLabels.has(s)) slugToLabels.set(s, []);
    slugToLabels.get(s).push(label === "" ? "(ungrouped)" : label);
  }
  const collisions = [...slugToLabels.entries()].filter(([, labels]) => labels.length > 1);
  if (collisions.length > 0) {
    const detail = collisions
      .map(([s, ls]) => `  ${s}.puml ← ${ls.map((l) => `"${l}"`).join(", ")}`)
      .join("\n");
    fatal(
      "Two or more system labels slugify to the same filename:\n" +
      detail + "\n" +
      "Rename one of the colliding system labels in the model so each boundary writes a distinct file."
    );
  }

  const warnings = [];
  const summaries = [];
  for (const [systemLabel, ucs] of targets) {
    const { puml, slug } = renderBoundary(systemLabel, ucs, model, warnings);
    const path = join(diagramsDir, `${slug}.puml`);
    await writeFile(path, puml, "utf8");
    stdout.write(`Wrote ${path}\n`);
    summaries.push(summariseBoundary(systemLabel, ucs, warnings));
  }

  // Cross-cutting checks always run on the full model so reports stay
  // honest even when only one boundary was regenerated.
  lintAll(model, warnings);

  stdout.write("\nSummary:\n");
  for (const s of summaries) stdout.write(`  • ${s}\n`);
  if (warnings.length > 0) {
    stdout.write("\nWARNINGS:\n");
    warnings.forEach((w, i) => stdout.write(`  ${i + 1}. ${w}\n`));
  } else {
    stdout.write("\nNo use-case-layer warnings.\n");
  }
  exit(0);
}

main().catch((e) => fatal(`Internal error: ${e.stack || e.message}`));

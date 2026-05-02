// OrgStructurePage — `/org-structure` collapsible per-Module tree.

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentScope } from "@/governance/CurrentOrgWorkItemContext";
import { assertAllOnboardingLanguage } from "@/governance/staticTextGuard";
import {
  getOrganisation,
  subscribe as subscribeOrgs,
  getStoreVersion as getOrgStoreVersion,
} from "@/governance/orgStore";
import {
  getEaBlueprintForOrg,
  subscribe as subscribeWorkItems,
  getStoreVersion as getWorkItemStoreVersion,
} from "@/governance/workItemStore";
import {
  listModules,
  subscribe as subscribeModules,
  getStoreVersion as getModuleStoreVersion,
  type Module,
} from "@/governance/moduleCatalogStore";
import {
  ACW_ELEMENT_TYPE_LABEL,
  type AcwElementType,
} from "@/acw/acwGrammar";
import {
  readBpmnTasksForBlueprint,
  type BpmnTaskSummary,
} from "./orgStructureBpmn";

const STATIC_LABELS = {
  heading: "Organisation Structure",
  description:
    "A read-only tree of the Modules registered for this Organisation and the Business-Process tasks bound to each Module. Expand a Module to jump into a Business-Process task on the design surface.",
  backButton: "Back to Organisation Home",
  openBlueprintButton: "Open Enterprise Architecture Blueprint",
  modulesTitle: "Modules",
  modulesDescription:
    "Modules are listed in alphabetical order. Expand a Module to view the Business-Process tasks bound to it.",
  noModules:
    "No Modules have been registered yet. Open the Enterprise Architecture Blueprint to add the first one.",
  noProcessesForModule: "No processes defined.",
  unboundGroupLabel: "Unbound (no Module selected)",
  unboundGroupDescription:
    "Business-Process tasks authored on the Enterprise Architecture Blueprint that are not bound to any Module in the catalogue.",
  countSuffix: "task(s)",
  blueprintMissing:
    "No Enterprise Architecture Blueprint Work Item is registered for this Organisation.",
  noOrgTitle: "No Organisation selected",
  noOrgHint: "Pick an Organisation to open the Organisation Structure.",
  expandLabel: "Expand",
  collapseLabel: "Collapse",
  unknownTypeLabel: "Unknown type",
} as const;

assertAllOnboardingLanguage(Object.values(STATIC_LABELS));

interface ModuleTreeGroup {
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  readonly module: Module | null;
  readonly tasks: readonly BpmnTaskSummary[];
}

// Real Modules sort alphabetically and always appear (even when
// empty); tasks with no resolvable Module fold into a synthetic
// "Unbound" group rendered last.
function buildModuleTree(
  modules: readonly Module[],
  tasks: readonly BpmnTaskSummary[],
): readonly ModuleTreeGroup[] {
  const byId = new Map<string, BpmnTaskSummary[]>();
  const unbound: BpmnTaskSummary[] = [];
  for (const task of tasks) {
    if (task.moduleId === null) {
      unbound.push(task);
      continue;
    }
    const bucket = byId.get(task.moduleId);
    if (bucket) bucket.push(task);
    else byId.set(task.moduleId, [task]);
  }
  const sortedModules = [...modules].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const groups: ModuleTreeGroup[] = [];
  const knownIds = new Set<string>();
  for (const m of sortedModules) {
    knownIds.add(m.id);
    groups.push({
      key: m.id,
      displayName: m.name,
      description: m.description,
      module: m,
      tasks: byId.get(m.id) ?? [],
    });
  }
  for (const [moduleId, bucket] of byId.entries()) {
    if (knownIds.has(moduleId)) continue;
    for (const t of bucket) unbound.push(t);
  }
  if (unbound.length > 0) {
    groups.push({
      key: "__unbound__",
      displayName: STATIC_LABELS.unboundGroupLabel,
      description: STATIC_LABELS.unboundGroupDescription,
      module: null,
      tasks: unbound,
    });
  }
  return groups;
}

function nodeTypeLabel(type: AcwElementType | null): string {
  if (type === null) return STATIC_LABELS.unknownTypeLabel;
  return ACW_ELEMENT_TYPE_LABEL[type];
}

export default function OrgStructurePage() {
  const { orgId, setWorkItemId } = useCurrentScope();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const orgVersion = useSyncExternalStore(
    subscribeOrgs,
    getOrgStoreVersion,
    getOrgStoreVersion,
  );
  const wiVersion = useSyncExternalStore(
    subscribeWorkItems,
    getWorkItemStoreVersion,
    getWorkItemStoreVersion,
  );
  const modVersion = useSyncExternalStore(
    subscribeModules,
    getModuleStoreVersion,
    getModuleStoreVersion,
  );

  const organisation = useMemo(
    () => (orgId ? getOrganisation(orgId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, orgVersion],
  );
  const modules = useMemo(
    () => (orgId ? listModules() : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, modVersion],
  );
  const eaBlueprint = useMemo(
    () => (orgId ? getEaBlueprintForOrg(orgId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, wiVersion],
  );
  const bpmnTasks = useMemo(
    () =>
      orgId && eaBlueprint
        ? readBpmnTasksForBlueprint(orgId, eaBlueprint.id)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId, eaBlueprint?.id, wiVersion, modVersion],
  );
  const tree = useMemo(
    () => buildModuleTree(modules, bpmnTasks),
    [modules, bpmnTasks],
  );

  useEffect(() => {
    document.title = STATIC_LABELS.heading;
  }, []);

  if (!orgId || !organisation) {
    return (
      <div
        className="min-h-[100dvh] bg-background text-foreground flex flex-col"
        data-testid="org-structure-no-org"
      >
        <main className="flex-1 container max-w-4xl mx-auto px-4 py-16">
          <Card>
            <CardHeader className="space-y-2">
              <CardTitle>{STATIC_LABELS.noOrgTitle}</CardTitle>
              <CardDescription>{STATIC_LABELS.noOrgHint}</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </div>
    );
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleOpenBlueprint() {
    if (!eaBlueprint) return;
    setWorkItemId(eaBlueprint.id);
    navigate("/workspace/studio");
  }

  // `/ctad/design` is gated on a current Work Item, so we set the
  // EA Blueprint as active before navigating to the deep link.
  function handleOpenTask(taskId: string) {
    if (!eaBlueprint) return;
    setWorkItemId(eaBlueprint.id);
    navigate(`/ctad/design?nodeId=${encodeURIComponent(taskId)}`);
  }

  return (
    <div
      className="min-h-[100dvh] bg-background text-foreground flex flex-col"
      data-testid="org-structure"
    >
      <main className="flex-1 container max-w-5xl mx-auto px-4 py-12 space-y-8">
        <div
          className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          data-testid="org-structure-heading"
        >
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {STATIC_LABELS.heading}
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              {STATIC_LABELS.description}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 self-start">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/org-home")}
              data-testid="button-back-to-org-home"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              {STATIC_LABELS.backButton}
            </Button>
            <Button
              type="button"
              onClick={handleOpenBlueprint}
              disabled={!eaBlueprint}
              data-testid="button-open-blueprint-from-structure"
            >
              <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
              {STATIC_LABELS.openBlueprintButton}
            </Button>
          </div>
        </div>

        {!eaBlueprint && (
          <p
            className="text-xs text-destructive"
            data-testid="text-structure-blueprint-missing"
          >
            {STATIC_LABELS.blueprintMissing}
          </p>
        )}

        <Card data-testid="card-structure-tree">
          <CardHeader className="space-y-2">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-secondary/60 border border-border/60">
              <Layers className="w-4 h-4" aria-hidden="true" />
            </span>
            <CardTitle className="text-base">
              {STATIC_LABELS.modulesTitle}
            </CardTitle>
            <CardDescription className="text-xs">
              {STATIC_LABELS.modulesDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tree.length === 0 ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="text-structure-no-modules"
              >
                {STATIC_LABELS.noModules}
              </p>
            ) : (
              <ul
                className="divide-y divide-border/60"
                data-testid="list-structure-tree"
              >
                {tree.map((g) => {
                  const isOpen = expanded.has(g.key);
                  const Chevron = isOpen ? ChevronDown : ChevronRight;
                  const toggleLabel = isOpen
                    ? STATIC_LABELS.collapseLabel
                    : STATIC_LABELS.expandLabel;
                  return (
                    <li
                      key={g.key}
                      className="py-2"
                      data-testid={`structure-tree-group-${g.key}`}
                    >
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-3 text-left rounded-md px-2 py-1.5 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => toggle(g.key)}
                        aria-expanded={isOpen}
                        aria-label={`${toggleLabel} ${g.displayName}`}
                        data-testid={`button-toggle-${g.key}`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Chevron
                            className="w-4 h-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium truncate">
                            {g.displayName}
                          </span>
                        </span>
                        <span
                          className="text-xs text-muted-foreground tabular-nums whitespace-nowrap"
                          data-testid={`structure-tree-count-${g.key}`}
                        >
                          {g.tasks.length} {STATIC_LABELS.countSuffix}
                        </span>
                      </button>
                      {isOpen && (
                        <div
                          className="pl-7 pr-2 py-2 space-y-1"
                          data-testid={`structure-tree-children-${g.key}`}
                        >
                          {g.description && (
                            <p className="text-xs text-muted-foreground">
                              {g.description}
                            </p>
                          )}
                          {g.tasks.length === 0 ? (
                            <p
                              className="text-xs text-muted-foreground italic"
                              data-testid={`structure-tree-empty-${g.key}`}
                            >
                              {STATIC_LABELS.noProcessesForModule}
                            </p>
                          ) : (
                            <ul className="space-y-0.5">
                              {g.tasks.map((t) => (
                                <li key={t.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left text-xs text-foreground/80 hover:text-foreground hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed flex items-center justify-between gap-2"
                                    onClick={() => handleOpenTask(t.id)}
                                    disabled={!eaBlueprint}
                                    data-testid={`link-structure-task-${t.id}`}
                                  >
                                    <span
                                      className="truncate"
                                      data-testid={`text-structure-task-label-${t.id}`}
                                    >
                                      {t.label}
                                    </span>
                                    <span
                                      className="text-muted-foreground whitespace-nowrap"
                                      data-testid={`text-structure-task-type-${t.id}`}
                                    >
                                      {nodeTypeLabel(t.type)}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

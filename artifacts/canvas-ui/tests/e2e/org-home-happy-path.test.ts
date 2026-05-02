// Headless happy-path probe for Task #166: org select →
// org-home → blueprint open → subtype creation, exercised
// through the real org/work-item stores rather than DOM.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createOrganisation,
  removeOrganisation,
  updateOrganisation,
  getOrganisation,
} from "@/governance/orgStore";
import {
  createWorkItem,
  getEaBlueprintForOrg,
  listWorkItemsForOrg,
} from "@/governance/workItemStore";
import { summariseWorkItems } from "@/pages/onboarding/organisationHomeSummary";
import {
  countBoundBpmnTasks,
  readBpmnTasksForBlueprint,
} from "@/pages/onboarding/orgStructureBpmn";
import { BASE_STORAGE_KEY as ACW_BASE_STORAGE_KEY } from "@/acw/acwStore";
import { getScopedKey } from "@/governance/storageKeyUtils";

const ORG_KEY = "app.organisations.v1";
const WI_KEY = "app.work-items.v1";
const SCOPE_KEY = "app.current-scope.v1";

function snapshot(): Record<string, string | null> {
  return {
    [ORG_KEY]: localStorage.getItem(ORG_KEY),
    [WI_KEY]: localStorage.getItem(WI_KEY),
    [SCOPE_KEY]: localStorage.getItem(SCOPE_KEY),
  };
}

function restore(snap: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(snap)) {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
}

describe("org-home happy path (task #166)", () => {
  let prior: Record<string, string | null>;

  beforeEach(() => {
    prior = snapshot();
    localStorage.removeItem(ORG_KEY);
    localStorage.removeItem(WI_KEY);
    localStorage.removeItem(SCOPE_KEY);
  });

  afterEach(() => restore(prior));

  it("seeds an EA Blueprint per Organisation and counts it in the Work Items total", () => {
    const { organisation, eaBlueprintWorkItemId } = createOrganisation({
      name: "Probe Org Home",
      sector: "private-sector",
      natureOfBusiness: "other",
    });

    const blueprint = getEaBlueprintForOrg(organisation.id);
    expect(blueprint).not.toBeNull();
    expect(blueprint?.id).toBe(eaBlueprintWorkItemId);

    const summary = summariseWorkItems(listWorkItemsForOrg(organisation.id));
    expect(summary.total).toBe(1);
    expect(summary.byType.project).toBe(0);
    expect(summary.byType.enhancement).toBe(0);
    expect(summary.byType["change-request"]).toBe(0);

    removeOrganisation(organisation.id);
  });

  it("persists subtype on a new Project Work Item and updates the breakdown", () => {
    const { organisation } = createOrganisation({
      name: "Probe Org Subtype",
      sector: "private-sector",
      natureOfBusiness: "other",
    });
    const project = createWorkItem({
      orgId: organisation.id,
      type: "project",
      title: "Probe Project",
      description: "",
      subtype: "New Application",
    });
    expect(project.subtype).toBe("New Application");
    const enhancement = createWorkItem({
      orgId: organisation.id,
      type: "enhancement",
      title: "Probe Enhancement",
      description: "",
    });
    expect(enhancement.subtype).toBeUndefined();

    const summary = summariseWorkItems(listWorkItemsForOrg(organisation.id));
    expect(summary.total).toBe(3); // EA Blueprint + project + enhancement
    expect(summary.byType.project).toBe(1);
    expect(summary.byType.enhancement).toBe(1);
    expect(summary.byType["change-request"]).toBe(0);

    removeOrganisation(organisation.id);
  });

  it("counts BPMN tasks bound to a Module from the EA Blueprint ACW doc", () => {
    const { organisation, eaBlueprintWorkItemId } = createOrganisation({
      name: "Probe Org BPMN",
      sector: "private-sector",
      natureOfBusiness: "other",
    });

    const acwKey = getScopedKey(
      ACW_BASE_STORAGE_KEY,
      organisation.id,
      eaBlueprintWorkItemId,
    );
    localStorage.setItem(
      acwKey,
      JSON.stringify({
        schemaVersion: "acw-1.0",
        structureGraph: {
          nodes: [
            {
              id: "n-bpmn-bound",
              label: "Receive order",
              type: "Component",
              diagramType: "bpmn",
              moduleId: "mod-orders",
            },
            {
              id: "n-bpmn-unbound",
              label: "Pick item",
              type: "Component",
              diagramType: "bpmn",
            },
            {
              id: "n-erd-noise",
              label: "Customer",
              type: "Component",
              diagramType: "erd",
              moduleId: "mod-orders",
            },
          ],
          edges: [],
        },
      }),
    );

    const tasks = readBpmnTasksForBlueprint(
      organisation.id,
      eaBlueprintWorkItemId,
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[0].moduleId).toBe("mod-orders");
    expect(tasks[1].moduleId).toBeNull();
    expect(countBoundBpmnTasks(tasks)).toBe(1);

    removeOrganisation(organisation.id);
  });

  it("edits Profile fields via updateOrganisation and preserves immutable fields", () => {
    const { organisation } = createOrganisation({
      name: "Probe Org Profile",
      sector: "private-sector",
      natureOfBusiness: "other",
    });
    const before = getOrganisation(organisation.id);
    expect(before).not.toBeNull();
    const beforeSlug = before!.slug;
    const beforeCreatedAt = before!.createdAt;

    updateOrganisation(organisation.id, {
      name: "Probe Org Profile (renamed)",
      sector: "government",
      natureOfBusiness: "government-administration",
    });

    const after = getOrganisation(organisation.id);
    expect(after).not.toBeNull();
    expect(after!.name).toBe("Probe Org Profile (renamed)");
    expect(after!.sector).toBe("government");
    expect(after!.natureOfBusiness).toBe("government-administration");
    expect(after!.slug).toBe(beforeSlug);
    expect(after!.createdAt).toBe(beforeCreatedAt);

    removeOrganisation(organisation.id);
  });
});

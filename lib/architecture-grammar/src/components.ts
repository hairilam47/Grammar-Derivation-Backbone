import type { Component } from "./types.js";

export const COMPONENTS: readonly Component[] = Object.freeze([
  {
    id: "COMP_EXTERNAL_PORTAL",
    name: "External User Portal",
    layer: "UI",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_INTERNAL_PORTAL",
    name: "Internal Admin Portal",
    layer: "UI",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_API_INTERFACE",
    name: "API Interface",
    layer: "Integration",
    complexityWeight: 1,
    operationalImpact: 1,
  },
  {
    id: "COMP_APP_SERVICE",
    name: "Application Service Layer",
    layer: "Application",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_WORKFLOW_ENGINE",
    name: "Workflow / Process Engine",
    layer: "Application",
    complexityWeight: 3,
    operationalImpact: 3,
  },
  {
    id: "COMP_RULES_ENGINE",
    name: "Rules Engine",
    layer: "Application",
    complexityWeight: 3,
    operationalImpact: 2,
  },
  {
    id: "COMP_RELATIONAL_STORE",
    name: "Relational Data Store",
    layer: "Data",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_DOCUMENT_REPO",
    name: "Document / File Repository",
    layer: "Data",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_AUDIT_STORE",
    name: "Immutable Audit Store",
    layer: "Data",
    complexityWeight: 3,
    operationalImpact: 3,
  },
  {
    id: "COMP_API_GATEWAY",
    name: "API Gateway",
    layer: "Integration",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_EVENT_BROKER",
    name: "Event / Message Broker",
    layer: "Integration",
    complexityWeight: 3,
    operationalImpact: 3,
  },
  {
    id: "COMP_EXTERNAL_CONNECTOR",
    name: "External System Connector",
    layer: "Integration",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_AUTH_SERVICE",
    name: "Authentication Service",
    layer: "Security",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_AUTHZ_ACCESS",
    name: "Authorization & Access Control",
    layer: "Security",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_AUDIT_LOGGING",
    name: "Audit Logging Service",
    layer: "Security",
    complexityWeight: 1,
    operationalImpact: 1,
  },
  {
    id: "COMP_ENCRYPTION",
    name: "Encryption & Key Management",
    layer: "Security",
    complexityWeight: 2,
    operationalImpact: 2,
  },
  {
    id: "COMP_MONITORING",
    name: "Monitoring & Observability",
    layer: "Operations",
    complexityWeight: 1,
    operationalImpact: 2,
  },
  {
    id: "COMP_BACKUP_DR",
    name: "Backup & Disaster Recovery",
    layer: "Operations",
    complexityWeight: 2,
    operationalImpact: 3,
  },
]);

export function getComponentById(id: string): Component {
  const comp = COMPONENTS.find((c) => c.id === id);
  if (!comp) {
    throw new Error(`Unknown component id: ${id}`);
  }
  return comp;
}

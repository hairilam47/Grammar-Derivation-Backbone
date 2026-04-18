import type { Capability } from "./types.js";

export const CAPABILITIES: readonly Capability[] = Object.freeze([
  {
    id: "CAP_EXTERNAL_ACCESS",
    name: "External / Public Access",
    description:
      "Allows members of the public or external partners to interact with the system via a publicly reachable interface.",
  },
  {
    id: "CAP_INTERNAL_ADMIN",
    name: "Internal Administrative Access",
    description:
      "Provides staff and administrators with tools to manage data, users, and system configuration through a secured internal portal.",
  },
  {
    id: "CAP_CASE_MANAGEMENT",
    name: "Case / Transaction Management",
    description:
      "Tracks and manages discrete cases, claims, applications, or business transactions through their full lifecycle.",
  },
  {
    id: "CAP_DOCUMENT_MANAGEMENT",
    name: "Document & Evidence Management",
    description:
      "Handles the storage, versioning, retrieval, and management of documents, attachments, and evidence files.",
  },
  {
    id: "CAP_WORKFLOW_APPROVAL",
    name: "Workflow & Approval",
    description:
      "Orchestrates multi-step business processes, routing items to the correct people or systems for review and approval.",
  },
  {
    id: "CAP_REPORTING_ANALYTICS",
    name: "Reporting & Analytics",
    description:
      "Produces structured reports, dashboards, and analytical outputs from system data to support decision-making.",
  },
  {
    id: "CAP_AUDIT_COMPLIANCE",
    name: "Audit & Compliance",
    description:
      "Maintains tamper-evident records of all significant system events and data changes to satisfy regulatory and audit requirements.",
  },
]);

export function getCapabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

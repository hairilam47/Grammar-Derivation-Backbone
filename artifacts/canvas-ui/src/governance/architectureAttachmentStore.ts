// Architecture-attachment store — `adc.architecture-attachments.v1`.
//
// Phase 2 of the "Decouple ADC from CTAD/ACW Track 3 and Diagrams"
// plan. This module owns a single localStorage document that records
// many-to-many links between standalone CTAD architecture workspaces
// (identified by `architectureId`) and frozen ADC decisions
// (identified by `adsId` + `adsVersion`).
//
// Architectural constraints:
//   - This store NEVER mutates portfolio entries, signals, ADS, ECP,
//     or the CTAD store. It owns only its own document.
//   - Reads on the portfolio side are purely informational (count
//     and tooltip on `pages/Portfolio.tsx`); the portfolio surface
//     cannot create or detach links.
//   - Linking carries no authority — an attachment is a contractual
//     reference, not a gate. The architecture continues to exist
//     and be editable independently of any link.
//   - Bindings with zero links are removed from the document on
//     every detach (no empty-binding leak).

import {
  isValidArchitectureId,
} from "@/ctad/architectureIdentity";
import { getArchitectureDoc } from "@/ctad/ctadStore";
import { getEntry } from "./portfolioStore";
import { resolveActiveKey, currentScope } from "./storageKeyUtils";
import {
  readScoped,
  writeScoped,
  onScopeOrHydrationChange,
} from "./scopedStorageClient";

// Phase 2 (SaaS Onboarding) — Org+WorkItem scope.
export const BASE_STORAGE_KEY = "adc.architecture-attachments.v1";

function getStorageKey(): string | null {
  return resolveActiveKey(BASE_STORAGE_KEY, true);
}
export const ATTACHMENT_SCHEMA_VERSION = "att-1.0" as const;

const LINK_ID_RE = /^link-[0-9a-f]{12}$/;

export interface ArchitectureAttachmentLink {
  readonly linkId: string;
  readonly architectureId: string;
  readonly adsId: string;
  readonly adsVersion: string;
  readonly attachedAt: string;
}

interface AttachmentStoreDoc {
  readonly schemaVersion: typeof ATTACHMENT_SCHEMA_VERSION;
  readonly links: Readonly<Record<string, ArchitectureAttachmentLink>>;
}

const EMPTY_DOC: AttachmentStoreDoc = Object.freeze({
  schemaVersion: ATTACHMENT_SCHEMA_VERSION,
  links: Object.freeze({}),
});

function isPlainAdsId(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 256;
}
function isPlainAdsVersion(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]+$/.test(s);
}
function isPlainLinkId(s: unknown): s is string {
  return typeof s === "string" && LINK_ID_RE.test(s);
}

function isValidLink(value: unknown): value is ArchitectureAttachmentLink {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!isPlainLinkId(v.linkId)) return false;
  if (typeof v.architectureId !== "string" || !isValidArchitectureId(v.architectureId)) return false;
  if (!isPlainAdsId(v.adsId)) return false;
  if (!isPlainAdsVersion(v.adsVersion)) return false;
  if (typeof v.attachedAt !== "string" || v.attachedAt.length === 0) return false;
  return true;
}

function readDoc(): AttachmentStoreDoc {
  const raw = readScoped(getStorageKey());
  if (raw === null) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(raw) as Partial<AttachmentStoreDoc>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.schemaVersion !== ATTACHMENT_SCHEMA_VERSION ||
      typeof parsed.links !== "object" ||
      parsed.links === null
    ) {
      return EMPTY_DOC;
    }
    const cleaned: Record<string, ArchitectureAttachmentLink> = {};
    for (const [key, val] of Object.entries(parsed.links)) {
      if (key !== (val as ArchitectureAttachmentLink | undefined)?.linkId) continue;
      if (!isValidLink(val)) continue;
      cleaned[key] = val;
    }
    return {
      schemaVersion: ATTACHMENT_SCHEMA_VERSION,
      links: cleaned,
    };
  } catch {
    return EMPTY_DOC;
  }
}

function writeDoc(doc: AttachmentStoreDoc): void {
  const key = getStorageKey();
  if (key === null) return;
  writeScoped(key, JSON.stringify(doc));
  bumpVersion();
}

if (typeof window !== "undefined") {
  onScopeOrHydrationChange(() => {
    bumpVersion();
  });
}

let storeVersion = 0;
const listeners = new Set<() => void>();
function bumpVersion(): void {
  storeVersion += 1;
  for (const l of listeners) l();
}
export function getStoreVersion(): number {
  return storeVersion;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function generateLinkId(): string {
  const bytes = new Uint8Array(6);
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `link-${hex}`;
}

// Existence-check carve-out for the build-time invariant probe.
// The probe runs against synthetic identifiers that intentionally
// do not correspond to real CTAD architectures or portfolio entries
// (so that probing never depends on user data). When this flag is
// set, attachADC skips the runtime existence checks but still
// enforces every format / shape rule. Production code never sets
// this flag; only the invariant module flips it for the duration
// of its probe.
let SKIP_EXISTENCE_CHECKS = false;
export function __setSkipExistenceChecksForInvariantProbe(value: boolean): void {
  SKIP_EXISTENCE_CHECKS = value;
}

// Idempotent: re-attaching the same (architectureId, adsId, adsVersion)
// triple returns the existing linkId rather than creating a duplicate.
// Validators reject malformed identifiers AND unknown architecture / ADC
// ids — task-79 spec requires both ("validators reject malformed ids and
// unknown architecture / ADC ids").
export function attachADC(
  architectureId: string,
  adsId: string,
  adsVersion: string,
): string {
  if (!isValidArchitectureId(architectureId)) {
    throw new Error(
      `architectureAttachmentStore: invalid architectureId "${architectureId}".`,
    );
  }
  if (!isPlainAdsId(adsId)) {
    throw new Error(
      `architectureAttachmentStore: invalid adsId "${String(adsId)}".`,
    );
  }
  if (!isPlainAdsVersion(adsVersion)) {
    throw new Error(
      `architectureAttachmentStore: invalid adsVersion "${String(adsVersion)}".`,
    );
  }
  if (!SKIP_EXISTENCE_CHECKS) {
    if (getArchitectureDoc(architectureId) === null) {
      throw new Error(
        `architectureAttachmentStore: unknown architectureId "${architectureId}" — ` +
          `no CTAD architecture workspace with that id exists.`,
      );
    }
    if (getEntry(adsId, adsVersion) === null) {
      throw new Error(
        `architectureAttachmentStore: unknown ADC entry "${adsId}@${adsVersion}" — ` +
          `no frozen portfolio entry matches that adsId / adsVersion.`,
      );
    }
  }
  const doc = readDoc();
  for (const link of Object.values(doc.links)) {
    if (
      link.architectureId === architectureId &&
      link.adsId === adsId &&
      link.adsVersion === adsVersion
    ) {
      return link.linkId;
    }
  }
  const linkId = generateLinkId();
  const next: ArchitectureAttachmentLink = Object.freeze({
    linkId,
    architectureId,
    adsId,
    adsVersion,
    attachedAt: new Date().toISOString(),
  });
  writeDoc({
    schemaVersion: ATTACHMENT_SCHEMA_VERSION,
    links: { ...doc.links, [linkId]: next },
  });
  return linkId;
}

export function detachADC(linkId: string): void {
  if (!isPlainLinkId(linkId)) return;
  const doc = readDoc();
  if (!(linkId in doc.links)) return;
  const nextLinks: Record<string, ArchitectureAttachmentLink> = { ...doc.links };
  delete nextLinks[linkId];
  writeDoc({
    schemaVersion: ATTACHMENT_SCHEMA_VERSION,
    links: nextLinks,
  });
}

export function getAttachedADCs(
  architectureId: string,
): readonly ArchitectureAttachmentLink[] {
  if (!isValidArchitectureId(architectureId)) return [];
  const doc = readDoc();
  return Object.values(doc.links)
    .filter((l) => l.architectureId === architectureId)
    .sort((a, b) => (a.attachedAt < b.attachedAt ? -1 : a.attachedAt > b.attachedAt ? 1 : 0));
}

export function getArchitecturesForADC(
  adsId: string,
  adsVersion: string,
): readonly ArchitectureAttachmentLink[] {
  if (!isPlainAdsId(adsId) || !isPlainAdsVersion(adsVersion)) return [];
  const doc = readDoc();
  return Object.values(doc.links)
    .filter((l) => l.adsId === adsId && l.adsVersion === adsVersion)
    .sort((a, b) => (a.attachedAt < b.attachedAt ? -1 : a.attachedAt > b.attachedAt ? 1 : 0));
}

export function listAllLinks(): readonly ArchitectureAttachmentLink[] {
  const doc = readDoc();
  return Object.values(doc.links);
}

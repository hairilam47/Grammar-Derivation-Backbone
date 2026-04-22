// DiagramSpec — JSON Schema artifact (Draft 2020-12 subset).
//
// This is the AUTHORITATIVE structural contract published by the
// package. The validator (`validator.ts`) uses this schema as its
// single source of truth for shape rules; cross-field semantics
// (viewType x stratum pairing, edge endpoint resolution, parent
// id resolution, duplicate-id checks) are layered ON TOP because
// they are not expressible in pure JSON Schema.
//
// Keeping the schema in code (not JSON-on-disk) means it is
// type-checked, tree-shaken, and importable by any consumer that
// wants to publish or validate against it without pulling a heavy
// validator dependency.

import {
  DIAGRAM_NODE_KINDS,
  DIAGRAM_RELATIONS,
  DIAGRAM_STRATA,
  DIAGRAM_VIEW_TYPES,
  DIAGRAMSPEC_SCHEMA_VERSION,
} from "./types";

export const DIAGRAMSPEC_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://workspace.local/schemas/diagramspec.json",
  title: "DiagramSpec",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "viewType", "stratum", "nodes", "edges"],
  properties: {
    schemaVersion: { const: DIAGRAMSPEC_SCHEMA_VERSION },
    viewType: { type: "string", enum: [...DIAGRAM_VIEW_TYPES] },
    stratum: { type: "string", enum: [...DIAGRAM_STRATA] },
    nodes: {
      type: "array",
      items: { $ref: "#/$defs/Node" },
    },
    edges: {
      type: "array",
      items: { $ref: "#/$defs/Edge" },
    },
  },
  $defs: {
    Node: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "label", "parentId", "ctadRef"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { type: "string", enum: [...DIAGRAM_NODE_KINDS] },
        label: { type: "string" },
        parentId: { type: ["string", "null"] },
        ctadRef: { $ref: "#/$defs/CtadRef" },
      },
    },
    Edge: {
      type: "object",
      additionalProperties: false,
      required: ["id", "from", "to", "relation"],
      properties: {
        id: { type: "string", minLength: 1 },
        from: { type: "string", minLength: 1 },
        to: { type: "string", minLength: 1 },
        relation: { type: "string", enum: [...DIAGRAM_RELATIONS] },
      },
    },
    CtadRef: {
      type: "object",
      additionalProperties: false,
      required: ["section", "paramId", "option"],
      properties: {
        section: { type: "string" },
        paramId: { type: ["string", "null"] },
        option: { type: ["string", "null"] },
      },
    },
  },
} as const);

// ---------------------------------------------------------------
// Minimal JSON-Schema evaluator (subset used by DiagramSpec).
// Supports: type (string|array-of-types|"object"|"array"|"null"|
// "string"|"number"|"boolean"), enum, const, required, properties,
// additionalProperties:false, items ($ref to $defs), minLength,
// $ref to "#/$defs/Name". No oneOf/allOf/anyOf needed for our
// schema. Returns a list of error strings (empty = valid).
// ---------------------------------------------------------------

type SchemaNode = Record<string, unknown>;

function resolveRef(
  root: SchemaNode,
  ref: string,
): SchemaNode | null {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/");
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[p];
  }
  return (cur as SchemaNode) ?? null;
}

function jsonType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export function evaluateAgainstSchema(
  schema: SchemaNode,
  value: unknown,
  rootSchema: SchemaNode = schema,
  path = "",
  errors: string[] = [],
): string[] {
  // $ref
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    const target = resolveRef(rootSchema, ref);
    if (!target) {
      errors.push(`${path || "(root)"}: unresolved $ref "${ref}"`);
      return errors;
    }
    return evaluateAgainstSchema(target, value, rootSchema, path, errors);
  }
  // const
  if ("const" in schema) {
    if (value !== schema["const"]) {
      errors.push(
        `${path || "(root)"}: expected const ${JSON.stringify(schema["const"])} (got ${JSON.stringify(value)})`,
      );
    }
  }
  // type
  const typeSpec = schema["type"];
  if (typeof typeSpec === "string") {
    const actual = jsonType(value);
    const ok =
      typeSpec === "integer"
        ? actual === "number" && Number.isInteger(value as number)
        : actual === typeSpec;
    if (!ok) {
      errors.push(
        `${path || "(root)"}: expected type "${typeSpec}" (got "${actual}")`,
      );
    }
  } else if (Array.isArray(typeSpec)) {
    const actual = jsonType(value);
    if (!typeSpec.includes(actual)) {
      errors.push(
        `${path || "(root)"}: expected type one of [${typeSpec.join(",")}] (got "${actual}")`,
      );
    }
  }
  // enum
  const enumVals = schema["enum"];
  if (Array.isArray(enumVals)) {
    if (!enumVals.includes(value as never)) {
      errors.push(
        `${path || "(root)"}: expected one of ${JSON.stringify(enumVals)} (got ${JSON.stringify(value)})`,
      );
    }
  }
  // minLength (strings only)
  const minLength = schema["minLength"];
  if (typeof minLength === "number" && typeof value === "string") {
    if (value.length < minLength) {
      errors.push(
        `${path || "(root)"}: expected minLength ${minLength} (got ${value.length})`,
      );
    }
  }
  // object: properties / required / additionalProperties:false
  if (jsonType(value) === "object") {
    const obj = value as Record<string, unknown>;
    const props = (schema["properties"] as SchemaNode | undefined) ?? null;
    const required = (schema["required"] as string[] | undefined) ?? [];
    const additional = schema["additionalProperties"];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) {
        errors.push(`${path}/${key}: required property missing`);
      }
    }
    if (props) {
      for (const [key, child] of Object.entries(obj)) {
        const childSchema = (props as Record<string, SchemaNode>)[key];
        if (childSchema) {
          evaluateAgainstSchema(
            childSchema,
            child,
            rootSchema,
            `${path}/${key}`,
            errors,
          );
        } else if (additional === false) {
          errors.push(`${path}/${key}: additional property not allowed`);
        }
      }
    }
  }
  // array: items
  if (jsonType(value) === "array") {
    const items = schema["items"] as SchemaNode | undefined;
    if (items) {
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        evaluateAgainstSchema(items, arr[i], rootSchema, `${path}/${i}`, errors);
      }
    }
  }
  return errors;
}

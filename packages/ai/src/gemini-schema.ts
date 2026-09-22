import { z } from "zod";

/** Provider shape only; all size/range constraints remain enforced by local Zod validation. */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  function simplify(node: Record<string, unknown>): Record<string, unknown> {
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};

    if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf)) {
      const union = (node.anyOf || node.oneOf) as Record<string, unknown>[];
      const nullBranch = union.find((b) => b.type === "null");
      const nonNullBranches = union.filter((b) => b.type !== "null");
      if (nullBranch && nonNullBranches.length === 1) {
        const simplified = simplify(nonNullBranches[0]);
        Object.assign(out, simplified);
        out.nullable = true;
        return out;
      }
    }

    if (Array.isArray(node.type)) {
      const nonNull = node.type.find((t) => t !== "null");
      if (nonNull) out.type = nonNull;
      if (node.type.includes("null")) out.nullable = true;
    } else if (node.type !== undefined) {
      out.type = node.type;
    }

    for (const key of ["enum", "required", "$ref", "description"]) {
      if (node[key] !== undefined) out[key] = node[key];
    }
    for (const key of ["properties", "$defs", "definitions"]) {
      if (node[key] && typeof node[key] === "object") {
        out[key] = Object.fromEntries(
          Object.entries(node[key] as Record<string, Record<string, unknown>>).map(([name, child]) => [
            name,
            simplify(child),
          ]),
        );
      }
    }
    if (node.items && typeof node.items === "object") {
      out.items = simplify(node.items as Record<string, unknown>);
    }
    for (const key of ["anyOf", "oneOf"]) {
      if (Array.isArray(node[key]) && !out.type && !out.nullable) {
        out[key] = (node[key] as Record<string, unknown>[]).map((child) => simplify(child));
      }
    }
    return out;
  }
  return simplify(z.toJSONSchema(schema, { target: "draft-7" }));
}


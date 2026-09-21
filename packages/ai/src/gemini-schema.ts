import { z } from "zod";

/** Provider shape only; all size/range constraints remain enforced by local Zod validation. */
export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  function simplify(node: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of ["type", "enum", "required", "additionalProperties", "$ref"]) {
      if (node[key] !== undefined) out[key] = node[key];
    }
    for (const key of ["properties", "$defs", "definitions"]) {
      if (node[key] && typeof node[key] === "object") {
        out[key] = Object.fromEntries(Object.entries(node[key] as Record<string, Record<string, unknown>>)
          .map(([name, child]) => [name, simplify(child)]));
      }
    }
    if (node.items && typeof node.items === "object")
      out.items = simplify(node.items as Record<string, unknown>);
    for (const key of ["anyOf", "oneOf"]) {
      if (Array.isArray(node[key])) out[key] = node[key].map(child => simplify(child));
    }
    return out;
  }
  return simplify(z.toJSONSchema(schema, { target: "draft-7" }));
}


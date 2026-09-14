import { z } from "zod";

/**
 * Names for shared schemas. The API docs generator prints these names instead of
 * expanding every nested object. A module-local registry (not z.globalRegistry)
 * avoids duplicate-id errors when Next.js hot-reloads this module.
 */
export const contractNames = z.registry<{ id: string; description?: string }>();

export function named<T extends z.ZodType>(schema: T, id: string, description?: string): T {
  contractNames.add(schema, { id, description });
  return schema;
}

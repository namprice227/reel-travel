import { z } from "zod";
import { Id, Timestamp } from "./common";
import { named } from "./registry";

export const User = named(
  z.object({
    id: Id,
    email: z.email(),
    displayName: z.string().min(1).max(80),
    createdAt: Timestamp,
  }),
  "User",
);
export type User = z.infer<typeof User>;

export const DevSignInInput = named(
  z.object({
    email: z.email(),
    displayName: z.string().trim().min(1).max(80).optional(),
  }),
  "DevSignInInput",
);
export type DevSignInInput = z.infer<typeof DevSignInInput>;

import { createHash, randomBytes, randomUUID } from "node:crypto";

type Prefix = "user" | "trip" | "res" | "insp" | "place" | "itin" | "share" | "job" | "asset";

export const newId = (prefix: Prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** Secret for cookies and share links. Store only hashToken(token). */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const nowIso = () => new Date().toISOString();

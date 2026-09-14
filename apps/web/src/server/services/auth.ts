import type { DevSignInInput, User } from "@reel/contracts";
import { config } from "../config";
import { repos } from "../db";
import { AppError } from "../errors";
import { hashToken, newId, newToken, nowIso } from "../ids";

const SESSION_DAYS = 30;

/** Placeholder identity (owner: Member 4). Replace with real auth (D02) behind the same functions. */
export async function devSignIn(input: DevSignInInput): Promise<{ user: User; token: string; expiresAt: string }> {
  if (!config.devSignInEnabled) throw new AppError("FORBIDDEN", "Dev sign-in is disabled in this environment.");
  const r = repos();
  const email = input.email.trim().toLowerCase();
  let user = await r.users.getByEmail(email);
  if (!user) {
    user = { id: newId("user"), email, displayName: input.displayName ?? email.split("@")[0]!, createdAt: nowIso() };
    await r.users.insert(user);
  }
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await r.sessions.insert({ id: hashToken(token), userId: user.id, createdAt: nowIso(), expiresAt });
  return { user, token, expiresAt };
}

export async function userForSessionToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const r = repos();
  const session = await r.sessions.get(hashToken(token));
  if (!session || session.expiresAt < nowIso()) return null;
  return r.users.getById(session.userId);
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await repos().sessions.delete(hashToken(token));
}

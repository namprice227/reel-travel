import type { DevSignInInput, SignInInput, SignUpInput, User } from "@reel/contracts";
import { config } from "../config";
import { repos } from "../db";
import { AppError } from "../errors";
import { hashToken, newId, newToken, nowIso } from "../ids";
import { createSupabaseAuthClient } from "../supabase/client";
import { enforceRateLimit } from "./rate-limits";

const SESSION_DAYS = 30;

/** Explicit local development identity; cannot run with Supabase or in production. */
export async function devSignIn(input: DevSignInInput): Promise<{ user: User; token: string; expiresAt: string }> {
  if (!config.devSignInEnabled) throw new AppError("FORBIDDEN", "Dev sign-in is disabled in this environment.");
  const r = repos();
  const email = input.email.trim().toLowerCase();
  let user = await r.users.getByEmail(email);
  if (!user) {
    user = { id: newId("user"), email, displayName: input.displayName ?? email.split("@")[0]!, createdAt: nowIso() };
    await r.users.insert(user);
  }
  return issueSession(user);
}

async function issueSession(user: User): Promise<{ user: User; token: string; expiresAt: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await repos().sessions.insert({ id: hashToken(token), userId: user.id, createdAt: nowIso(), expiresAt });
  return { user, token, expiresAt };
}

async function authQuota(email: string) {
  if (config.dataBackend !== "supabase") throw new AppError("FORBIDDEN", "Real authentication is not configured.");
  // Account keys are hashed; a global ceiling also bounds abuse across randomly generated addresses.
  await enforceRateLimit("auth:global", { limit: 100, windowMs: 60_000 });
  await enforceRateLimit(`auth:email:${hashToken(email.toLowerCase())}`, { limit: 10, windowMs: 15 * 60_000 });
}

export async function signIn(input: SignInInput) {
  const email = input.email.trim().toLowerCase();
  await authQuota(email);
  const client = createSupabaseAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: input.password });
  if (error || !data.user || !data.session || !data.user.email_confirmed_at || !data.user.email) {
    throw new AppError("UNAUTHENTICATED", "Sign-in failed. Check your email, password and email confirmation.");
  }
  const identity = data.user;
  const user: User = {
    id: identity.id, email: identity.email!,
    displayName: typeof identity.user_metadata.display_name === "string"
      ? identity.user_metadata.display_name.trim().slice(0, 80) || email.split("@")[0]!
      : email.split("@")[0]!,
    createdAt: identity.created_at,
  };
  await repos().users.insert(user);
  // Supabase access/refresh tokens remain ephemeral on this request-local client. Only an opaque,
  // hashed application session is persisted, and the browser receives its HttpOnly cookie.
  return issueSession(user);
}

export async function signUp(input: SignUpInput): Promise<{ ok: true }> {
  const email = input.email.trim().toLowerCase();
  await authQuota(email);
  const { error } = await createSupabaseAuthClient().auth.signUp({
    email, password: input.password,
    options: { emailRedirectTo: `${config.siteUrl}/sign-in`, data: { display_name: input.displayName ?? email.split("@")[0] } },
  });
  if (error) {
    // Avoid distinguishing existing accounts; provider-side signup responses can deliberately be obfuscated.
    if (error.code === "user_already_exists" || error.code === "email_exists") return { ok: true };
    if (error.status === 429) throw new AppError("RATE_LIMITED", "Please wait before trying to sign up again.", { retryAfterSeconds: 60 });
    throw new AppError("VALIDATION_FAILED", "Sign-up could not be completed. Check your details and try again.");
  }
  return { ok: true };
}

export async function userForSessionToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const r = repos();
  const session = await r.sessions.get(hashToken(token));
  if (!session || session.expiresAt <= nowIso()) return null;
  return r.users.getById(session.userId);
}

export async function endSession(token: string | undefined): Promise<void> {
  if (token) await repos().sessions.delete(hashToken(token));
}

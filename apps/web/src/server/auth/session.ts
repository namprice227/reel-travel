import type { User } from "@reel/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "../errors";
import { userForSessionToken } from "../services/auth";

// Next.js cookie glue for identity (owner: Member 4). Services never import this file.

export const SESSION_COOKIE = "reel_session";

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  return userForSessionToken(await readSessionToken());
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  return user;
}

/** For pages: signed-out visitors go to /sign-in and come back afterwards. */
export async function requirePageUser(returnTo: string): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

export async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

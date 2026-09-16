import { clearSessionCookie, readSessionToken, setSessionCookie } from "../auth/session";
import type { HandlerMap } from "../http/types";
import { devSignIn, endSession, signIn, signUp } from "../services/auth";

// F0 foundation. Owner: Member 4.
export const authHandlers = {
  "auth.signIn": async ({ body }) => {
    const { user, token, expiresAt } = await signIn(body);
    await setSessionCookie(token, expiresAt);
    return { user };
  },
  "auth.signUp": async ({ body }) => signUp(body),
  "auth.devSignIn": async ({ body }) => {
    const { user, token, expiresAt } = await devSignIn(body);
    await setSessionCookie(token, expiresAt);
    return { user };
  },
  "auth.signOut": async () => {
    await endSession(await readSessionToken());
    await clearSessionCookie();
    return { ok: true };
  },
  "auth.me": async ({ user }) => ({ user }),
} satisfies Partial<HandlerMap>;

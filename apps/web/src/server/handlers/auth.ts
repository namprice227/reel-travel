import { clearSessionCookie, readSessionToken, setSessionCookie } from "../auth/session";
import type { HandlerMap } from "../http/types";
import { devSignIn, endSession } from "../services/auth";

// F0 foundation. Owner: Member 4.
export const authHandlers = {
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

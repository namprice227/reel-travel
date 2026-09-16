import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  login: vi.fn(), signup: vi.fn(), makeAuth: vi.fn(), insertUser: vi.fn(), insertSession: vi.fn(), consume: vi.fn(),
}));
vi.mock("../../apps/web/src/server/supabase/client", () => ({ createSupabaseAuthClient: mocks.makeAuth }));
vi.mock("../../apps/web/src/server/db", () => ({ repos: () => ({
  users: { insert: mocks.insertUser }, sessions: { insert: mocks.insertSession }, rateLimits: { consume: mocks.consume },
}) }));
const { signIn, signUp, devSignIn } = await import("../../apps/web/src/server/services/auth");
const { config } = await import("../../apps/web/src/server/config");

const identity = { id: "2e571b64-8f98-4bcd-884b-fa78a8b12da1", email: "alice@example.test",
  email_confirmed_at: "2026-09-16T00:00:00.000Z", created_at: "2026-09-16T00:00:00.000Z", user_metadata: { display_name: "Alice" } };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATA_BACKEND", "supabase"); vi.stubEnv("SITE_URL", "https://reel.example.test");
  mocks.makeAuth.mockImplementation(() => ({ auth: { signInWithPassword: mocks.login, signUp: mocks.signup } }));
  mocks.consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
  mocks.login.mockResolvedValue({ data: { user: identity, session: { access_token: "PROVIDER_TOKEN", refresh_token: "PROVIDER_REFRESH" } }, error: null });
  mocks.signup.mockResolvedValue({ data: { user: identity, session: null }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Supabase authentication boundary", () => {
  it("only issues hashed application sessions after verified provider sign-in", async () => {
    const result = await signIn({ email: "ALICE@example.test", password: "synthetic-password" });
    expect(mocks.login).toHaveBeenCalledWith({ email: "alice@example.test", password: "synthetic-password" });
    expect(mocks.insertUser).toHaveBeenCalledWith(expect.objectContaining({ id: identity.id, email: identity.email }));
    const session = mocks.insertSession.mock.calls[0]![0];
    expect(session.id).not.toBe(result.token);
    expect(session.id).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("PROVIDER_");
    expect(JSON.stringify(session)).not.toContain("synthetic-password");
  });

  it("rejects wrong credentials and unconfirmed accounts without writing sessions", async () => {
    mocks.login.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: "PRIVATE_PROVIDER_ERROR" } });
    await expect(signIn({ email: "alice@example.test", password: "wrong" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    mocks.login.mockResolvedValueOnce({ data: { user: { ...identity, email_confirmed_at: null }, session: {} }, error: null });
    await expect(signIn({ email: "alice@example.test", password: "synthetic-password" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it("asks for email confirmation on signup, never trusting the signup user as a session", async () => {
    expect(await signUp({ email: "alice@example.test", password: "synthetic-password", displayName: "Alice" })).toEqual({ ok: true });
    expect(mocks.signup).toHaveBeenCalledWith(expect.objectContaining({ options: {
      emailRedirectTo: "https://reel.example.test/sign-in", data: { display_name: "Alice" },
    } }));
    expect(mocks.insertUser).not.toHaveBeenCalled();
    expect(mocks.insertSession).not.toHaveBeenCalled();
  });

  it("enforces auth quotas before sending credentials to the provider", async () => {
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    await expect(signIn({ email: "alice@example.test", password: "synthetic-password" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("cannot enable development identity with Supabase or select a production file store", async () => {
    vi.stubEnv("ENABLE_DEV_SIGN_IN", "true");
    await expect(devSignIn({ email: "alice@example.test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("DATA_BACKEND", "file");
    expect(() => config.dataBackend).toThrow("cannot run in production");
    expect(config.devSignInEnabled).toBe(false);
  });
});

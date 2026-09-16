"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// F0 foundation: Supabase email/password flow, with a separate local-only demo mode.

const DEMO_ACCOUNTS = [
  { email: "alice@example.test", displayName: "Alice" },
  { email: "bob@example.test", displayName: "Bob" },
];

export function SignInForm({ next, development }: { next: string; development: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function signIn(body: { email: string; displayName?: string }) {
    setBusy(true);
    setError(null);
    try {
      if (development) await api("auth.devSignIn", { body });
      else if (creating) {
        await api("auth.signUp", { body: { email: body.email, password } });
        setNotice("Check your email for a confirmation link, then sign in. If you already have an account, sign in with your password.");
        setCreating(false);
        setPassword("");
        setBusy(false);
        return;
      } else await api("auth.signIn", { body: { email: body.email, password } });
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ maxWidth: 440, margin: "40px auto" }}>
      <h1>{creating ? "Create an account" : "Sign in"}</h1>
      {development && <div className="banner banner-info small">
        Development sign-in: email only, no password. Use two accounts to check that trips stay private.
      </div>}
      {notice && <p className="banner banner-info small" role="status">{notice}</p>}
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void signIn({ email });
        }}
      >
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {!development && <label>
          Password{creating ? " (at least 12 characters)" : ""}
          <input type="password" required minLength={creating ? 12 : 1} maxLength={128}
            autoComplete={creating ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>}
        <button className="btn btn-primary" disabled={busy}>
          {creating ? "Create account" : "Sign in"}
        </button>
      </form>
      {!development && <button type="button" className="btn" disabled={busy} onClick={() => { setCreating(!creating); setError(null); setNotice(""); }}>
        {creating ? "Already have an account? Sign in" : "Create an account"}
      </button>}
      {development && <div className="row small">
        <span className="muted">Demo accounts:</span>
        {DEMO_ACCOUNTS.map((account) => (
          <button key={account.email} className="btn btn-small" disabled={busy} onClick={() => void signIn(account)}>
            {account.displayName}
          </button>
        ))}
      </div>}
      <ErrorBanner error={error} />
    </div>
  );
}

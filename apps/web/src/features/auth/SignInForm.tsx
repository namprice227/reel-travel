"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorBanner } from "@/components/ui";
import { api, ApiError } from "@/lib/api-client";

// F0 foundation (UI: Member 1, server: Member 4). Development sign-in only; real auth replaces it (D02).

const DEMO_ACCOUNTS = [
  { email: "alice@example.test", displayName: "Alice" },
  { email: "bob@example.test", displayName: "Bob" },
];

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function signIn(body: { email: string; displayName?: string }) {
    setBusy(true);
    setError(null);
    try {
      await api("auth.devSignIn", { body });
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  return (
    <div className="card stack" style={{ maxWidth: 440, margin: "40px auto" }}>
      <h1>Sign in</h1>
      <div className="banner banner-info small">
        Development sign-in: email only, no password. Use two accounts to check that trips stay private.
      </div>
      <form
        className="stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void signIn({ email });
        }}
      >
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Continue
        </button>
      </form>
      <div className="row small">
        <span className="muted">Demo accounts:</span>
        {DEMO_ACCOUNTS.map((account) => (
          <button key={account.email} className="btn btn-small" disabled={busy} onClick={() => void signIn(account)}>
            {account.displayName}
          </button>
        ))}
      </div>
      <ErrorBanner error={error} />
    </div>
  );
}

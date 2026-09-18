import Link from "next/link";
import type { ReactNode } from "react";

// Minimal shared UI primitives. Member 1 owns the design system and may replace these.

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ErrorBanner({ error }: { error: { message: string; code?: string } | null | undefined }) {
  if (!error) return null;
  return (
    <div className="banner banner-danger" role="alert">
      {error.code && <code>{error.code}</code>} {error.message}
      {error.code === "UNAUTHENTICATED" && (
        <>
          {" "}
          <Link href="/sign-in">Sign in</Link>
        </>
      )}
      {error.code === "STALE_TRIP" && <p>Your changes were not saved. Reload this page to review the latest trip before trying again.</p>}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="muted">{label}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

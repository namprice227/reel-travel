import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 40 }}>
      <h1>Not found</h1>
      <p className="muted">This page doesn&apos;t exist, or it belongs to another account.</p>
      <Link href="/trips">Go to my trips</Link>
    </div>
  );
}

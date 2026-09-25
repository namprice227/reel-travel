import Link from "next/link";
import { Icon } from "@/components/icons";

/**
 * Shared navigation for the overview and archive; these remain separate, linkable routes.
 * `showCreate` is false where the page below already is the create form, so there are never
 * two primary buttons reading "Create trip" that do different things.
 */
export function TripsToolbar({ active, count, showCreate = true, showViews = true }: { active: "overview" | "all"; count?: number; showCreate?: boolean; showViews?: boolean }) {
  return (
    <header className="trips-toolbar">
      <h1>My trips</h1>
      {showViews && <nav aria-label="Trip views">
        <Link href="/my-trip" aria-current={active === "overview" ? "page" : undefined}>Overview</Link>
        <Link href="/my-trip/all" aria-current={active === "all" ? "page" : undefined}>All trips{count !== undefined && <span className="count-pill">{count}</span>}</Link>
      </nav>}
      {showCreate && <Link className="btn btn-primary" href="/my-trip/new"><Icon name="plus" size={18} /> Create trip</Link>}
    </header>
  );
}

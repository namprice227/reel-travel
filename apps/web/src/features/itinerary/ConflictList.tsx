import type { Conflict } from "@reel/contracts";
import { Badge, type Tone } from "@/components/ui";
import { formatDay } from "@/lib/format";

const TONE: Record<Conflict["severity"], Tone> = { error: "danger", warning: "warning", info: "info" };

/** Planner checks in plain language. Unknown hours appear here so a partial check is never hidden. */
export function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <section className="card stack" style={{ gap: 6 }}>
      <h3>Checks</h3>
      {conflicts.map((conflict, i) => (
        <div key={i} className="row small" style={{ alignItems: "baseline", flexWrap: "nowrap" }}>
          <Badge tone={TONE[conflict.severity]}>{conflict.severity}</Badge>
          <span>
            {conflict.date && <strong>{formatDay(conflict.date)}: </strong>}
            {conflict.message}
            {conflict.suggestion && <span className="muted"> {conflict.suggestion}</span>}
          </span>
        </div>
      ))}
    </section>
  );
}

"use client";

import type { CandidatePlace, PlaceOption } from "@reel/contracts";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { describeHours, placeStatus } from "@/lib/format";

export function PlaceCard({
  place,
  busy,
  onConfirm,
  onReject,
}: {
  place: CandidatePlace;
  busy: boolean;
  onConfirm: (providerPlaceId: string) => void;
  onReject: () => void;
}) {
  const [choice, setChoice] = useState(place.options.length === 1 ? place.options[0]!.providerPlaceId : "");
  const status = placeStatus[place.status];
  const choosable = place.options.length > 1 && (place.status === "ambiguous" || place.status === "rejected");

  return (
    <article className="card stack" style={{ gap: 8 }}>
      <div className="row between">
        <h3>{place.name}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      {place.status === "confirmed" && place.selected && <OptionSummary option={place.selected} />}
      {!choosable && place.status !== "confirmed" && place.options[0] && <OptionSummary option={place.options[0]} />}
      {choosable && (
        <fieldset className="stack" style={{ gap: 6, border: "none", padding: 0, margin: 0 }}>
          {place.options.map((option) => (
            <label key={option.providerPlaceId} className="inline" style={{ alignItems: "flex-start" }}>
              <input
                type="radio"
                name={`choice-${place.id}`}
                checked={choice === option.providerPlaceId}
                onChange={() => setChoice(option.providerPlaceId)}
              />
              <OptionSummary option={option} />
            </label>
          ))}
        </fieldset>
      )}
      {place.status === "not_found" && <p className="small muted">No real place matched &ldquo;{place.name}&rdquo;.</p>}

      <details>
        <summary className="small">
          Why this was suggested ({place.evidence.length} source{place.evidence.length === 1 ? "" : "s"})
        </summary>
        {place.evidence.map((item) => (
          <blockquote key={`${item.inspirationId}:${item.clue}`} className="quote">
            {item.excerpt ?? `(${item.sourceType} save)`}
            <br />
            <span className="small">
              From a {item.sourceType} save, looked up as &ldquo;{item.clue}&rdquo;
            </span>
          </blockquote>
        ))}
      </details>

      <div className="row">
        {place.status === "pending" && (
          <button className="btn btn-primary btn-small" disabled={busy} onClick={() => onConfirm(place.options[0]!.providerPlaceId)}>
            Confirm
          </button>
        )}
        {place.status === "ambiguous" && (
          <button className="btn btn-primary btn-small" disabled={busy || !choice} onClick={() => onConfirm(choice)}>
            Confirm selected
          </button>
        )}
        {place.status === "rejected" && place.options.length > 0 && (
          <button className="btn btn-small" disabled={busy || !choice} onClick={() => onConfirm(choice)}>
            Restore and confirm
          </button>
        )}
        {place.status !== "rejected" && (
          <button className="btn btn-danger btn-small" disabled={busy} onClick={onReject}>
            Reject
          </button>
        )}
      </div>
    </article>
  );
}

function OptionSummary({ option }: { option: PlaceOption }) {
  return (
    <span className="small">
      <strong>{option.name}</strong>
      {option.address && <> · {option.address}</>}
      <br />
      <span className="muted">
        {option.details.category ?? "Place"} · {describeHours(option.details.openingHours)}
        {option.details.provider === "fixture" && " · sample data"}
        {option.details.provider !== "fixture" && <> - {option.details.attribution}</>}
      </span>
    </span>
  );
}

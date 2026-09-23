"use client";

import type { Trip } from "@reel/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { useApi } from "@/lib/use-api";

// Getting-started checklist on My trips (design "New user · A5"), for an account that has just begun.
// Every step is read from real data, never from a stored "onboarded" flag, so it can't claim progress
// that isn't there. It disappears once the three steps are done, once someone hides it, and once they
// have a second trip: by then they know the flow, and a new empty trip should not restart onboarding.

const HIDDEN_KEY = "reel.getting-started.hidden";

interface Step {
  title: string;
  hint: string;
  done: boolean;
  href: string;
  action: string;
}

export function GettingStarted({ trips, loading }: { trips: Trip[]; loading: boolean }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {
      setHidden(false); // private mode: show it rather than hide something useful
    }
  }, []);

  // The newest trip is the one someone just made, so it is the one the later steps talk about.
  const newest = [...trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const request = newest ? { params: { tripId: newest.id } } : null;
  const saves = useApi("inspirations.list", request);
  const places = useApi("places.list", request);

  const savedCount = saves.data?.inspirations.length ?? 0;
  const selectedCount = newest?.selectedPlaceIds?.length ?? places.data?.places.filter((place) => place.status === "confirmed").length ?? 0;
  const base = newest ? `/my-trip/${newest.id}` : "/my-trip/new";

  const steps: Step[] = [
    {
      title: "Create your first trip",
      hint: "A country, a city and your dates.",
      done: trips.length > 0,
      href: "/my-trip/new",
      action: "Create trip",
    },
    {
      title: "Add something you saved",
      hint: newest ? `A link, a screenshot or a note for ${newest.title}.` : "A link, a screenshot or a note.",
      done: savedCount > 0,
      href: newest ? `/inspiration-library?trip=${newest.id}` : "/my-trip/new",
      action: "Add a save",
    },
    {
      title: "Choose places to visit",
      hint: "Tick the ideas you want in your trip.",
      done: selectedCount > 0,
      href: newest ? `${base}/places` : "/my-trip/new",
      action: "Choose places",
    },
  ];

  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  // Waiting for the two lookups would flash a wrong "0 of 3" on a filled account.
  const unknown = Boolean(newest) && (saves.loading || places.loading);
  if (hidden || loading || unknown || trips.length > 1 || done === steps.length) return null;

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Nothing to remember it with; the checklist comes back next visit.
    }
  }

  return (
    <section className="start-card card" aria-labelledby="getting-started-title">
      <div className="start-head">
        <div>
          <h2 id="getting-started-title">Getting started</h2>
          <p>{next ? next.hint : "Almost there."}</p>
        </div>
        <div className="start-progress">
          <span>{done} of {steps.length} done</span>
          <span className="start-bar" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></span>
          <button type="button" className="btn-link" onClick={hide}>Hide</button>
        </div>
      </div>
      <ol className="start-steps">
        {steps.map((step, index) => (
          <li key={step.title} className={step.done ? "is-done" : step.title === next?.title ? "is-next" : undefined}>
            <span className="start-mark" aria-hidden="true">{step.done ? <Icon name="check" size={17} /> : index + 1}</span>
            <span className="start-text">
              <strong>{step.title}</strong>
              <small>{step.hint}</small>
            </span>
            {step.done ? (
              <span className="start-done"><Icon name="checkCircle" size={16} /> Done</span>
            ) : step.title === next?.title ? (
              <Link className="btn btn-small btn-primary" href={step.href}>
                {step.action} <Icon name={"arrowRight" as IconName} size={15} />
              </Link>
            ) : (
              <span className="start-later">After step {index}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

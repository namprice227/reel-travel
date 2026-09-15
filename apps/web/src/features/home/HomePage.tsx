"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { SaveComposer } from "@/features/inbox/SaveComposer";
import { tripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// Signed-in Home (/home). One job: turn a reel, link, screenshot or note into a trip, with a few shortcuts below.

export function HomePage({ name }: { name: string }) {
  const trips = useApi("trips.list", {});

  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data) return <Loading />;

  const list = trips.data.trips;
  const upcoming = list.filter((t) => tripGroup(t) !== "past").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lastTrip = upcoming[0] ?? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="fit-page home-simple">
      <section className="hs-hero" aria-labelledby="home-title">
        <p className="hs-greeting">{greeting}, {name.split(" ")[0]}</p>
        <h1 id="home-title">Turn your saves into a trip</h1>
        <p className="hs-lede">Paste a reel or link, drop a screenshot, or jot a note. We find the places and plan the days.</p>
        <SaveComposer trips={upcoming.length ? upcoming : list} defaultTripId={lastTrip?.id} />
      </section>

      <nav className="hs-shortcuts" aria-label="Shortcuts">
        <Link href="/my-trip/new" className="hs-shortcut">
          <Icon name="plus" size={22} />
          <strong>Create trip</strong>
          <small>Start somewhere new</small>
        </Link>
        <Link href="/my-trip" className="hs-shortcut">
          <Icon name="trips" size={22} />
          <strong>My trips</strong>
          <small>{list.length} {list.length === 1 ? "trip" : "trips"}</small>
        </Link>
        <Link href="/inspiration-library" className="hs-shortcut">
          <Icon name="library" size={22} />
          <strong>Inspiration library</strong>
          <small>Your reels, screenshots and notes</small>
        </Link>
        {lastTrip ? (
          <Link href={`/my-trip/${lastTrip.id}/itinerary`} className="hs-shortcut">
            <Icon name="magazine" size={22} />
            <strong>Continue</strong>
            <small>{lastTrip.title}</small>
          </Link>
        ) : (
          <Link href="/discover" className="hs-shortcut">
            <Icon name="discover" size={22} />
            <strong>Discover</strong>
            <small>Coming later</small>
          </Link>
        )}
      </nav>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { ErrorBanner, Loading } from "@/components/ui";
import { SaveComposer } from "@/features/inbox/SaveComposer";
import { tripGroup } from "@/lib/trip-dates";
import { useApi } from "@/lib/use-api";

// Signed-in Home (/home). One job: turn a reel, link, screenshot or note into a trip, with a few shortcuts below.

export function HomePage({ name, handwritingClass = "" }: { name: string; handwritingClass?: string }) {
  const trips = useApi("trips.list", {});

  if (trips.error) return <ErrorBanner error={trips.error} />;
  if (!trips.data) return <Loading />;

  const list = trips.data.trips;
  const upcoming = list.filter((t) => tripGroup(t) !== "past").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const lastTrip = upcoming[0] ?? [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className={`fit-page home-simple ${handwritingClass}`}>
      <div className="hs-decoration hs-decoration-left" aria-hidden="true">
        <div className="hs-postcard hs-photo-greece" />
        <span className="hs-handwritten hs-note-left">From<br />inspiration…
          <svg viewBox="0 0 65 75"><path d="M51 5C55 35 35 50 12 61m2-12-3 13 14-1" /></svg>
        </span>
      </div>
      <div className="hs-decoration hs-decoration-right" aria-hidden="true">
        <div className="hs-postcard hs-photo-japan" />
        <span className="hs-handwritten hs-note-right">
          <svg viewBox="0 0 65 75"><path d="M44 67C21 49 25 26 43 10m-12 3 13-5 2 13" /></svg>
          …to your<br />next trip <span>✦</span>
        </span>
      </div>
      <section className="hs-hero" aria-labelledby="home-title">
        <p className="hs-greeting">{greeting}, {name.split(" ")[0]}</p>
        <h1 id="home-title">Turn your saves into a trip</h1>
        <p className="hs-lede">Save travel inspiration. We’ll find the places and help plan your days.</p>
        <SaveComposer variant="home" trips={upcoming.length ? upcoming : list} defaultTripId={lastTrip?.id} />
      </section>

      <section className="hs-quick-access" aria-labelledby="quick-access-title">
        <div className="hs-section-heading">
          <h2 id="quick-access-title">Quick access</h2>
          <p>Plan faster, travel further.</p>
        </div>
      <nav className="hs-shortcuts" aria-label="Shortcuts">
        <Link href="/my-trip/new" className="hs-shortcut hs-create">
          <span className="hs-shortcut-icon"><Icon name="plus" size={27} /></span>
          <Icon name="chevronRight" size={19} className="hs-card-arrow" />
          <strong>Create trip</strong>
          <small>Start a new journey</small>
          <span className="hs-card-art hs-mountains" aria-hidden="true" />
        </Link>
        <Link href="/my-trip" className="hs-shortcut hs-trips">
          <span className="hs-shortcut-icon"><Icon name="trips" size={25} /></span>
          <Icon name="chevronRight" size={19} className="hs-card-arrow" />
          <strong>My trips</strong>
          <small>{list.length} {list.length === 1 ? "trip" : "trips"}</small>
          <span className="hs-card-art hs-skyline" aria-hidden="true" />
        </Link>
        <Link href="/inspiration-library" className="hs-shortcut hs-library">
          <span className="hs-shortcut-icon"><Icon name="library" size={25} /></span>
          <Icon name="chevronRight" size={19} className="hs-card-arrow" />
          <strong>Inspiration library</strong>
          <small>Saved reels and screenshots</small>
          <span className="hs-mini-postcards" aria-hidden="true">
            <span className="hs-photo-greece" /><span className="hs-photo-japan" /><span className="hs-photo-greece" />
          </span>
        </Link>
        {lastTrip ? (
          <Link href={`/my-trip/${lastTrip.id}/itinerary`} className="hs-shortcut hs-continue">
            <span className="hs-continue-art" aria-hidden="true"><Icon name="route" size={32} /></span>
            <Icon name="chevronRight" size={19} className="hs-card-arrow" />
            <span className="hs-continue-copy">
              <strong>Continue planning</strong>
              <small>{lastTrip.title}</small>
              <span className="hs-trip-status"><Icon name="route" size={13} /> {tripGroup(lastTrip) === "past" ? "View itinerary" : "In progress"}</span>
            </span>
          </Link>
        ) : (
          <Link href="/discover" className="hs-shortcut hs-discover">
            <span className="hs-shortcut-icon"><Icon name="discover" size={25} /></span>
            <Icon name="chevronRight" size={19} className="hs-card-arrow" />
            <strong>Discover</strong>
            <small>Coming later</small>
            <span className="hs-card-art hs-skyline" aria-hidden="true" />
          </Link>
        )}
      </nav>
      </section>
      <footer className="hs-footer" aria-hidden="true">
        <span className="hs-handwritten">More places,<br /><span>a brighter you.</span></span>
        <span className="hs-footer-motto">Travel inspires a brighter you.</span>
      </footer>
    </div>
  );
}

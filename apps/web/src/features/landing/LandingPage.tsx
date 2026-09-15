import { Icon } from "@/components/icons";
import { CoverArt, StopArt } from "@/components/Illustration";
import { TrackedLink } from "./TrackedLink";

// F-landing (owner: Member 1, task FE03). Arrangement follows the "Home page" reference.
// Placeholder copy: replace with the reviewed launch copy. Sample trip content is fictional.
// Pricing is a hypothesis from the proposal, not a validated price.

const SAMPLE_STOPS = [
  { title: "Sample garden", area: "Garden", time: "Morning", status: "Confirmed", category: "garden", done: true },
  { title: "Sample market street", area: "Market", time: "Late morning", status: "To confirm", category: "market", done: false },
  { title: "Sample dinner", area: "Local restaurant", time: "Evening", status: "Fixed booking", category: "restaurant", done: true },
];

export function LandingPage() {
  return (
    <div className="landing-page">
      <section className="home-hero landing-hero">
        <div className="home-copy">
          <h1>Your saved places.<br />A trip that works.</h1>
          <p className="home-lede">Turn travel links, notes and screenshots into places you confirm and days you can edit.</p>
          <div className="row">
            <TrackedLink href="/sign-in" className="btn btn-primary btn-large">Start a trip <Icon name="arrowRight" size={18} /></TrackedLink>
            <a className="btn btn-outline btn-large" href="#how-it-works">Explore a sample trip</a>
          </div>
          <p className="home-signature">Ideas to days, with you in control.</p>
        </div>

        <div className="home-hero-visual">
          <CoverArt seed="Tokyo" className="home-hero-art" caption="Sample destination" showLabel />
          <article className="hero-trip-card" aria-label="Illustrative sample itinerary">
            <div className="row between">
              <span className="pill pill-info">Sample trip</span>
              <span className="pill"><span className="status-dot is-warning" />Partially checked</span>
            </div>
            <h2>City Break</h2>
            <p className="muted small">4 days · Culture · Food · Neighbourhoods</p>
            <div className="day-pills">
              {["Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                <span key={d} className={i === 0 ? "active" : undefined}>Day {i + 1}<small>{d}</small></span>
              ))}
            </div>
            <ul className="hero-stops">
              {SAMPLE_STOPS.map((stop) => (
                <li key={stop.title}>
                  <span className={`hero-check${stop.done ? "" : " is-open"}`} aria-hidden="true">{stop.done && <Icon name="check" size={14} />}</span>
                  <StopArt category={stop.category} size="sm" />
                  <span>
                    <strong>{stop.title}</strong>
                    <small>{stop.area} · {stop.time} · {stop.status === "Confirmed" ? <em className="text-success">{stop.status}</em> : stop.status}</small>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="home-steps">
        <div className="home-step">
          <span className="step-number">01</span><span className="step-icon"><Icon name="link" size={24} /></span>
          <span><strong>Save inspiration</strong><small>Add travel links, notes and screenshots.</small></span>
        </div>
        <div className="home-step">
          <span className="step-number">02</span><span className="step-icon"><Icon name="check" size={24} /></span>
          <span><strong>Confirm places</strong><small>Turn ideas into a clear list of places you want to include.</small></span>
        </div>
        <div className="home-step">
          <span className="step-number">03</span><span className="step-icon"><Icon name="calendar" size={24} /></span>
          <span><strong>Shape your days</strong><small>Edit and arrange places into a trip, without moving bookings.</small></span>
        </div>
      </section>

      <section className="home-flow card">
        <h2>From inspiration to your trip</h2>
        <div className="home-flow-grid">
          <div className="flow-card">
            <div className="flow-card-body">
              <p className="flow-title">Your saves</p>
              <div className="flow-line"><span className="flow-icon"><Icon name="link" size={16} /></span><span><strong>https://…</strong><small>Link</small></span></div>
              <div className="flow-line"><span className="flow-icon"><Icon name="text" size={16} /></span><span><strong>Try this ramen spot</strong><small>Note</small></span></div>
              <div className="flow-line"><span className="flow-icon"><Icon name="image" size={16} /></span><span><strong>Screenshot</strong><small>Image</small></span></div>
            </div>
            <span className="flow-caption">Links, notes, screenshots …</span>
          </div>
          <div className="flow-card">
            <div className="flow-card-body">
              <p className="flow-title">Your places</p>
              {SAMPLE_STOPS.map((s) => (
                <div key={s.title} className="flow-line"><StopArt category={s.category} size="sm" /><span><strong>{s.title}</strong><small>{s.area}</small></span></div>
              ))}
            </div>
            <span className="flow-caption">… become a clear list …</span>
          </div>
          <div className="flow-card">
            <div className="flow-card-body">
              <p className="flow-title">Plan your days</p>
              <div className="day-pills">{["1", "2", "3", "4"].map((d) => <span key={d} className={d === "1" ? "active" : undefined}>Day {d}</span>)}</div>
              {SAMPLE_STOPS.map((s) => (
                <div key={s.title} className="flow-line"><span className="drag-dots" aria-hidden="true">⋮⋮</span><span><strong>{s.title}</strong><small>{s.time}</small></span></div>
              ))}
            </div>
            <span className="flow-caption">… that you can arrange …</span>
          </div>
          <div className="flow-card flow-card-art">
            <CoverArt seed="landing-flow" caption="A trip that feels like you." />
            <span className="flow-caption">… into a trip that works.</span>
          </div>
        </div>
      </section>

      <p className="fineprint-caps design-note">Pricing is being tested. No paid plan is live · Sample data</p>
    </div>
  );
}

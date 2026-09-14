import { TrackedLink } from "./TrackedLink";

// F-landing (owner: Member 1, task A03). Placeholder copy: replace with the reviewed launch copy.
// Pricing is a hypothesis from the proposal, not a validated price.

export function LandingPage() {
  return (
    <div className="stack" style={{ gap: 40 }}>
      <section className="stack" style={{ paddingBlock: 32 }}>
        <p className="kicker">Working name · pilot build</p>
        <h1 style={{ fontSize: "2.6rem", maxWidth: 720 }}>
          Your saved reels, turned into a trip you can actually follow.
        </h1>
        <p className="muted" style={{ maxWidth: 620 }}>
          Paste captions, links and screenshots. Reel Travel finds the places, shows where each one came from,
          and builds days that respect your bookings.
        </p>
        <div className="row">
          <TrackedLink href="/sign-in" className="btn btn-primary">
            Start planning
          </TrackedLink>
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h3>1. Save anything</h3>
          <p className="muted">Text, links and screenshots. If a link can't be read, you add a detail and nothing is lost.</p>
        </div>
        <div className="card">
          <h3>2. Confirm real places</h3>
          <p className="muted">Every match cites the save it came from. You pick the right branch when there are several.</p>
        </div>
        <div className="card">
          <h3>3. Edit with confidence</h3>
          <p className="muted">Move stops around and locked dinners stay put. Conflicts are explained, not hidden.</p>
        </div>
      </section>

      <section className="card">
        <h2>Proposed pricing</h2>
        <p className="muted small">Hypothesis for validation, not a live offer.</p>
        <p>Free for one trip. Paid plan for unlimited trips: price to be tested in the pilot.</p>
      </section>
    </div>
  );
}

import { TrackedLink } from "./TrackedLink";

// F-landing (owner: Member 1, task FE03). Placeholder copy: replace with the reviewed launch copy.
// Pricing is a hypothesis from the proposal, not a validated price.

export function LandingPage() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="kicker">Plan from what you save</p>
          <h1>Your saved places.<br />A trip that works.</h1>
          <p>Save ideas. Confirm places. Shape your days.</p>
          <div className="row"><TrackedLink href="/sign-in" className="btn btn-primary btn-large">Start a trip</TrackedLink><a className="btn btn-large" href="#how-it-works">See how it works</a></div>
        </div>
        <div className="landing-preview" aria-label="Illustrative sample itinerary">
          <span className="preview-label">Sample trip</span><h2>Tokyo City Break</h2><p>4 days · Partially checked</p>
          <div><strong>Day 1</strong><span>Sample garden</span><small>Confirmed</small></div>
          <div><strong>10:30</strong><span>Sample gallery</span><small>Hours not checked</small></div>
          <div><strong>19:30</strong><span>Sample dinner</span><small>Fixed booking</small></div>
        </div>
      </section>

      <section id="how-it-works" className="landing-steps">
        <div><span>01</span><h3>Save inspiration</h3><p>Links, notes, screenshots.</p></div>
        <div><span>02</span><h3>Confirm places</h3><p>Choose the right match.</p></div>
        <div><span>03</span><h3>Plan your days</h3><p>Edit without moving bookings.</p></div>
      </section>

      <p className="pricing-note">Pricing is being tested. No paid plan is live.</p>
    </div>
  );
}

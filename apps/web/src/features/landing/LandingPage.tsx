import { Icon, type IconName } from "@/components/icons";
import { CoverArt, StopArt } from "@/components/Illustration";
import { TrackedLink } from "./TrackedLink";

// F-landing at "/" (owner: Member 1, task FE03). Arrangement follows the "Home page" reference.
// Copy must match shipped input support (launch kit). Venues and times are fictional sample data.
// Planned freemium pricing in SGD; paid paid plans are not available yet and the three-trip allowance is planned for launch.

const SAMPLE_STOPS = [
  { title: "Asakusa Lantern Temple", area: "Temple", time: "09:30", status: "Selected", category: "temple", done: true },
  { title: "Kumo Ramen", area: "Shinjuku route stop", time: "12:30", status: "Selected", category: "restaurant", done: true },
  { title: "Ginza Sushi Counter", area: "Your booking", time: "19:30", status: "Fixed booking", category: "restaurant", done: true },
];

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: "link", title: "Save inspiration", body: "Paste a travel link or a note, or upload a screenshot. Every save keeps its original source." },
  { icon: "pin", title: "Choose places", body: "Tick the places you want. We keep the source clues and choose a location for the route." },
  { icon: "calendar", title: "Shape your days", body: "Get days that account for travel time, breaks and your bookings, then move stops yourself." },
];

const FAQ = [
  {
    q: "Can it read TikTok and Instagram links?",
    a: "We only support YouTube Shorts currently for automatic extraction. For TikTok and Instagram, upload a screenshot or paste the link and add the place names or caption.",
  },
  {
    q: "Are the places on this page real?",
    a: "No. Every venue, time and booking shown here is fictional sample data used to demonstrate the product.",
  },
  {
    q: "Does Routelet book anything for me?",
    a: "No. Add bookings you already made, like a dinner reservation, and the planner keeps them fixed while you rearrange everything else.",
  },
  {
    q: "Who can see my trip?",
    a: "Only you. A viewing link shows the itinerary read-only, never your saves, screenshots or private notes, and you can revoke it at any time.",
  },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const primaryHref = signedIn ? "/home" : "/sign-in?next=%2Fmy-trip%2Fnew";
  const primaryLabel = signedIn ? "Open my trips" : "Start a trip";

  return (
    <div className="landing-page">
      <section className="home-hero landing-hero" aria-labelledby="landing-title">
        <div className="home-copy">
          <p className="kicker">Travel planning from what you save</p>
          <h1 id="landing-title">Your saved places.<br />A trip that works.</h1>
          <p className="home-lede">Turn travel links, notes and screenshots into places you choose and days you can edit.</p>
          <div className="row">
            <TrackedLink href={primaryHref} className="btn btn-primary btn-large">{primaryLabel} <Icon name="arrowRight" size={18} /></TrackedLink>
            <a className="btn btn-outline btn-large" href="#how-it-works">See how it works</a>
          </div>
          <p className="home-signature">Ideas to days, with you in control.</p>
        </div>

        <div className="home-hero-visual">
          <CoverArt seed="Tokyo" className="home-hero-art" caption="Sample destination" />
          <article className="hero-trip-card" aria-label="Sample itinerary with fictional venues">
            <div className="row between">
              <span className="pill pill-info">Sample trip</span>
              <span className="pill"><span className="status-dot is-warning" />Partially checked</span>
            </div>
            <h2>Four days in Tokyo</h2>
            <p className="muted small">4 days · 15 saves · 11 selected places</p>
            <div className="day-pills" aria-hidden="true">
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
                    <small>{stop.time} · {stop.area} · {stop.status === "Fixed booking" ? <em className="text-primary">{stop.status}</em> : stop.status === "Selected" ? <em className="text-success">{stop.status}</em> : stop.status}</small>
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="lp-section" aria-labelledby="how-title">
        <h2 id="how-title" className="lp-section-title">How it works</h2>
        <ol className="home-steps lp-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="home-step">
              <span className="step-number">0{i + 1}</span>
              <span className="step-icon"><Icon name={step.icon} size={24} /></span>
              <span><strong>{step.title}</strong><small>{step.body}</small></span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lp-section lp-features" aria-labelledby="features-title">
        <div className="lp-section-head">
          <p className="kicker">Built for the messy part of planning</p>
          <h2 id="features-title" className="lp-section-title">Know why each place is there. Change plans without breaking them.</h2>
        </div>

        <article className="lp-feature">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><Icon name="checkCircle" size={22} /></span>
            <h3>Every place shows where it came from</h3>
            <p>Each suggestion keeps the quote it was found in. Tick the places you want; the route picks a plausible location and shows you what it used.</p>
          </div>
          <div className="lp-vignette" aria-label="Example of an automatic route location, sample data">
            <p className="lp-vignette-label">Location chosen for route</p>
            <blockquote className="lp-evidence">
              <Icon name="text" size={18} />
              <span>“Kumo Ramen was the best bowl of my life!!”<small>From your saved note</small></span>
            </blockquote>
            <div className="lp-option is-selected"><span className="lp-radio" aria-hidden="true" /><StopArt category="restaurant" size="sm" /><span><strong>Kumo Ramen Shinjuku</strong><small><Icon name="clock" size={13} /> Hours not checked</small></span></div>
            <div className="lp-option"><span className="lp-radio" aria-hidden="true" /><StopArt category="restaurant" size="sm" /><span><strong>Kumo Ramen Shibuya</strong><small><Icon name="clock" size={13} /> Hours not checked</small></span></div>
            <span className="lp-sample">Sample data · fictional venues</span>
          </div>
        </article>

        <article className="lp-feature is-flipped">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><Icon name="lock" size={22} /></span>
            <h3>Your bookings stay where you put them</h3>
            <p>Move a stop to another time or day and the plan is checked again. A fixed booking never moves, and anything that no longer fits is explained in plain language.</p>
          </div>
          <div className="lp-vignette" aria-label="Example day with a fixed booking, sample data">
            <p className="lp-vignette-label">Thursday · version 2</p>
            <ol className="lp-mini-timeline">
              <li><span>10:00</span><strong>Ueno Garden Park</strong><em>Moved from Friday</em></li>
              <li className="is-travel"><span /><small>≈ 20 min travel</small></li>
              <li><span>12:30</span><strong>Lunch break</strong></li>
              <li className="is-locked"><span>19:30</span><strong>Ginza Sushi Counter</strong><em><Icon name="lock" size={13} /> Fixed booking</em></li>
            </ol>
            <span className="lp-sample">Sample data · travel times are estimates</span>
          </div>
        </article>

        <article className="lp-feature">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><Icon name="magazine" size={22} /></span>
            <h3>One plan, three ways to read it</h3>
            <p>Read your trip as a magazine, edit it on a timeline or follow it on a map. All three show the same saved version, so they never disagree.</p>
          </div>
          <div className="lp-vignette lp-views" aria-label="Magazine, timeline and map views">
            <div className="lp-view-tabs" aria-hidden="true">
              <span className="active"><Icon name="magazine" size={15} /> Magazine</span>
              <span><Icon name="timeline" size={15} /> Timeline</span>
              <span><Icon name="map" size={15} /> Map</span>
            </div>
            <CoverArt seed="landing-views" className="lp-views-art" caption="Day 1 · Temples, markets and a sushi dinner" />
          </div>
        </article>

        <article className="lp-feature is-flipped">
          <div className="lp-feature-copy">
            <span className="lp-feature-icon"><Icon name="share" size={22} /></span>
            <h3>Share the trip, keep your saves private</h3>
            <p>Send a read-only link to the people you travel with. They see the itinerary, not your screenshots or notes, and you can revoke the link whenever you like.</p>
          </div>
          <div className="lp-vignette" aria-label="Example viewing link">
            <p className="lp-vignette-label">Viewing links</p>
            <div className="lp-link-row"><Icon name="link" size={18} /><code>reel.travel/s/••••••</code><span className="lp-link-status"><span className="status-dot is-success" />Active</span></div>
            <div className="lp-link-row is-muted"><Icon name="link" size={18} /><code>reel.travel/s/••••••</code><span className="lp-link-status"><span className="status-dot" />Revoked</span></div>
            <p className="lp-note"><Icon name="lock" size={15} /> Saves, screenshots and notes are never included.</p>
          </div>
        </article>
      </section>

      <section className="lp-inputs" aria-labelledby="inputs-title">
        <h2 id="inputs-title" className="lp-inputs-title">What it reads today</h2>
        <ul>
          <li><Icon name="text" size={20} /><span><strong>Notes and captions</strong>Paste any text that mentions places.</span></li>
          <li><Icon name="link" size={20} /><span><strong>Links</strong>Add the place names or caption; the link stays with the save.</span></li>
          <li><Icon name="image" size={20} /><span><strong>Screenshots</strong>PNG, JPEG, WebP or GIF, up to 5 MB, kept private.</span></li>
        </ul>
      </section>

      <section id="pricing" className="lp-section" aria-labelledby="pricing-title">
        <div className="lp-section-head">
          <p className="kicker">Your first three trips are on us</p>
          <h2 id="pricing-title" className="lp-section-title">Start free. Go at your own pace.</h2>
          <p className="lp-pricing-note">Try the whole journey before you pay. Then choose a trip pass or a monthly plan.</p>
        </div>
        <div className="lp-plans">
          <article className="lp-plan">
            <h3>Free</h3>
            <p className="lp-price"><span>S$0</span> up to 3 trips</p>
            <p className="muted">Enough room to see whether Routelet makes planning easier.</p>
            <ul>
              <li><Icon name="check" size={16} /> Create up to 3 trips</li>
              <li><Icon name="check" size={16} /> Import links, text and images</li>
              <li><Icon name="check" size={16} /> Extract and verify places</li>
              <li><Icon name="check" size={16} /> Generate editable itineraries</li>
            </ul>
            <TrackedLink href={primaryHref} className="btn btn-primary">Start planning for free</TrackedLink>
          </article>
          <article className="lp-plan is-featured">
            <div className="row between"><h3>Trip Pass</h3><span className="pill pill-info">Planned</span></div>
            <p className="lp-price"><span>S$6.90</span> per additional trip</p>
            <p className="muted">For the occasional getaway. One more trip, without a subscription.</p>
            <ul>
              <li><Icon name="check" size={16} /> One trip beyond your free allowance</li>
              <li><Icon name="check" size={16} /> Higher import limits</li>
              <li><Icon name="check" size={16} /> Repeated generation and replanning for that trip</li>
              <li><Icon name="check" size={16} /> No recurring commitment</li>
            </ul>
            <p className="small muted">Coming later. Not available to purchase yet.</p>
          </article>
          <article className="lp-plan">
            <div className="row between"><h3>Pro</h3><span className="pill">Planned</span></div>
            <p className="lp-price"><span>S$8.90</span> per month</p>
            <p className="muted">For frequent travelers, exchange students and the next-trip dreamers.</p>
            <ul>
              <li><Icon name="check" size={16} /> Multiple active trips</li>
              <li><Icon name="check" size={16} /> Higher usage limits</li>
              <li><Icon name="check" size={16} /> Future collaborative planning</li>
              <li><Icon name="check" size={16} /> Future persistent preferences</li>
            </ul>
            <p className="small muted">Coming later. Premium features are planned.</p>
          </article>
        </div>
        <p className="lp-pricing-note">Our planned model: 3 free trips → Trip Pass for occasional travel → Pro for frequent travel. Paid prices are estimates in Singapore dollars; paid plans are not available yet and the three-trip allowance is planned for launch. Affiliate partnerships may support Routelet in future.</p>
      </section>

      <section className="lp-section lp-faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="lp-section-title">Questions</h2>
        <div className="lp-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}<Icon name="plus" size={18} /></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final" aria-labelledby="final-title">
        <CoverArt seed="landing-final" className="lp-final-art" showLabel={false} />
        <div className="lp-final-copy">
          <h2 id="final-title">Your next trip is already in your saves.</h2>
          <TrackedLink href={primaryHref} className="btn btn-primary btn-large">{primaryLabel} <Icon name="arrowRight" size={18} /></TrackedLink>
        </div>
      </section>
    </div>
  );
}

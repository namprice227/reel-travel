import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoverArt } from "@/components/Illustration";

// /discover placeholder. Community discovery (shared saves and recommendations) is outside the MVP scope;
// nothing here reads other travelers' data.

export function DiscoverPage() {
  return (
    <div className="discover-page">
      <header className="page-heading">
        <div>
          <p className="kicker">Discover · coming later</p>
          <h1>Places other travelers loved.</h1>
          <p>Recommendations from the Reel Travel community are not part of this version yet.</p>
        </div>
      </header>
      <div className="discover-grid">
        <div className="card stack">
          <h2 className="card-title">What Discover will do</h2>
          <ul className="discover-list">
            <li><Icon name="sparkle" /> Suggest places based on what you already saved.</li>
            <li><Icon name="share" /> Browse trips other travelers chose to publish.</li>
            <li><Icon name="library" /> Add a recommendation straight to your Inspiration library.</li>
          </ul>
          <div className="callout callout-neutral">
            <Icon name="lock" />
            <p className="small">Your saves, notes and screenshots stay private. Only trips you explicitly share would ever be visible.</p>
          </div>
          <div className="row">
            <Link className="btn btn-primary" href="/inspiration-library">Go to your Inspiration library</Link>
          </div>
        </div>
        <CoverArt seed="discover" className="discover-art" caption="New perspectives around every corner." />
      </div>
    </div>
  );
}

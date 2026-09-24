import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of use · Routelet", description: "Terms for using the Routelet student prototype." };

export default function TermsPage() {
  return <article className="legal-page stack">
    <p className="kicker">Effective 22 September 2026</p>
    <h1>Terms of use</h1>
    <p>Routelet is an experimental CS3216 student project, not a booking service or professional travel adviser. By using it, you agree to these terms.</p>

    <h2>Your responsibilities</h2>
    <p>Only submit material you have permission to use. Do not upload secrets, sensitive personal data, unlawful content or material that infringes another person&apos;s rights. You remain responsible for checking bookings, opening hours, addresses, accessibility, prices, visas, safety advice and transport before travel.</p>

    <h2>AI and provider information</h2>
    <p>AI output can be incomplete or wrong. Route locations are chosen automatically from available place matches, and itinerary travel times are estimates rather than live routes. Check important locations and opening hours before visiting. Google Maps content is provided under the <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer noopener">Google Maps/Google Earth Additional Terms</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer noopener">Google Terms of Service</a>. Other third-party services may have their own terms.</p>

    <h2>Shared links</h2>
    <p>A share link is a bearer link: anyone who receives it may view the published trip until it is revoked. Do not put private booking notes or sensitive details in information you intend to share.</p>

    <h2>Availability and liability</h2>
    <p>The prototype is provided as-is for evaluation and may change, fail or be withdrawn. To the extent permitted by law, the project team does not accept responsibility for travel decisions, missed bookings, provider inaccuracies or losses arising from reliance on the prototype.</p>

    <h2>Before public production</h2>
    <p>These terms require owner and legal review, a public operator/contact identity, and an approved support and deletion process before a general production launch.</p>
  </article>;
}

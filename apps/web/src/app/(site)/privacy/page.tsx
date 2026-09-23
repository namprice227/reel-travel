import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy · Reel Travel", description: "How Reel Travel handles account and trip data." };

export default function PrivacyPage() {
  return <article className="legal-page stack">
    <p className="kicker">Effective 22 September 2026</p>
    <h1>Privacy policy</h1>
    <p>Reel Travel is a CS3216 student project. This notice describes the current prototype so you can make an informed choice before saving travel content.</p>

    <h2>What we collect</h2>
    <p>We process your sign-in email, trip settings, bookings, saved text or links, uploaded screenshots, extracted place candidates, selected places, itineraries and sharing settings. Private notes are currently stored only in your browser and are not included in shared links.</p>

    <h2>Why we use it</h2>
    <p>We use this information to authenticate you, extract possible places from material you submit, let you verify those places, create and edit itineraries, operate private uploads, prevent abuse and provide links you explicitly choose to share.</p>

    <h2>Service providers</h2>
    <p>Depending on the configured workflow, data may be processed by Vercel for hosting, Supabase for authentication, database and private storage, OpenAI or Google Gemini for AI processing, and Google Maps Platform for place matching and maps. Their own terms and privacy notices apply.</p>
    <ul>
      <li><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer noopener">Google Privacy Policy</a></li>
      <li><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer noopener">OpenAI Privacy Policy</a></li>
      <li><a href="https://supabase.com/privacy" target="_blank" rel="noreferrer noopener">Supabase Privacy Policy</a></li>
      <li><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer noopener">Vercel Privacy Policy</a></li>
    </ul>

    <h2>Sharing, retention and security</h2>
    <p>Trips are private unless you create a viewing link. Anyone with an active link can read its public projection until you revoke it. Provider place content is requested only for product functions and is subject to provider retention rules. We use access controls, private storage and server-side credentials, but no internet service can promise absolute security.</p>

    <h2>Product analytics</h2>
    <p>We use Google Analytics 4 to understand page navigation and actions such as adding places, generating itineraries and sharing. Google Analytics uses cookies and browser/device information. Our explicit events omit trip and place identifiers, sharing tokens, uploaded content, booking details and free-text form values. Debug visits are labeled for testing. Google’s privacy policy is linked above.</p>

    <h2>Your choices</h2>
    <p>You can revoke shared links and remove browser-only notes. Self-service account export and deletion are not yet available in this prototype. Do not upload sensitive or confidential material. A public privacy contact and verified deletion process must be added before a general production launch.</p>

    <h2>Changes</h2>
    <p>We will update the effective date and this notice when the product, providers or data practices change.</p>
  </article>;
}

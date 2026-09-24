import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/LandingPage";
import { currentUser } from "@/server/auth/session";

// "/" is the public landing page for new visitors. Signed-in travelers can still read it; their dashboard is /home.

const title = "Routelet · Turn your travel saves into a trip you can follow";
const description =
  "Save YouTube Shorts, screenshots and notes. Discover places by country and turn your favourites into an editable day-by-day itinerary. Start with 3 free trips.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    siteName: "Routelet",
    locale: "en_SG",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, type: "image/png", alt: "Routelet logo and a sample day-by-day travel itinerary" }],
  },
  twitter: { card: "summary_large_image", title, description,
    images: [{ url: "/opengraph-image", alt: "Routelet logo and a sample day-by-day travel itinerary" }],
  },
};

export default async function Page() {
  const user = await currentUser();
  return <LandingPage signedIn={Boolean(user)} />;
}

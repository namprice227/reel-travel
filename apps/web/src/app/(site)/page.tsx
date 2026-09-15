import type { Metadata } from "next";
import { LandingPage } from "@/features/landing/LandingPage";
import { currentUser } from "@/server/auth/session";

// "/" is the public landing page for new visitors. Signed-in travelers can still read it; their dashboard is /home.

export const metadata: Metadata = {
  title: { absolute: "Reel Travel · Turn your travel saves into a trip you can follow" },
  description:
    "Save travel links, notes and screenshots. Confirm the right places with the source beside each one, then get days you can edit without moving your bookings.",
  alternates: { canonical: "/" },
};

export default async function Page() {
  const user = await currentUser();
  return <LandingPage signedIn={Boolean(user)} />;
}

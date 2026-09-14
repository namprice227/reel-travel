import type { Metadata } from "next";
import { SharedTripPage } from "@/features/sharing/SharedTripPage";

export const metadata: Metadata = { title: "Shared trip", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedTripPage token={token} />;
}

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { TripContextBar } from "@/features/trips/TripContextBar";
import { requirePageUser } from "@/server/auth/session";
import { getOwnedTrip } from "@/server/services/access";

export default async function TripLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;
  const user = await requirePageUser(`/my-trip/${tripId}`);
  // Gate the whole trip area once: a missing trip or another account's trip is a plain 404 page.
  try {
    await getOwnedTrip(user, tripId);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  return (
    <div className="trip-area">
      <TripContextBar tripId={tripId} />
      {children}
    </div>
  );
}

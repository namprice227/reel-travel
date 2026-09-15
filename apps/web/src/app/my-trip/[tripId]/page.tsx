import { redirect } from "next/navigation";

export default async function TripIndex({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  redirect(`/my-trip/${tripId}/itinerary`);
}

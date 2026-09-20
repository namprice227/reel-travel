import { redirect } from "next/navigation";

// Editing moved into the itinerary itself; keep the old route working.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { tripId } = await params;
  const { day } = await searchParams;
  redirect(`/my-trip/${tripId}/itinerary?day=${day ?? 1}&edit=1`);
}

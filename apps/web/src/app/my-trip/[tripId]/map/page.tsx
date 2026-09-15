import { ItineraryPage } from "@/features/itinerary/ItineraryPage";

export const metadata = { title: "Map" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { tripId } = await params;
  const { day } = await searchParams;
  return <ItineraryPage tripId={tripId} view="map" day={day} />;
}

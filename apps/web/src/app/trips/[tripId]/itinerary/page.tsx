import { ItineraryPage } from "@/features/itinerary/ItineraryPage";

export const metadata = { title: "Itinerary" };

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <ItineraryPage tripId={tripId} />;
}

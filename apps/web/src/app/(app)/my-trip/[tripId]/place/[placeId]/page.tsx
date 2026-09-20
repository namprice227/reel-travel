import { PlacePage } from "@/features/places/PlacePage";

export const metadata = { title: "Place" };

export default async function Page({ params }: { params: Promise<{ tripId: string; placeId: string }> }) {
  const { tripId, placeId } = await params;
  return <PlacePage tripId={tripId} placeId={placeId} />;
}

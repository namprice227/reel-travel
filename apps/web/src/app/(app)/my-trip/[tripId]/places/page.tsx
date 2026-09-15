import { PlacesPage } from "@/features/places/PlacesPage";

export const metadata = { title: "Confirm places" };

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <PlacesPage tripId={tripId} />;
}

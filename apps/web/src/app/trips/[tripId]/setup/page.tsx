import { SetupPage } from "@/features/trips/SetupPage";

export const metadata = { title: "Trip setup" };

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <SetupPage tripId={tripId} />;
}

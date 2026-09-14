import { SharePage } from "@/features/sharing/SharePage";

export const metadata = { title: "Share" };

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <SharePage tripId={tripId} />;
}

import { InboxPage } from "@/features/inbox/InboxPage";

export const metadata = { title: "Inbox" };

export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <InboxPage tripId={tripId} />;
}

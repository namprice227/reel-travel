import { TripsPage } from "@/features/trips/TripsPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Create trip" };

// /my-trip/new is My trips with the create panel open; closing the panel returns to /my-trip.
export default async function Page() {
  await requirePageUser("/my-trip/new");
  return <TripsPage creating />;
}

import { CreateTripPage } from "@/features/trips/CreateTripPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Create trip" };

// /my-trip/new: pick a country, a city and the dates, then the trip opens on its details page.
export default async function Page() {
  await requirePageUser("/my-trip/new");
  return <CreateTripPage />;
}

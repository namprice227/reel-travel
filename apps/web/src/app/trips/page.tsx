import { TripsPage } from "@/features/trips/TripsPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "My trips" };

export default async function Page() {
  await requirePageUser("/trips");
  return <TripsPage />;
}

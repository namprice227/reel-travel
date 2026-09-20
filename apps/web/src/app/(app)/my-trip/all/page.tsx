import { AllTripsPage } from "@/features/trips/AllTripsPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "All trips" };

export default async function Page() {
  await requirePageUser("/my-trip/all");
  return <AllTripsPage />;
}

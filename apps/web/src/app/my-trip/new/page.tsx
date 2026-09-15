import { NewTripPage } from "@/features/trips/NewTripPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Create trip" };

export default async function Page() {
  await requirePageUser("/my-trip/new");
  return <NewTripPage />;
}

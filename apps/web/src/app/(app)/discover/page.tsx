import { DiscoverPage } from "@/features/discover/DiscoverPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Discover" };

export default async function Page() {
  await requirePageUser("/discover");
  return <DiscoverPage />;
}

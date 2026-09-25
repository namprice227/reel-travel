import { CreateTripPage } from "@/features/trips/CreateTripPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Create trip" };

// /my-trip/new: pick a country, a city and the dates, then the trip opens on its details page.
// From Home's detected-places popup, `places` carries account place IDs to copy in and `country` preselects
// their country. Both are only hints: the server checks ownership when the places are copied.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageUser("/my-trip/new");
  const query = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const accountPlaceIds = [...new Set(first(query.places).split(",").map((id) => id.trim()).filter((id) => id && id.length <= 100))].slice(0, 100);
  return <CreateTripPage accountPlaceIds={accountPlaceIds} countryCode={first(query.country) || null} />;
}

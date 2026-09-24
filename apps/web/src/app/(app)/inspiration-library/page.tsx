import { InspirationLibraryPage } from "@/features/library/InspirationLibraryPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Inspiration library" };

export default async function Page({ searchParams }: { searchParams: Promise<{ country?: string; place?: string }> }) {
  const { country, place } = await searchParams;
  const query = new URLSearchParams({ ...(country ? { country } : {}), ...(place ? { place } : {}) }).toString();
  await requirePageUser(`/inspiration-library${query ? `?${query}` : ""}`);
  return <InspirationLibraryPage countryId={country} placeId={place} />;
}

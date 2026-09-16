import { InspirationLibraryPage } from "@/features/library/InspirationLibraryPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Inspiration library" };

export default async function Page({ searchParams }: { searchParams: Promise<{ trip?: string; country?: string }> }) {
  const { trip, country } = await searchParams;
  const query = new URLSearchParams({ ...(trip ? { trip } : {}), ...(country ? { country } : {}) }).toString();
  await requirePageUser(`/inspiration-library${query ? `?${query}` : ""}`);
  return <InspirationLibraryPage tripId={trip} countryId={country} />;
}

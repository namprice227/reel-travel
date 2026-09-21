import { InspirationLibraryPage } from "@/features/library/InspirationLibraryPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Inspiration library" };

export default async function Page({ searchParams }: { searchParams: Promise<{ trip?: string; country?: string; save?: string }> }) {
  const { trip, country, save } = await searchParams;
  const query = new URLSearchParams({ ...(trip ? { trip } : {}), ...(country ? { country } : {}), ...(save ? { save } : {}) }).toString();
  await requirePageUser(`/inspiration-library${query ? `?${query}` : ""}`);
  return <InspirationLibraryPage tripId={trip} countryId={country} saveId={save} />;
}

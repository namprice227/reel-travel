import { InspirationLibraryPage } from "@/features/library/InspirationLibraryPage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Inspiration library" };

export default async function Page({ searchParams }: { searchParams: Promise<{ trip?: string }> }) {
  const { trip } = await searchParams;
  await requirePageUser(trip ? `/inspiration-library?trip=${encodeURIComponent(trip)}` : "/inspiration-library");
  return <InspirationLibraryPage tripId={trip} />;
}

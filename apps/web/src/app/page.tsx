import { LandingPage } from "@/features/landing/LandingPage";
import { HomePage } from "@/features/home/HomePage";
import { currentUser } from "@/server/auth/session";

export default async function Home() {
  const user = await currentUser();
  return user ? <HomePage /> : <LandingPage />;
}

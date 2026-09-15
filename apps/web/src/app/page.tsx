import { redirect } from "next/navigation";
import { LandingPage } from "@/features/landing/LandingPage";
import { currentUser } from "@/server/auth/session";

export default async function Root() {
  const user = await currentUser();
  if (user) redirect("/home");
  return <LandingPage />;
}

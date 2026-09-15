import { HomePage } from "@/features/home/HomePage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Home" };

export default async function Page() {
  await requirePageUser("/home");
  return <HomePage />;
}

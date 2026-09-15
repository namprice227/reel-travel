import { HomePage } from "@/features/home/HomePage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Home" };

export default async function Page() {
  const user = await requirePageUser("/home");
  return <HomePage name={user.displayName || user.email.split("@")[0]!} />;
}

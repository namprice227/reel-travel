import { Caveat } from "next/font/google";
import { HomePage } from "@/features/home/HomePage";
import { requirePageUser } from "@/server/auth/session";

export const metadata = { title: "Home" };
const handwriting = Caveat({ subsets: ["latin"], variable: "--font-handwriting", display: "swap" });

export default async function Page() {
  const user = await requirePageUser("/home");
  return <HomePage name={user.displayName || user.email.split("@")[0]!} handwritingClass={handwriting.variable} />;
}

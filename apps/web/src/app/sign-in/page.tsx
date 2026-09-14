import { SignInForm } from "@/features/auth/SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, so the redirect can't send people elsewhere.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/trips";
  return <SignInForm next={safeNext} />;
}

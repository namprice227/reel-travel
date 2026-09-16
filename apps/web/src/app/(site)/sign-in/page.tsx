import { SignInForm } from "@/features/auth/SignInForm";
import { config } from "@/server/config";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, so the redirect can't send people elsewhere.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u001f]/.test(next) ? next : "/home";
  return <SignInForm next={safeNext} development={config.devSignInEnabled} />;
}

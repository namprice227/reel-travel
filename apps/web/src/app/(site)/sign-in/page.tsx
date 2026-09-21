import { SignInForm } from "@/features/auth/SignInForm";
import { config } from "@/server/config";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <SignInForm development={config.devSignInEnabled} />;
}

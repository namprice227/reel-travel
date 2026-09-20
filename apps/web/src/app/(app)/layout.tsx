import type { ReactNode } from "react";
import { AppNavigation } from "@/components/AppNavigation";
import { currentUser } from "@/server/auth/session";

// Signed-in shell: persistent desktop navigation, mobile dock and an accessible account menu.
// On laptop-sized screens the main area is exactly one screen tall (see "fit-to-screen" in globals.css).
// Pages call requirePageUser() themselves, so a signed-out visitor is redirected with the right ?next= path.

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) return <main id="main" className="public-container public-main">{children}</main>;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <AppNavigation email={user.email} />
      <div className="app-stage">
        <main id="main" className="app-main">{children}</main>
      </div>
    </div>
  );
}

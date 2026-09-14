"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-link"
      onClick={async () => {
        await api("auth.signOut");
        router.push("/");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}

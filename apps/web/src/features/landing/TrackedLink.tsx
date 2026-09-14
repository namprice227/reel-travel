"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { track } from "@/lib/analytics";

export function TrackedLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className} onClick={() => track("landing_cta_clicked", { href })}>
      {children}
    </Link>
  );
}

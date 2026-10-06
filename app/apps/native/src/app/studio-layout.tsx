"use client";

import { AppLayout } from "@workspace/core/components/layout/app-layout";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

// Prefetching RSC payloads races and silently fails on WebView2 (Tauri on Windows).
function NativeLink({ href, children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link href={href} prefetch={false} {...props}>
      {children}
    </Link>
  );
}

export function StudioLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <AppLayout LinkComponent={NativeLink} pathname={pathname}>
      {children}
    </AppLayout>
  );
}

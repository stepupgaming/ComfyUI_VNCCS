"use client";

import { AppHeader } from "@workspace/core/components/layout/app-header";
import { AppSidebar } from "@workspace/core/components/layout/app-sidebar";
import { StatusBar } from "@workspace/core/components/layout/status-bar";
import type { LinkComponent } from "@workspace/core/config/navigation";
import { useConnectionMonitor } from "@workspace/core/hooks/use-connection-monitor";
import { useCatalog } from "@workspace/core/hooks/use-control-center";
import { useRuntimeAutostart } from "@workspace/core/hooks/use-runtime-autostart";
import { ThemeProvider } from "@workspace/core/providers/theme-provider";
import {
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { Toaster } from "@workspace/ui/components/sonner";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import type { ReactNode } from "react";

interface AppLayoutProps {
  children: ReactNode;
  LinkComponent?: LinkComponent;
  pathname: string;
}

function BackgroundServices() {
  useConnectionMonitor();
  useRuntimeAutostart();
  useCatalog();
  return null;
}

export function AppLayout({
  children,
  LinkComponent = "a",
  pathname,
}: AppLayoutProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange={true}
      enableColorScheme={true}
      enableSystem={true}
    >
      <TooltipProvider>
        <BackgroundServices />
        <SidebarProvider className="h-screen">
          <AppSidebar LinkComponent={LinkComponent} pathname={pathname} />
          <SidebarInset className="min-h-0 overflow-hidden">
            <AppHeader pathname={pathname} />
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
            <StatusBar />
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="bottom-right" richColors={true} />
      </TooltipProvider>
    </ThemeProvider>
  );
}

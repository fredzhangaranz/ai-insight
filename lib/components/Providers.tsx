"use client";

import type React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { AIModelProvider } from "@/lib/context/AIModelContext";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SideNav } from "@/app/components/shell/SideNav";
import { MustChangePasswordBanner } from "@/app/components/profile/MustChangePasswordBanner";
import { Toaster } from "@/components/ui/toaster";

interface ProvidersProps {
  children: React.ReactNode;
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Show sidebar only when:
  // 1. Chart insights are enabled
  // 2. User is authenticated (session exists)
  // 3. Not on login page
  const shouldShowSidebar =
    process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true" &&
    status === "authenticated" &&
    pathname !== "/login";

  if (shouldShowSidebar) {
    return (
      <div className="min-h-screen bg-slate-50">
        <main className="w-full px-6 py-8">
          <SidebarProvider>
            <SideNav />
            <SidebarInset>
              <MustChangePasswordBanner />
              {children}
            </SidebarInset>
          </SidebarProvider>
        </main>
      </div>
    );
  }

  // For login page or when not authenticated, render children without sidebar
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="w-full px-6 py-8">
        <MustChangePasswordBanner />
        {children}
      </main>
    </div>
  );
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <AIModelProvider>
        <AppContent>{children}</AppContent>
        <Toaster />
      </AIModelProvider>
    </SessionProvider>
  );
}

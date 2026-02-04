"use client";

import type React from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { AIModelProvider } from "@/lib/context/AIModelContext";
import { CustomerProvider } from "@/lib/context/CustomerContext";
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

  // Show sidebar when authenticated and not on login page
  const shouldShowSidebar = status === "authenticated" && pathname !== "/login";

  if (shouldShowSidebar) {
    return (
      <div className="min-h-screen bg-slate-50 overflow-x-hidden">
        <main className="w-full px-6 py-8 overflow-x-hidden">
          <SidebarProvider>
            <SideNav />
            <SidebarInset className="overflow-x-hidden">
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
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      <main className="w-full px-6 py-8 overflow-x-hidden">
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
        <CustomerProvider>
          <AppContent>{children}</AppContent>
          <Toaster />
        </CustomerProvider>
      </AIModelProvider>
    </SessionProvider>
  );
}

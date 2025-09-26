import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AIModelProvider } from "@/lib/context/AIModelContext";
import "./globals.css";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SideNav } from "@/app/components/shell/SideNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InsightGen - AI-Powered Clinical Analytics",
  description: "Transform clinical data into actionable insights",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AIModelProvider>
          <div className="min-h-screen bg-slate-50">
            {/* Main Content */}
            <main className="w-full px-6 py-8">
              {process.env.CHART_INSIGHTS_ENABLED === "true" ? (
                <SidebarProvider>
                  <SideNav />
                  <SidebarInset>{children}</SidebarInset>
                </SidebarProvider>
              ) : (
                children
              )}
            </main>
          </div>
        </AIModelProvider>
      </body>
    </html>
  );
}

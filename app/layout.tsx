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
            {/* Header */}
            <header className="bg-white border-b border-slate-200">
              <div className="max-w-7xl mx-auto px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div> */}
                    {/* <h1 className="text-xl font-bold text-slate-900">
                      InsightGensss
                    </h1> */}
                  </div>
                </div>
              </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
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

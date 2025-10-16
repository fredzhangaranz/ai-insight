"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface InsightItem {
  id: string;
  name: string;
  scope: string;
  formId?: string;
}

export default function InsightsPage() {
  const [items, setItems] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";
  const apiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true"; // ui gate mirrors api for client

  useEffect(() => {
    const loadInsights = async () => {
      if (!enabled || !apiEnabled) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/insights", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Failed to load insights");
        }
        const data = await res.json();
        setItems(data.items || []);
      } catch (e: any) {
        setError(e.message);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    loadInsights();
  }, [enabled, apiEnabled]);

  if (!enabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Insights are disabled. Set CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }

  if (!apiEnabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Insights API disabled. Set NEXT_PUBLIC_CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-8">
            <div className="border-b border-slate-200 pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <nav className="flex text-sm text-slate-500 mb-2">
                    <span>Insights</span>
                  </nav>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                    Saved Insights
                  </h1>
                  <p className="text-slate-600 mt-1">
                    Manage and view your previously generated AI insights
                  </p>
                </div>
                <div className="mt-4 sm:mt-0">
                  <Link
                    href="/insights/new"
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    + New Insight
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-600">Loading insights...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="mb-8">
            <div className="border-b border-slate-200 pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <nav className="flex text-sm text-slate-500 mb-2">
                    <span>Insights</span>
                  </nav>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                    Saved Insights
                  </h1>
                  <p className="text-slate-600 mt-1">
                    Manage and view your previously generated AI insights
                  </p>
                </div>
                <div className="mt-4 sm:mt-0">
                  <Link
                    href="/insights/new"
                    className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    + New Insight
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded p-4">
            <div className="text-sm text-red-700">
              Error loading insights: {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header with Breadcrumb and Page Title */}
        <div className="mb-8">
          <div className="border-b border-slate-200 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <nav className="flex text-sm text-slate-500 mb-2">
                  <span>Insights</span>
                </nav>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Saved Insights
                </h1>
                <p className="text-slate-600 mt-1">
                  Manage and view your previously generated AI insights
                </p>
              </div>
              <div className="mt-4 sm:mt-0">
                <Link
                  href="/insights/new"
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  + New Insight
                </Link>
              </div>
            </div>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-gray-600">No insights yet.</div>
        ) : (
          <ul className="divide-y border rounded bg-white">
            {items.map((it: InsightItem) => (
              <li
                key={it.id}
                className="p-4 hover:bg-gray-50 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-gray-500">
                    {it.scope}
                    {it.formId ? ` • ${it.formId}` : ""}
                  </div>
                </div>
                <Link
                  href={`/insights/${it.id}`}
                  className="text-blue-600 text-sm"
                >
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

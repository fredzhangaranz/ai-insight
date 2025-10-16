"use client";

import { useEffect, useState } from "react";

interface OverviewData {
  formsActive: number;
  insightsTotal: number;
}

export default function HomePage() {
  const [overview, setOverview] = useState<OverviewData>({
    formsActive: 0,
    insightsTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";

  useEffect(() => {
    const loadOverview = async () => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/stats/overview", {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Failed to load overview stats");
        }
        const data = await res.json();
        setOverview(data);
      } catch (e: any) {
        setError(e.message);
        // Set default values on error
        setOverview({ formsActive: 0, insightsTotal: 0 });
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, [enabled]);

  if (!enabled) {
    return (
      <div className="text-sm text-gray-600">
        New Home is disabled. Set CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Home</h1>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border rounded p-4">
            <div className="text-sm text-gray-500">Active Forms</div>
            <div className="text-3xl font-bold">Loading...</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-sm text-gray-500">Saved Insights</div>
            <div className="text-3xl font-bold">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Home</h1>
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <div className="text-sm text-red-700">
            Error loading overview: {error}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border rounded p-4">
            <div className="text-sm text-gray-500">Active Forms</div>
            <div className="text-3xl font-bold">{overview.formsActive}</div>
          </div>
          <div className="bg-white border rounded p-4">
            <div className="text-sm text-gray-500">Saved Insights</div>
            <div className="text-3xl font-bold">{overview.insightsTotal}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Home</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Active Forms</div>
          <div className="text-3xl font-bold">{overview.formsActive}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Saved Insights</div>
          <div className="text-3xl font-bold">{overview.insightsTotal}</div>
        </div>
      </div>
    </div>
  );
}

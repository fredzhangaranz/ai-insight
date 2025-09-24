"use client";
import { useEffect, useState } from "react";
import { ChartComponent } from "@/app/components/charts/chart-component";
import type { ChartType } from "@/lib/chart-contracts";

export default function InsightDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const enabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";
  const [insight, setInsight] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [execLoading, setExecLoading] = useState(false);
  const [execData, setExecData] = useState<{
    rows: any[];
    chart: { chartType: ChartType; data: any };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/insights/${params.id}`);
        if (!res.ok) throw new Error("Failed to load insight");
        setInsight(await res.json());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    if (enabled) load();
    else setLoading(false);
  }, [params.id, enabled]);

  const execute = async () => {
    setExecLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/${params.id}/execute`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Execute failed");
      setExecData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExecLoading(false);
    }
  };

  if (!enabled)
    return (
      <div className="p-6 text-sm text-gray-600">Insights are disabled.</div>
    );
  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!insight) return <div className="p-6">Not found.</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-8">
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold">{insight.name}</h1>
            <div className="text-sm text-gray-600">{insight.question}</div>
          </div>
          <div className="text-xs bg-gray-50 p-3 rounded border">
            <div className="font-medium mb-1">SQL</div>
            <pre className="whitespace-pre-wrap">{insight.sql}</pre>
          </div>

          <div className="flex gap-2">
            <button
              onClick={execute}
              className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              disabled={execLoading}
            >
              {execLoading ? "Executing..." : "Execute"}
            </button>
          </div>

          {execData && (
            <div className="space-y-3">
              <div className="text-sm text-gray-700">
                Rows returned: {execData.rows?.length || 0}
              </div>
              <div className="h-96 bg-white border rounded p-4">
                <ChartComponent
                  chartType={execData.chart.chartType}
                  data={execData.chart.data}
                  title={insight.name}
                  className="w-full h-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { ChartComponent } from "@/app/components/charts/chart-component";
import type { ChartType } from "@/lib/chart-contracts";
import { ChartGenerationModal } from "@/components/funnel/ChartGenerationModal";

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
  const [isEditingSQL, setIsEditingSQL] = useState(false);
  const [editedSQL, setEditedSQL] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [isEditingChart, setIsEditingChart] = useState(false);
  const [chartEditLoading, setChartEditLoading] = useState(false);

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

  const startEditingSQL = () => {
    setEditedSQL(insight?.sql || "");
    setIsEditingSQL(true);
    setError(null);
  };

  const cancelEditingSQL = () => {
    setIsEditingSQL(false);
    setEditedSQL("");
    setError(null);
  };

  const saveSQL = async () => {
    if (!editedSQL.trim()) {
      setError("SQL cannot be empty");
      return;
    }

    setSaveLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: editedSQL }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to save SQL");

      // Update the insight with the new SQL
      setInsight(data);
      setIsEditingSQL(false);
      setEditedSQL("");

      // Clear any existing execution data since SQL changed
      setExecData(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const startEditingChart = async () => {
    if (!execData?.rows || execData.rows.length === 0) {
      setError("Please execute the query first to get data for chart editing");
      return;
    }
    setIsEditingChart(true);
    setError(null);
  };

  const handleChartSave = async (config: {
    chartType: ChartType;
    chartMapping: Record<string, string>;
  }) => {
    setChartEditLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/insights/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chartType: config.chartType,
          chartMapping: config.chartMapping,
        }),
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data?.message || "Failed to update chart configuration"
        );

      // Update the insight with the new chart configuration
      setInsight(data);
      setIsEditingChart(false);

      // Re-execute to show updated chart
      await execute();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChartEditLoading(false);
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
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">SQL</div>
              {!isEditingSQL && (
                <button
                  onClick={startEditingSQL}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Edit SQL
                </button>
              )}
            </div>
            {isEditingSQL ? (
              <>
                <textarea
                  value={editedSQL}
                  onChange={(e) => setEditedSQL(e.target.value)}
                  className="w-full text-xs font-mono bg-transparent border-none resize-none whitespace-pre-wrap focus:outline-none"
                  placeholder="Enter your SQL query..."
                  rows={Math.max(6, editedSQL.split("\n").length)}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={saveSQL}
                    disabled={saveLoading}
                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {saveLoading ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={cancelEditingSQL}
                    disabled={saveLoading}
                    className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <pre className="whitespace-pre-wrap">{insight.sql}</pre>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={execute}
              className="px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              disabled={execLoading || isEditingSQL}
            >
              {execLoading ? "Executing..." : "Execute"}
            </button>
            {isEditingSQL && (
              <div className="text-sm text-gray-600 flex items-center">
                Save your SQL changes before executing
              </div>
            )}
          </div>

          {execData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Rows returned: {execData.rows?.length || 0}
                </div>
                <button
                  onClick={startEditingChart}
                  disabled={isEditingSQL || chartEditLoading}
                  className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  Edit Chart
                </button>
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

      {/* Chart Edit Modal */}
      {isEditingChart && execData && insight && (
        <ChartGenerationModal
          isOpen={isEditingChart}
          onClose={() => setIsEditingChart(false)}
          queryResults={execData.rows}
          subQuestion={insight.question}
          canSave={true}
          onRequestSave={handleChartSave}
          editMode={true}
          initialChartType={insight.chartType}
          initialChartMapping={insight.chartMapping || {}}
        />
      )}
    </div>
  );
}

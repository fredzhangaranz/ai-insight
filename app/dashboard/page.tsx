"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChartComponent } from "@/app/components/charts/chart-component";
import type { ChartType } from "@/lib/chart-contracts";

type InsightItem = {
  id: number;
  name: string;
  scope: string;
  formId?: string | null;
};

export default function DashboardPage() {
  const uiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";
  const apiEnabled = process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true"; // ui gate mirrors api for client
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | { panelId: string }>(
    null
  );
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [executions, setExecutions] = useState<
    Record<string, { chartType: ChartType; data: any } | null>
  >({});
  const [insightsById, setInsightsById] = useState<Record<number, any>>({});
  const [formsById, setFormsById] = useState<
    Record<string, { name: string; version: number }>
  >({});
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/dashboards/default", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load dashboard");
        const d = await res.json();
        setDashboard(d);
        // Load assessment forms for name lookup (for form-scoped insights)
        try {
          const fr = await fetch("/api/assessment-forms");
          if (fr.ok) {
            const list = await fr.json();
            console.log("Assessment forms loaded:", list);
            const map: Record<string, { name: string; version: number }> = {};
            for (const f of list) {
              map[f.assessmentFormId] = {
                name: f.assessmentFormName,
                version: f.definitionVersion,
              };
            }
            console.log("Forms mapping:", map);
            console.log("Form IDs in mapping:", Object.keys(map));
            setFormsById(map);
          }
        } catch (_) {}
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    if (uiEnabled && apiEnabled) load();
    else setLoading(false);
  }, [uiEnabled, apiEnabled]);

  const panels = useMemo(() => dashboard?.panels?.panels || [], [dashboard]);

  const openPicker = async (panelId: string) => {
    setPickerOpen({ panelId });
    try {
      const res = await fetch(`/api/insights?scope=&search=`);
      const data = await res.json();
      const items: InsightItem[] = data.items || [];
      setInsights(items);
      // Ensure we have form names for all form-scoped insights shown in the picker (by version ID)
      const missing = Array.from(
        new Set(
          items
            .filter(
              (i) => i.scope === "form" && i.formId && !formsById[i.formId!]
            )
            .map((i) => i.formId!)
        )
      );
      await Promise.all(
        missing.map(async (fid) => {
          try {
            const fr = await fetch(`/api/assessment-forms/version/${fid}`);
            if (fr.ok) {
              const fv = await fr.json();
              setFormsById((prev) => ({
                ...prev,
                [fid]: {
                  name: fv.assessmentFormName,
                  version: fv.definitionVersion,
                },
              }));
            }
          } catch (_) {}
        })
      );
    } catch (e) {
      // ignore; shown as empty
    }
  };

  const bind = async (panelId: string, insightId: number) => {
    await fetch(`/api/dashboards/panel/${panelId}/bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insightId }),
    });
    const res = await fetch("/api/dashboards/default", { cache: "no-store" });
    const d = await res.json();
    setDashboard(d);
    setPickerOpen(null);
    // Immediately load the new chart/table for this panel
    execute(panelId, insightId);
    // Load and cache the bound insight details
    try {
      const ir = await fetch(`/api/insights/${insightId}`);
      if (ir.ok) {
        const info = await ir.json();
        setInsightsById((prev) => ({ ...prev, [insightId]: info }));
        if (info.scope === "form" && info.formId && !formsById[info.formId]) {
          try {
            const fr = await fetch(
              `/api/assessment-forms/version/${info.formId}`
            );
            if (fr.ok) {
              const fv = await fr.json();
              setFormsById((prev) => ({
                ...prev,
                [info.formId]: {
                  name: fv.assessmentFormName,
                  version: fv.definitionVersion,
                },
              }));
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  };

  const execute = async (panelId: string, insightId: number) => {
    setExecutions((prev) => ({ ...prev, [panelId]: null }));
    const res = await fetch(`/api/insights/${insightId}/execute`, {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setExecutions((p) => ({ ...p, [panelId]: null }));
      return;
    }
    setExecutions((p) => ({ ...p, [panelId]: data.chart }));
  };

  // When dashboard panels change, prefetch detail for bound insights and ensure form names are loaded by version ID
  useEffect(() => {
    const ids: number[] = [];
    for (const p of panels) {
      if (p.insightId && !insightsById[p.insightId]) ids.push(p.insightId);
    }
    if (ids.length === 0) return;
    (async () => {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const r = await fetch(`/api/insights/${id}`);
            if (r.ok) {
              const info = await r.json();
              setInsightsById((prev) => ({ ...prev, [id]: info }));
              // if form-scoped, ensure form name is loaded by version ID
              const formId = info?.formId;
              if (info?.scope === "form" && formId && !formsById[formId]) {
                try {
                  const fr = await fetch(
                    `/api/assessment-forms/version/${formId}`
                  );
                  if (fr.ok) {
                    const fv = await fr.json();
                    setFormsById((prev) => ({
                      ...prev,
                      [formId]: {
                        name: fv.assessmentFormName,
                        version: fv.definitionVersion,
                      },
                    }));
                  }
                } catch (_) {}
              }
            }
          } catch (_) {}
        })
      );
    })();
  }, [panels]);

  // Auto refresh all bound insights when auto refresh is enabled and panels are loaded
  useEffect(() => {
    if (!autoRefresh || panels.length === 0) return;

    const boundPanels = panels.filter((p: any) => p.insightId);
    if (boundPanels.length === 0) return;

    // Execute all bound insights automatically
    boundPanels.forEach((panel: any) => {
      if (panel.insightId) {
        execute(panel.id, panel.insightId);
      }
    });
  }, [autoRefresh, panels]);

  if (!uiEnabled)
    return (
      <div className="p-6 text-sm text-gray-600">
        Dashboard is disabled. Set CHART_INSIGHTS_ENABLED=true and
        NEXT_PUBLIC_CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center space-x-2">
          <label
            htmlFor="auto-refresh"
            className="text-sm font-medium text-gray-700"
          >
            Auto Refresh
          </label>
          <input
            id="auto-refresh"
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {panels.map((p: any) => (
          <div
            key={p.id}
            className="border rounded bg-white h-96 p-3 flex flex-col relative min-h-0"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium truncate">
                {p.title || p.id}
              </div>
              <div className="text-xs text-gray-500">
                {p.insightId ? `#${p.insightId}` : ""}
              </div>
            </div>
            {!p.insightId ? (
              <button
                className="flex-1 border border-dashed rounded text-sm text-gray-600 hover:bg-gray-50"
                onClick={() => openPicker(p.id)}
              >
                + Bind Insight
              </button>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                {/* Insight meta */}
                <div className="mb-1">
                  <div
                    className="text-[13px] font-medium text-gray-900"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2 as any,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                    title={insightsById[p.insightId]?.name || ""}
                  >
                    {insightsById[p.insightId]?.name || "Insight"}
                  </div>
                  {(() => {
                    const info = insightsById[p.insightId];
                    const fid = info?.formId;
                    const fm = fid ? formsById[fid] : undefined;
                    if (info?.scope === "form" && fm) {
                      return (
                        <div className="text-[11px] text-gray-500">{`${fm.name} v${fm.version}`}</div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      className="px-2 py-1 text-xs border rounded"
                      onClick={() => execute(p.id, p.insightId)}
                    >
                      Refresh
                    </button>
                    <Link
                      href={`/insights/${p.insightId}`}
                      className="px-2 py-1 text-xs border rounded text-blue-700 hover:bg-blue-50"
                      title="View saved insight"
                    >
                      View
                    </Link>
                  </div>
                  <button
                    className="px-2 py-1 text-xs border rounded"
                    onClick={() => openPicker(p.id)}
                    title="Change bound insight"
                  >
                    Change
                  </button>
                </div>
                <div className="flex-1 overflow-hidden min-h-0">
                  {executions[p.id] ? (
                    <ChartComponent
                      chartType={executions[p.id]!.chartType}
                      data={executions[p.id]!.data}
                      title=""
                      className="w-full h-full"
                    />
                  ) : (
                    <div className="text-xs text-gray-400">
                      Click Refresh to load chart
                    </div>
                  )}
                </div>
                {insightsById[p.insightId]?.createdAt && (
                  <div className="absolute bottom-2 right-3 text-[10px] text-gray-400">
                    {new Date(
                      insightsById[p.insightId].createdAt
                    ).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold">Select Insight</div>
              <button
                className="text-gray-500"
                onClick={() => setPickerOpen(null)}
              >
                ✕
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y">
              {insights.length === 0 ? (
                <div className="text-sm text-gray-500 p-4">
                  No insights found.
                </div>
              ) : (
                insights.map((it) => (
                  <button
                    key={it.id}
                    className="w-full text-left p-3 hover:bg-gray-50"
                    onClick={() => bind(pickerOpen.panelId, it.id)}
                  >
                    <div className="font-medium text-sm">{it.name}</div>
                    <div className="text-xs text-gray-500">
                      {it.scope}
                      {it.scope === "form" && it.formId && formsById[it.formId]
                        ? ` • ${formsById[it.formId].name} v${
                            formsById[it.formId].version
                          }`
                        : ""}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

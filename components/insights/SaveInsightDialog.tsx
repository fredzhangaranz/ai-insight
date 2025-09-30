"use client";
import React, { useEffect, useState } from "react";

export interface SaveInsightInitial {
  name?: string;
  question: string;
  scope: "form" | "schema";
  formId?: string | null;
  sql: string;
  chartType: "bar" | "line" | "pie" | "kpi" | "table";
  chartMapping: any;
  chartOptions?: any;
  tags?: string[];
}

interface SaveInsightDialogProps {
  open: boolean;
  onClose: () => void;
  initial: SaveInsightInitial;
  onSaved?: (saved: any) => void;
}

export function SaveInsightDialog({ open, onClose, initial, onSaved }: SaveInsightDialogProps) {
  const [name, setName] = useState(initial.name || initial.question.slice(0, 100));
  const [tagsInput, setTagsInput] = useState((initial.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const apiEnabled = typeof window !== "undefined" && process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true";

  useEffect(() => {
    if (open) {
      setName(initial.name || initial.question.slice(0, 100));
      setTagsInput((initial.tags || []).join(", "));
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: name && name.trim().length > 0 ? name.trim() : initial.question.slice(0, 100),
        question: initial.question,
        scope: initial.scope,
        formId: initial.formId || null,
        sql: initial.sql,
        chartType: initial.chartType,
        chartMapping: initial.chartType === "table" ? (initial.chartMapping || {}) : initial.chartMapping,
        chartOptions: initial.chartOptions || undefined,
        description: null,
        tags: tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        createdBy: null,
      };
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to save insight");
      onSaved?.(data);
      onClose();
    } catch (e: any) {
      alert(e.message || "Failed to save insight");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="text-lg font-semibold">Save Insight</div>
        <div className="space-y-2">
          <label className="text-xs text-gray-600">Name</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-gray-600">Tags (comma separated)</label>
          <input
            className="w-full border rounded px-3 py-2 text-sm"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-3 py-2 text-sm border rounded" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="px-3 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-50"
            onClick={handleSave}
            disabled={saving || !apiEnabled}
            title={apiEnabled ? "" : "Insights are disabled"}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}


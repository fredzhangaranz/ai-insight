"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FunnelContainer } from "@/components/funnel/FunnelContainer";
import { SparklesIcon, TrashIcon } from "@/components/heroicons";
import { format } from "date-fns";

const DEFAULT_QUESTION =
  "How have wound healing outcomes trended across all facilities in the last 6 months?";

export default function SchemaAnalysisClient() {
  const [question, setQuestion] = useState<string>(DEFAULT_QUESTION);
  const [showFunnel, setShowFunnel] = useState(false);
  const [funnelKey, setFunnelKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    Array<{
      id: number;
      originalQuestion: string;
      status: string;
      createdDate: string;
      lastModifiedDate: string;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const [recentRes, historyRes] = await Promise.all([
          fetch("/api/ai/funnel/recent/schema", { cache: "no-store" }),
          fetch("/api/ai/funnel/history/schema", { cache: "no-store" }),
        ]);
        if (ignore) return;

        if (recentRes.ok && recentRes.status !== 204) {
          const recent = await recentRes.json();
          if (recent?.originalQuestion && question === DEFAULT_QUESTION) {
            setQuestion(recent.originalQuestion);
          }
        } else if (!recentRes.ok) {
          const data = await recentRes.json().catch(() => ({}));
          throw new Error(
            data?.message || "Failed to load recent schema question"
          );
        }

        if (!historyRes.ok) {
          const data = await historyRes.json().catch(() => ({}));
          throw new Error(data?.message || "Failed to load schema history");
        }
        const historyData = await historyRes.json();
        setHistory(Array.isArray(historyData) ? historyData : []);
        setLoadError(null);
      } catch (err: any) {
        if (!ignore) {
          setLoadError(err?.message || "Unable to load previous question");
        }
      } finally {
        if (!ignore) setHistoryLoading(false);
      }
    };
    loadHistory();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedHistory = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        createdDisplay: format(new Date(item.createdDate), "PP p"),
        updatedDisplay: format(new Date(item.lastModifiedDate), "PP p"),
      })),
    [history]
  );

  const startFunnel = () => {
    if (!question.trim()) {
      setError("Enter a question to start the funnel.");
      return;
    }
    setShowFunnel(true);
    setFunnelKey((prev) => prev + 1);
    setError(null);
  };

  const resumeFunnel = (existingQuestion: string) => {
    setQuestion(existingQuestion);
    setError(null);
    setShowFunnel(true);
    setFunnelKey((prev) => prev + 1);
  };

  const handleDelete = async (id: number, originalQuestion: string) => {
    const confirmed = window.confirm(
      "Delete this schema insight question and its generated steps? This cannot be undone."
    );
    if (!confirmed) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/ai/funnel/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to delete question");
      }
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (!showFunnel && question === originalQuestion) {
        setQuestion(DEFAULT_QUESTION);
      }
    } catch (err: any) {
      setLoadError(err?.message || "Failed to delete question");
    } finally {
      setDeletingId(null);
    }
  };

  if (showFunnel) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="w-full flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Database Insight Funnel
              </p>
              <h1 className="text-xl font-semibold text-slate-900">
                {question}
              </h1>
            </div>
            <Button
              variant="ghost"
              onClick={() => setShowFunnel(false)}
              className="text-slate-600 hover:text-slate-900"
            >
              ← Back to question
            </Button>
          </div>
        </div>
        <div className="w-full px-6 py-8">
          <FunnelContainer
            key={`schema-funnel-${funnelKey}`}
            originalQuestion={question}
            assessmentFormDefinition={undefined}
            assessmentFormId={undefined}
            patientId={null}
            scope="schema"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="w-full px-6 py-8 space-y-6">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <SparklesIcon className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Start a Schema Insight
            </h1>
            <p className="text-sm text-slate-600">
              Ask a question across the rpt schema. We will decompose it,
              generate SQL, and prepare charts you can save as insights.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-800">
            Analytical question
          </label>
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={4}
            placeholder="Example: Which wound care interventions drive the biggest improvement in area reduction across all facilities?"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {loadError && !error && (
            <p className="text-xs text-amber-600">{loadError}</p>
          )}
        </div>

        <div>
          <Button
            onClick={startFunnel}
            className="bg-blue-600 text-white hover:bg-blue-700"
          >
            Launch Funnel
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              Previous schema insights
            </h2>
            {historyLoading && (
              <span className="text-xs text-slate-500">Loading…</span>
            )}
          </div>
          <div className="border rounded-lg bg-white">
            <div className="max-h-64 overflow-y-auto">
              {formattedHistory.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">
                  No previous schema questions yet.
                </div>
              ) : (
                <table className="min-w-full divide-y text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Question</th>
                      <th className="px-4 py-2">Created</th>
                      <th className="px-4 py-2">Last updated</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {formattedHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td
                          className="px-4 py-2 align-top text-slate-800 cursor-pointer"
                          onClick={() => resumeFunnel(item.originalQuestion)}
                        >
                          <div className="line-clamp-2 text-sm">
                            {item.originalQuestion}
                          </div>
                        </td>
                        <td
                          className="px-4 py-2 text-xs text-slate-500 cursor-pointer"
                          onClick={() => resumeFunnel(item.originalQuestion)}
                        >
                          {item.createdDisplay}
                        </td>
                        <td
                          className="px-4 py-2 text-xs text-slate-500 cursor-pointer"
                          onClick={() => resumeFunnel(item.originalQuestion)}
                        >
                          {item.updatedDisplay}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDelete(item.id, item.originalQuestion)}
                            disabled={deletingId === item.id}
                          >
                            {deletingId === item.id ? (
                              <span className="text-xs">Deleting…</span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <TrashIcon className="h-4 w-4" /> Delete
                              </span>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

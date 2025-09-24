"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FunnelContainer } from "@/components/funnel/FunnelContainer";
import { SparklesIcon } from "@/components/heroicons";

const DEFAULT_QUESTION =
  "How have wound healing outcomes trended across all facilities in the last 6 months?";

export default function SchemaAnalysisClient() {
  const [question, setQuestion] = useState<string>(DEFAULT_QUESTION);
  const [showFunnel, setShowFunnel] = useState(false);
  const [funnelKey, setFunnelKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadRecentQuestion = async () => {
      try {
        const res = await fetch("/api/ai/funnel/recent/schema", {
          cache: "no-store",
        });
        if (ignore) return;
        if (res.status === 204) {
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.message || "Failed to load recent schema question");
        }
        const data = await res.json();
        if (data?.originalQuestion && question === DEFAULT_QUESTION) {
          setQuestion(data.originalQuestion);
        }
      } catch (err: any) {
        if (!ignore) {
          setLoadError(err?.message || "Unable to load previous question");
        }
      }
    };
    loadRecentQuestion();
    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startFunnel = () => {
    if (!question.trim()) {
      setError("Enter a question to start the funnel.");
      return;
    }
    setShowFunnel(true);
    setFunnelKey((prev) => prev + 1);
    setError(null);
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
      <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
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
      </div>
    </div>
  );
}

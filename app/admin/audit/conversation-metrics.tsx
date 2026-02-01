"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingDots } from "@/app/components/loading-dots";

interface ConversationMetrics {
  total_conversations: number;
  avg_questions_per_conversation: number;
  avg_composition_rate: number;
  total_queries: number;
  composed_queries: number;
}

interface ConversationMetricsResponse {
  metrics?: ConversationMetrics;
}

export function ConversationMetricsCard() {
  const [metrics, setMetrics] = useState<ConversationMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/admin/audit/conversations");
        if (!response.ok) {
          throw new Error("Failed to load conversation metrics");
        }
        const data = (await response.json()) as ConversationMetricsResponse;
        setMetrics(data.metrics ?? null);
      } catch (err: any) {
        console.error("[ConversationMetrics] Failed to load:", err);
        setError(err?.message ?? "Unable to load conversation metrics");
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation Context</CardTitle>
        <CardDescription>
          Adoption and carryover health for multi-turn insights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !metrics ? (
          <div className="text-sm text-slate-600">
            <LoadingDots />
          </div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : metrics ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs uppercase text-slate-500">Total conversations</p>
              <p className="text-2xl font-semibold">{metrics.total_conversations}</p>
              <p className="text-xs text-slate-500">
                {metrics.total_queries} total queries
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Avg questions</p>
              <p className="text-2xl font-semibold">
                {metrics.avg_questions_per_conversation}
              </p>
              <p className="text-xs text-slate-500">Per conversation</p>
            </div>
            <div>
              <p className="text-xs uppercase text-slate-500">Context carryover</p>
              <p className="text-2xl font-semibold">
                {metrics.avg_composition_rate}%
              </p>
              <p className="text-xs text-slate-500">
                {metrics.composed_queries} composed queries
              </p>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-600">No metrics available.</div>
        )}
      </CardContent>
    </Card>
  );
}

// app/insights/new/components/QueryHistory.tsx

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Clock, AlertCircle } from "lucide-react";

interface Query {
  id: string;
  question: string;
  createdAt: Date;
  mode: "template" | "direct" | "funnel" | "error";
  recordCount?: number;
  sql?: string;
  semanticContext?: any;
}

interface QueryHistoryProps {
  customerId: string;
  onSelect: (query: Query) => void;
}

export function QueryHistory({
  customerId,
  onSelect
}: QueryHistoryProps) {
  const [queries, setQueries] = useState<Query[]>([]);

  useEffect(() => {
    if (customerId) {
      fetchQueryHistory();
    }
  }, [customerId]);

  const fetchQueryHistory = async () => {
    try {
      const response = await fetch(
        `/api/insights/history?customerId=${customerId}`
      );
      if (!response.ok) {
        console.error(`Failed to fetch query history: ${response.status}`);
        setQueries([]);
        return;
      }
      const data = await response.json();
      // Ensure data is always an array
      setQueries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch query history:", error);
      setQueries([]);
    }
  };

  if (!customerId || queries.length === 0) return null;

  return (
    <div className="mt-8 pt-8 border-t space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Clock className="h-4 w-4" />
        <span>Query History (Click to load cached results)</span>
      </div>
      <div className="space-y-2">
        {queries.map((q) => (
          <Button
            key={q.id}
            variant="ghost"
            className={`w-full justify-start text-left h-auto py-3 ${
              q.mode === "error" ? "border-l-2 border-red-400" : "border-l-2 border-transparent hover:border-blue-400"
            }`}
            onClick={() => onSelect(q)}
          >
            <div className="flex items-start gap-2 w-full">
              {q.mode === "error" && (
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="space-y-1 flex-1">
                <div className="font-medium">{q.question}</div>
                <div className="text-xs text-gray-500">
                  {formatTimestamp(q.createdAt)}
                  {q.mode === "error" && (
                    <span className="text-red-500"> • Failed query</span>
                  )}
                  {q.mode !== "error" && q.recordCount !== undefined && (
                    <> • {q.recordCount} records</>
                  )}
                  {q.mode === "template" && " • Used template"}
                  {q.semanticContext?.clarificationsProvided && (
                    <span className="text-blue-600"> • Clarified</span>
                  )}
                </div>
              </div>
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}

function formatTimestamp(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return "Just now";
  if (hours === 1) return "1h ago";
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

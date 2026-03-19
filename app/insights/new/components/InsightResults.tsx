// app/insights/new/components/InsightResults.tsx
// Thin passthrough to ResultBlock (kept for backward compatibility / tests)

"use client";

import { ResultBlock } from "./ResultBlock";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface InsightResultsProps {
  result: InsightResult;
  customerId: string;
  modelId?: string;
  onRefine?: (question: string) => void;
  onRerun?: (newSql: string, newQuestion: string) => void;
  threadId?: string;
  onNewQuestion?: () => void;
}

export function InsightResults({
  result,
  customerId,
}: InsightResultsProps) {
  return <ResultBlock result={result} customerId={customerId} />;
}

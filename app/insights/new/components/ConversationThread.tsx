"use client";

import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThinkingStream } from "./ThinkingStream";
import { ResultBlock } from "./ResultBlock";
import { ConversationPanel } from "./ConversationPanel";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface ConversationThreadProps {
  initialQuestion: string;
  initialResult: InsightResult;
  customerId: string;
  modelId?: string;
  threadId?: string;
  onNewQuestion?: () => void;
}

export function ConversationThread({
  initialQuestion,
  initialResult,
  customerId,
  modelId,
  threadId,
  onNewQuestion,
}: ConversationThreadProps) {
  return (
    <div className="space-y-6">
      {/* User: initial question */}
      <div className="flex justify-end">
        <div className="max-w-2xl">
          <div className="bg-blue-600 text-white rounded-2xl px-4 py-3">
            <p className="whitespace-pre-wrap">{initialQuestion}</p>
          </div>
        </div>
      </div>

      {/* Assistant: ThinkingStream (collapsed) + ResultBlock */}
      <div className="space-y-4">
        <ThinkingStream
          steps={initialResult.thinking}
          collapsed={true}
          title="How I answered this"
          allowCollapse={true}
        />
        <ResultBlock
          result={initialResult}
          customerId={customerId}
        />
      </div>

      {/* Follow-up conversation */}
      <ConversationPanel
        customerId={customerId}
        modelId={modelId}
        initialThreadId={threadId}
        initialResult={initialResult}
      />

      {/* New Question button */}
      {onNewQuestion && (
        <div className="pt-6 border-t border-slate-200">
          <Button onClick={onNewQuestion} variant="outline" className="w-full">
            <MessageSquare className="h-4 w-4 mr-2" />
            Start a New Question
          </Button>
        </div>
      )}
    </div>
  );
}

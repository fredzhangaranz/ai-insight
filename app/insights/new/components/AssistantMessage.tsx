"use client";

import { formatDistanceToNow } from "date-fns";
import { ThinkingStream } from "./ThinkingStream";
import { ResultsTable } from "./ResultsTable";
import { MessageActions } from "./MessageActions";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface AssistantMessageProps {
  message: {
    id: string;
    content: string;
    result?: InsightResult;
    createdAt: Date | string;
    isLoading?: boolean;
  };
  customerId: string;
  showActions?: boolean;
}

export function AssistantMessage({
  message,
  customerId,
  showActions = true,
}: AssistantMessageProps) {
  return (
    <div className="flex justify-start mb-6">
      <div className="max-w-3xl w-full">
        <div className="bg-white border rounded-2xl shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-semibold">
              AI
            </div>
            <div className="flex-1">
              <p className="text-gray-800">{message.content}</p>
              <span className="text-xs text-gray-400 mt-1 block">
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>

          {message.isLoading && message.result?.thinking && (
            <div className="mt-4">
              <ThinkingStream steps={message.result.thinking} />
            </div>
          )}

          {message.result && !message.isLoading && message.result.results && (
            <div className="mt-4">
              <ResultsTable
                columns={message.result.results.columns}
                rows={message.result.results.rows}
                maxRows={10}
              />
            </div>
          )}

          {showActions && message.result && !message.isLoading && (
            <div className="mt-4 pt-4 border-t">
              <MessageActions
                result={message.result}
                customerId={customerId}
                messageId={message.id}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

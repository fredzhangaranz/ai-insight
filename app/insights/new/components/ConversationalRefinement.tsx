// app/insights/new/components/ConversationalRefinement.tsx
// Conversational Refinement Component for Phase 7C Task 11
// Allows users to refine queries through natural language conversation

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Sparkles } from "lucide-react";
import { InsightResult } from "@/lib/hooks/useInsights";

interface RefinementMessage {
  role: "user" | "assistant";
  content: string;
  sqlDiff?: {
    before: string;
    after: string;
    explanation: string;
  };
  timestamp: Date;
}

interface ConversationalRefinementProps {
  result: InsightResult;
  customerId: string;
  onRerun: (newSql: string, newQuestion: string) => void;
  initialInput?: string;
}

export function ConversationalRefinement({
  result,
  customerId,
  onRerun,
  initialInput,
}: ConversationalRefinementProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [latestSql, setLatestSql] = useState(result.sql);

  // Handle pre-filled input from Inspection Panel's "Challenge" button
  useEffect(() => {
    if (initialInput && initialInput.trim()) {
      setInput(initialInput);
      setIsOpen(true);
    }
  }, [initialInput]);

  const handleRefine = async () => {
    if (!input.trim() || isRefining) return;

    const userMessage: RefinementMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsRefining(true);

    try {
      const response = await fetch("/api/insights/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          question: result.question,
          currentSql: latestSql,
          refinementRequest: userMessage.content,
          context: result.context,
        }),
      });

      if (!response.ok) {
        throw new Error("Refinement failed");
      }

      const data = await response.json();

      const assistantMessage: RefinementMessage = {
        role: "assistant",
        content: data.explanation || "I've updated the query based on your request.",
        sqlDiff: data.sqlChanged
          ? {
              before: latestSql,
              after: data.newSql,
              explanation: data.changeExplanation || "Modified the query as requested",
            }
          : undefined,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.newSql) {
        setLatestSql(data.newSql);
      }
    } catch (error) {
      const errorMessage: RefinementMessage = {
        role: "assistant",
        content: "Sorry, I couldn't process that refinement. Please try rephrasing your request.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsRefining(false);
    }
  };

  const handleQuickAction = (action: string) => {
    setInput(action);
  };

  const handleRerunQuery = () => {
    onRerun(latestSql, result.question || "");
    setIsOpen(false);
  };

  const quickActions = [
    "Include inactive records too",
    "Change to last 6 months",
    "Add more columns to the results",
    "Explain what you found",
    "Show only top 10 results",
  ];

  if (!isOpen) {
    return (
      <div className="mt-4">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Refine this query
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-blue-900">Refine this query</h3>
        </div>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="sm"
        >
          Close
        </Button>
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="space-y-2">
          <p className="text-sm text-blue-700">Quick actions:</p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action, i) => (
              <Button
                key={i}
                onClick={() => handleQuickAction(action)}
                variant="outline"
                size="sm"
                className="text-xs bg-white hover:bg-blue-100"
              >
                {action}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation History */}
      {messages.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {messages.map((message, i) => (
            <MessageBubble key={i} message={message} />
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me to adjust this query... (e.g., 'Include inactive patients too')"
          disabled={isRefining}
          className="min-h-[80px] bg-white"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleRefine();
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-blue-600">
            Press Ctrl+Enter to send
          </span>
          <div className="flex gap-2">
            {latestSql !== result.sql && (
              <Button
                onClick={handleRerunQuery}
                size="sm"
                variant="default"
              >
                Re-run Query
              </Button>
            )}
            <Button
              onClick={handleRefine}
              disabled={!input.trim() || isRefining}
              size="sm"
            >
              {isRefining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refining...
                </>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: RefinementMessage }) {
  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          message.role === "user"
            ? "bg-blue-600 text-white"
            : "bg-white border border-blue-200"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* SQL Diff Display */}
        {message.sqlDiff && (
          <div className="mt-3 pt-3 border-t border-blue-100 space-y-2">
            <p className="text-xs font-medium text-blue-900">
              {message.sqlDiff.explanation}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="font-medium text-red-700 mb-1">Before:</p>
                <pre className="bg-red-50 p-2 rounded text-red-900 overflow-x-auto">
                  {message.sqlDiff.before}
                </pre>
              </div>
              <div>
                <p className="font-medium text-green-700 mb-1">After:</p>
                <pre className="bg-green-50 p-2 rounded text-green-900 overflow-x-auto">
                  {message.sqlDiff.after}
                </pre>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs opacity-70 mt-2">
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

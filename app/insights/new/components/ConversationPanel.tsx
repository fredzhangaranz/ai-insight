"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { useConversation } from "@/lib/hooks/useConversation";
import { ConversationInput } from "./ConversationInput";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { SmartSuggestions } from "./SmartSuggestions";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface ConversationPanelProps {
  customerId: string;
  modelId?: string;
  initialThreadId?: string; // From first question, to continue in same thread
  initialResult?: InsightResult; // From initial question, for suggestions
}

export function ConversationPanel({
  customerId,
  modelId,
  initialThreadId,
  initialResult,
}: ConversationPanelProps) {
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastAssistantIdRef = useRef<string | null>(null);
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    editMessage,
    startNewConversation,
  } = useConversation();

  // Set initial threadId if provided (from first question)
  useEffect(() => {
    if (initialThreadId && typeof window !== "undefined") {
      // Restore the threadId to localStorage so useConversation can use it
      localStorage.setItem("conversation_threadId", initialThreadId);
      if (process.env.NODE_ENV === "development") {
        console.log(
          `[ConversationPanel] Set initial threadId from first question: ${initialThreadId}`
        );
      }
    }
  }, [initialThreadId]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }

    await sendMessage(trimmed, customerId, modelId);
    setInput("");
  };

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    [messages]
  );
  const firstAssistantId = useMemo(
    () => sortedMessages.find((message) => message.role === "assistant")?.id,
    [sortedMessages]
  );
  const hasPriorAssistant = useMemo(
    () => sortedMessages.some((message) => message.role === "assistant" && !message.isLoading),
    [sortedMessages]
  );
  const assistantMessageCount = useMemo(
    () => sortedMessages.filter((message) => message.role === "assistant" && !message.isLoading).length,
    [sortedMessages]
  );
  const lastAssistantMessage = useMemo(
    () => [...sortedMessages].reverse().find((message) => message.role === "assistant"),
    [sortedMessages]
  );
  const lastAssistantId = lastAssistantMessage?.id ?? null;
  const lastAssistantWithResult = useMemo(
    () =>
      [...sortedMessages].reverse().find(
        (message) =>
          message.role === "assistant" && !message.isLoading && message.result
      ),
    [sortedMessages]
  );
  const suggestionResult = lastAssistantWithResult?.result ?? initialResult;
  const showRefinements = Boolean(lastAssistantWithResult);
  const statusText = hasPriorAssistant
    ? "AI is analyzing your follow-up question..."
    : "AI is composing your insights...";

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      shouldAutoScrollRef.current = distanceFromBottom < 120;
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [sortedMessages.length]);

  useEffect(() => {
    if (!lastAssistantId || lastAssistantIdRef.current === lastAssistantId) {
      return;
    }

    lastAssistantIdRef.current = lastAssistantId;

    if (!shouldAutoScrollRef.current || assistantMessageCount <= 1) {
      return;
    }

    if (typeof document === "undefined") {
      return;
    }

    const target = document.getElementById(`message-${lastAssistantId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [assistantMessageCount, lastAssistantId]);

  return (
    <div className="mt-6 rounded-lg border bg-white p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-800">
            Conversation
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={startNewConversation}
          className="text-slate-600"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          New
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {sortedMessages.length > 0 ? (
        <div
          ref={scrollContainerRef}
          className="space-y-3 max-h-96 overflow-y-auto"
        >
          {sortedMessages.map((message, index) => {
            const showDivider =
              message.role === "user" && index > 0;
            return (
              <div key={message.id}>
                {showDivider && (
                  <div className="my-4 border-t border-slate-100" />
                )}
                {message.role === "user" ? (
                  <UserMessage
                    message={{
                      id: message.id,
                      content: message.content,
                      createdAt: message.createdAt,
                    }}
                    onEdit={editMessage}
                  />
                ) : (
                  <AssistantMessage
                    message={{
                      id: message.id,
                      content: message.content,
                      createdAt: message.createdAt,
                      result: message.result,
                      isLoading: message.isLoading,
                      metadata: message.metadata,
                    }}
                    customerId={customerId}
                    isFollowUp={Boolean(
                      firstAssistantId && message.id !== firstAssistantId
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          Ask a follow-up question to start a conversation.
        </div>
      )}

      {suggestionResult && !isLoading && (
        <SmartSuggestions
          result={suggestionResult}
          showRefinements={showRefinements}
          onSuggestionClick={(text) => setInput(text)}
        />
      )}

      {isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>
            {statusText} This might take a moment.
          </span>
        </div>
      )}

      <ConversationInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={isLoading}
        disabledReason={isLoading ? "loading" : undefined}
        placeholder="Ask a follow-up question..."
      />
    </div>
  );
}

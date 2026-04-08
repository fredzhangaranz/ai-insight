// app/insights/new/page.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import React from "react";
import { NewLayout } from "./components/NewLayout";
import { useInsights } from "@/lib/hooks/useInsights";
import { useSetQueryHistorySidebar } from "@/lib/context/QueryHistorySidebarContext";
import type { ConversationMessage } from "@/lib/types/conversation";

export default function NewInsightPage() {
  const [customerId, setCustomerId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [modelId, setModelId] = useState<string>("");
  const [conversationThreadId, setConversationThreadId] = useState<
    string | undefined
  >();
  /** DB id for the first user message in the thread (edit/re-run); avoids synthetic `first-user` PATCH 404. */
  const [firstThreadUserMessageId, setFirstThreadUserMessageId] = useState<
    string | undefined
  >();
  const [isQuestionSubmitted, setIsQuestionSubmitted] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  /** Full thread from GET /conversation/:id when opening query history (avoids a second fetch that races). */
  const [historyThreadSnapshot, setHistoryThreadSnapshot] = useState<{
    threadId: string;
    messages: ConversationMessage[];
  } | null>(null);

  // ModelSelector is rendered inside a Radix Popover; content is not mounted while closed,
  // so its fetch/onChange never runs and modelId stays "". The orchestrator then falls back
  // to a hardcoded Claude id (Anthropic). Resolve the server default here on first load.
  useEffect(() => {
    let cancelled = false;
    async function initDefaultModel() {
      try {
        const response = await fetch("/api/insights/models");
        if (!response.ok) return;
        const data = await response.json();
        if (cancelled || !data.models?.length) return;
        setModelId((prev) => {
          const stillValid = data.models.some(
            (m: { id: string }) => m.id === prev,
          );
          if (prev && stillValid) return prev;
          return data.defaultModelId ?? data.models[0]?.id ?? "";
        });
      } catch {
        /* best-effort */
      }
    }
    initDefaultModel();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    result,
    isLoading,
    ask,
    askWithClarifications,
    analysis,
    loadCachedResult,
    reset,
  } = useInsights();

  const handleAsk = async () => {
    if (!customerId || !question.trim()) return;
    setIsQuestionSubmitted(true);
    await ask(question, customerId, modelId);
  };

  const handleNewQuestion = () => {
    setQuestion("");
    setIsQuestionSubmitted(false);
    setConversationThreadId(undefined);
    setFirstThreadUserMessageId(undefined);
    setHistoryThreadSnapshot(null);
    reset();
  };

  // Auto-create conversation thread when we get a result from the first question
  React.useEffect(() => {
    // Query-history replay can set a valid thread id before loading cached result.
    // Do not create a new thread in that case, or follow-up messages disappear.
    if (conversationThreadId) return;

    if (
      result &&
      result.sql &&
      result.mode !== "clarification" &&
      !result.error
    ) {
      const queryHistoryId =
        typeof result.queryHistoryId === "number" &&
        Number.isFinite(result.queryHistoryId)
          ? result.queryHistoryId
          : null;
      if (queryHistoryId === null) {
        return;
      }

      const createConversationThread = async () => {
        try {
          const response = await fetch(
            "/api/insights/conversation/thread/create",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerId,
                initialQuestion: result.question,
                initialSql: result.sql,
                initialResult: result.results,
                queryHistoryId,
              }),
            },
          );

          if (response.ok) {
            const data = await response.json();
            const threadId = data.threadId;
            setConversationThreadId(threadId);
            if (typeof data.userMessageId === "string") {
              setFirstThreadUserMessageId(data.userMessageId);
            }
            if (typeof window !== "undefined") {
              localStorage.setItem("conversation_threadId", threadId);
            }
            if (process.env.NODE_ENV === "development") {
              console.log(
                `[NewInsightPage] Created conversation thread for follow-ups: ${threadId}`,
              );
            }
          }
        } catch (err) {
          console.warn("Failed to create conversation thread:", err);
          // This is not critical - follow-ups will still work with a new thread
        }
      };

      createConversationThread();
    }
  }, [result, customerId, conversationThreadId]);

  // Refetch query history when a new result arrives (after Ask or load from history).
  React.useEffect(() => {
    if (result) setHistoryRefreshKey((k) => k + 1);
  }, [result]);

  const handleClarificationSubmit = async (
    clarifications: Record<string, string>,
    clarificationAuditIds?: number[],
  ) => {
    if (!customerId || !result?.question) return;
    await askWithClarifications(
      result.question,
      customerId,
      clarifications,
      modelId,
      clarificationAuditIds,
    );
  };

  const handleRerun = async (newSql: string, newQuestion: string) => {
    // Re-run the query with the refined SQL
    // For now, we re-execute the original ask with the new question
    // TODO: In the future, we can add a direct SQL execution endpoint
    setQuestion(newQuestion);
    await ask(newQuestion, customerId, modelId);
  };

  const handleHistorySelect = useCallback(async (query: any) => {
    // NewLayout's unified thread renders the first user+assistant turn only
    // when `isQuestionSubmitted` is true.
    setIsQuestionSubmitted(true);
    setQuestion(query.question);

    // Reset active thread context before loading a selected history item so we
    // never render stale messages from a previously opened thread.
    setFirstThreadUserMessageId(undefined);
    setHistoryThreadSnapshot(null);
    setConversationThreadId(undefined);

    // Load thread messages once, then set thread id + snapshot in the same tick so the layout
    // hydrates from this payload instead of firing a second GET that can race and clear UI.
    if (query.conversationThreadId) {
      try {
        const res = await fetch(
          `/api/insights/conversation/${query.conversationThreadId}`,
        );
        if (res.ok) {
          const data = await res.json();
          const msgs = (data.messages ?? []) as ConversationMessage[];
          const firstUser = msgs.find((m) => m.role === "user");
          setFirstThreadUserMessageId(firstUser?.id);
          setHistoryThreadSnapshot({
            threadId: query.conversationThreadId,
            messages: msgs,
          });
          setConversationThreadId(query.conversationThreadId);
        } else {
          setConversationThreadId(undefined);
        }
      } catch {
        setConversationThreadId(undefined);
      }
    }

    // Load cached result from history instead of re-executing
    if (query.mode === "error") {
      // For failed queries, reconstruct the error result so user can see what went wrong
      const errorMessage =
        query.semanticContext?.error || "Query execution failed";

      // Create a minimal error result with thinking steps
      const errorResult = {
        mode: "direct" as const,
        question: query.question,
        thinking: [
          {
            id: "load_from_history",
            status: "complete" as const,
            message: "Loaded failed query from history",
            duration: 50,
          },
          {
            id: "previous_error",
            status: "error" as const,
            message: errorMessage,
            duration: 0,
          },
        ],
        error: {
          message: errorMessage,
          step: "history",
          details: query.semanticContext,
        },
      };

      loadCachedResult(errorResult);
      return;
    }

    if (!query.id) {
      // No cached data, just copy the question
      return;
    }

    // Re-execute the cached SQL to get fresh results
    try {
      const response = await fetch("/api/insights/execute-cached", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryId: query.id,
          customerId,
          // Backward-compat fallback payload fields
          sql: query.sql,
          question: query.question,
          mode: query.mode,
          semanticContext: query.semanticContext,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const replayErrorResult = {
          mode: "direct" as const,
          question: query.question,
          thinking: [
            {
              id: "load_from_history",
              status: "complete" as const,
              message: "Attempted to load cached result",
              duration: 50,
            },
            {
              id: "history_replay_error",
              status: "error" as const,
              message:
                errorData?.error ||
                "Unable to replay cached query from history",
              duration: 0,
            },
          ],
          error: {
            message:
              errorData?.error ||
              "Unable to replay cached query from history",
            step: "history_replay",
            details: errorData,
          },
        };
        loadCachedResult(replayErrorResult as any);
        return;
      }

      const cachedResult = await response.json();
      loadCachedResult(cachedResult);
    } catch (err) {
      console.error("Failed to load cached result:", err);
      const replayErrorResult = {
        mode: "direct" as const,
        question: query.question,
        thinking: [
          {
            id: "load_from_history",
            status: "complete" as const,
            message: "Attempted to load cached result",
            duration: 50,
          },
          {
            id: "history_replay_error",
            status: "error" as const,
            message: err instanceof Error ? err.message : "History replay failed",
            duration: 0,
          },
        ],
        error: {
          message: err instanceof Error ? err.message : "History replay failed",
          step: "history_replay",
        },
      };
      loadCachedResult(replayErrorResult as any);
    }
  }, [customerId, loadCachedResult]);

  useSetQueryHistorySidebar(
    customerId
      ? {
          customerId,
          onSelect: handleHistorySelect,
          refreshTrigger: historyRefreshKey,
        }
      : null,
  );

  const handleAskWithQuestion = async (q: string) => {
    if (!customerId || !q.trim()) return;
    setQuestion(q);
    setIsQuestionSubmitted(true);
    await ask(q, customerId, modelId);
  };

  const onHistoryThreadSnapshotConsumed = useCallback(() => {
    setHistoryThreadSnapshot(null);
  }, []);

  const newProps = {
    customerId,
    setCustomerId,
    modelId,
    setModelId,
    question,
    setQuestion,
    conversationThreadId,
    firstThreadUserMessageId,
    historyThreadSnapshot,
    onHistoryThreadSnapshotConsumed,
    handleNewQuestion,
    handleHistorySelect,
    result,
    isLoading,
    isQuestionSubmitted,
    handleAsk: handleAskWithQuestion,
    handleClarificationSubmit,
    analysis,
  };

  return <NewLayout {...newProps} />;
}

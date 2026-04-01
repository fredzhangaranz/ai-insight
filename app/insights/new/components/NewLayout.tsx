"use client";

import React, {
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { CustomerSelector } from "./CustomerSelector";
import { ModelSelector } from "./ModelSelector";
import { SuggestedQuestions } from "./SuggestedQuestions";
import { UnifiedThread, type ThreadItem } from "./UnifiedThread";
import {
  FixedBottomComposer,
  type ComposerState,
} from "./FixedBottomComposer";
import { SmartSuggestions } from "./SmartSuggestions";
import { useConversation } from "@/lib/hooks/useConversation";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { ConversationMessage } from "@/lib/types/conversation";
import type { CustomersMeta } from "./CustomerSelector";

function normalizeThreadQuestion(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface NewLayoutProps {
  customerId: string;
  setCustomerId: Dispatch<SetStateAction<string>>;
  modelId: string;
  setModelId: Dispatch<SetStateAction<string>>;
  question: string;
  setQuestion: Dispatch<SetStateAction<string>>;
  conversationThreadId: string | undefined;
  /** Real DB id for first user message when thread exists (from thread/create or history). */
  firstThreadUserMessageId: string | undefined;
  /** When set with conversationThreadId, hydrates useConversation from this GET payload (query history). */
  historyThreadSnapshot: { threadId: string; messages: ConversationMessage[] } | null;
  onHistoryThreadSnapshotConsumed: () => void;
  handleNewQuestion: () => void;
  handleHistorySelect: (query: any) => Promise<void>;
  // First question flow (from useInsights)
  result: InsightResult | null;
  isLoading: boolean;
  isQuestionSubmitted: boolean;
  handleAsk: (question: string) => Promise<void>;
  handleClarificationSubmit: (
    clarifications: Record<string, string>,
    clarificationAuditIds?: number[],
  ) => Promise<void>;
  analysis: { steps: Array<{ id: string; message: string; status?: string }> };
}

export function NewLayout({
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
  handleAsk,
  handleClarificationSubmit,
  analysis,
}: NewLayoutProps) {
  const {
    messages: conversationMessages,
    isLoading: isConversationLoading,
    sendMessage,
    sendMessageWithClarifications,
    editMessage,
    startNewConversation,
    loadConversation,
    hydrateThread,
  } = useConversation({
    externalThreadId: conversationThreadId ?? undefined,
    externalCustomerId: customerId || undefined,
  });

  const hydratedFromHistoryThreadRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationThreadId && typeof window !== "undefined") {
      localStorage.setItem("conversation_threadId", conversationThreadId);
    }
  }, [conversationThreadId]);

  // Query history: one GET in page.tsx supplies messages — hydrate here and skip a second fetch.
  // Thread/create: no snapshot — load from API once.
  useEffect(() => {
    if (!conversationThreadId) {
      hydratedFromHistoryThreadRef.current = null;
      return;
    }

    if (
      historyThreadSnapshot &&
      historyThreadSnapshot.threadId === conversationThreadId
    ) {
      hydrateThread(conversationThreadId, historyThreadSnapshot.messages);
      hydratedFromHistoryThreadRef.current = conversationThreadId;
      onHistoryThreadSnapshotConsumed();
      return;
    }

    if (hydratedFromHistoryThreadRef.current === conversationThreadId) {
      return;
    }

    void loadConversation(conversationThreadId);
  }, [
    conversationThreadId,
    historyThreadSnapshot,
    hydrateThread,
    loadConversation,
    onHistoryThreadSnapshotConsumed,
  ]);

  const threadItems = useMemo((): ThreadItem[] => {
    const baseTime = Date.now();

    const followUpItems: ThreadItem[] = conversationMessages.map((msg) => {
      if (msg.role === "user") {
        return {
          id: msg.id,
          type: "user_message" as const,
          content: msg.content,
          createdAt: msg.createdAt,
        };
      }
      if (msg.isLoading) {
        return {
          id: msg.id,
          type: "assistant_loading" as const,
          thinking: msg.result?.thinking?.map((t) => ({
            id: t.id,
            message: t.message,
            status: t.status,
          })),
          createdAt: msg.createdAt,
        };
      }
      if (msg.result?.mode === "clarification" && msg.result.clarifications) {
        return {
          id: msg.id,
          type: "assistant_clarification" as const,
          question: msg.result.question ?? "",
          clarifications: msg.result.clarifications,
          result: msg.result,
          createdAt: msg.createdAt,
        };
      }
      if (msg.result?.error) {
        return {
          id: msg.id,
          type: "assistant_error" as const,
          error: msg.result.error,
          thinking: msg.result.thinking?.map((t) => ({
            id: t.id,
            message: t.message,
            status: t.status,
          })),
          createdAt: msg.createdAt,
        };
      }
      return {
        id: msg.id,
        type: "assistant_result" as const,
        result: msg.result!,
        metadata: msg.metadata,
        createdAt: msg.createdAt,
      };
    });

    const firstUserMsg = conversationMessages.find((m) => m.role === "user");
    const firstUserLabelForMatch =
      firstUserMsg &&
      (typeof firstUserMsg.metadata?.originalQuestion === "string"
        ? firstUserMsg.metadata.originalQuestion
        : firstUserMsg.content);

    // After Save & Re-run, PATCH inserts a real user row into the hook; avoid two identical bubbles.
    const duplicateFirstUser =
      isQuestionSubmitted &&
      question.trim() &&
      followUpItems[0]?.type === "user_message" &&
      firstUserMsg &&
      normalizeThreadQuestion(firstUserLabelForMatch || "") ===
        normalizeThreadQuestion(question)
        ? followUpItems[0]
        : null;

    const tailFollowUps = duplicateFirstUser
      ? followUpItems.slice(1)
      : followUpItems;

    const items: ThreadItem[] = [];

    // When the first user row exists in useConversation (e.g. after Save & Re-run), assistant UI must
    // come from the hook — not stale useInsights `result` (e.g. history error) shown in parallel.
    const hookOwnsFirstUserRow = duplicateFirstUser !== null;

    if (isQuestionSubmitted && question.trim()) {
      items.push({
        id:
          duplicateFirstUser?.id ??
          firstThreadUserMessageId ??
          "first-user",
        type: "user_message",
        content: question,
        createdAt: new Date(baseTime),
      });

      if (!hookOwnsFirstUserRow) {
        if (isLoading && !result) {
          items.push({
            id: "first-assistant-loading",
            type: "assistant_loading",
            thinking: analysis.steps.map((s) => ({
              id: s.id,
              message: s.message,
              status: s.status,
            })),
            createdAt: new Date(baseTime + 1),
          });
        } else if (result) {
          if (result.mode === "clarification" && result.clarifications) {
            items.push({
              id: "first-assistant-clarification",
              type: "assistant_clarification",
              question: result.question ?? question,
              clarifications: result.clarifications,
              result,
              createdAt: new Date(baseTime + 1),
            });
          } else if (result.error) {
            items.push({
              id: "first-assistant-error",
              type: "assistant_error",
              error: result.error,
              thinking: result.thinking?.map((t) => ({
                id: t.id,
                message: t.message,
                status: t.status,
              })),
              createdAt: new Date(baseTime + 1),
            });
          } else {
            items.push({
              id: "first-assistant-result",
              type: "assistant_result",
              result,
              createdAt: new Date(baseTime + 1),
            });
          }
        }
      } else if (isConversationLoading && tailFollowUps.length === 0) {
        items.push({
          id: "first-assistant-loading",
          type: "assistant_loading",
          thinking: [],
          createdAt: new Date(baseTime + 1),
        });
      }
    }

    return [...items, ...tailFollowUps];
  }, [
    isQuestionSubmitted,
    question,
    isLoading,
    isConversationLoading,
    result,
    analysis.steps,
    conversationMessages,
    firstThreadUserMessageId,
  ]);

  const isFirstQuestion = !result && !conversationMessages.length;
  const isWaitingForResponse = isLoading || isConversationLoading;
  const hasBlockingClarification =
    result?.mode === "clarification" && result.clarifications;

  const composerState: ComposerState = !customerId
    ? "disabled_no_customer"
    : hasBlockingClarification
      ? "blocked_by_clarification"
      : isWaitingForResponse
        ? "waiting_for_response"
        : "ready";

  const lastClarificationId =
    threadItems.find((i) => i.type === "assistant_clarification")?.id ?? null;

  const lastAssistantResult = useMemo(() => {
    const found = [...threadItems].reverse().find(
      (i) => i.type === "assistant_result" || i.type === "assistant_clarification"
    );
    if (found?.type === "assistant_result") return found.result;
    if (found?.type === "assistant_clarification") return found.result;
    return undefined;
  }, [threadItems]);

  const [composerDraft, setComposerDraft] = React.useState("");
  const [customersMeta, setCustomersMeta] = React.useState<CustomersMeta>({
    loading: true,
    count: 0,
  });

  // CustomerSelector now lives inside a popover (not mounted by default), but we still
  // need the "auto-select the only active customer" behavior on initial page load.
  useEffect(() => {
    let cancelled = false;

    async function preloadCustomers() {
      try {
        const response = await fetch("/api/customers");
        const data = await response.json();
        const active = Array.isArray(data)
          ? data.filter((c: any) => c?.is_active)
          : [];

        if (cancelled) return;

        setCustomersMeta({ loading: false, count: active.length });

        if (active.length === 1 && !customerId) {
          setCustomerId(active[0].id);
        }
      } catch {
        if (cancelled) return;
        setCustomersMeta({ loading: false, count: 0 });
      }
    }

    preloadCustomers();
    return () => {
      cancelled = true;
    };
  }, [customerId, setCustomerId]);

  const handleCustomersMetaChange = useCallback((meta: CustomersMeta) => {
    setCustomersMeta(meta);
  }, []);

  const needsCustomerChoice =
    !customersMeta.loading && customersMeta.count > 1 && !customerId;

  const handleComposerSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !customerId) return;

    if (isFirstQuestion) {
      await handleAsk(trimmed);
    } else {
      await sendMessage(trimmed, customerId, modelId);
    }
  };

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const isFirstTurnUserMessage =
        messageId === "first-user" ||
        (firstThreadUserMessageId !== undefined &&
          messageId === firstThreadUserMessageId);

      if (isFirstTurnUserMessage) {
        setQuestion(trimmed);
      }

      // First turn is driven by useInsights until a thread user row exists; PATCH would 404 on synthetic id.
      if (messageId === "first-user") {
        await handleAsk(trimmed);
        return;
      }

      await editMessage(messageId, trimmed, modelId);
    },
    [editMessage, firstThreadUserMessageId, handleAsk, modelId, setQuestion],
  );

  const handleClarify = async (
    _messageId: string,
    responses: Record<string, string>,
  ) => {
    if (!customerId) return;

    // Follow-up clarifications come from `useConversation()`, so we should
    // continue the conversation via the conversation endpoint.
    const followUpMessage = conversationMessages.find((m) => m.id === _messageId);
    const followUpClarificationQuestion =
      followUpMessage?.result?.mode === "clarification"
        ? followUpMessage.result.question
        : undefined;

    if (followUpClarificationQuestion) {
      await sendMessageWithClarifications(
        followUpClarificationQuestion,
        customerId,
        responses,
        modelId
      );
      return;
    }

    // First-question clarifications are handled by the first-question flow.
    if (!result?.question) return;
    await handleClarificationSubmit(responses);
  };

  return (
    <div className="h-[100dvh] bg-slate-50 overflow-x-hidden overflow-hidden flex flex-col">
      <div className="w-full pl-3 pr-3 sm:pl-4 sm:pr-4 lg:pr-6 py-3 sm:py-4 overflow-x-hidden flex-shrink-0">
        <div className="mb-4">
          <div className="border-b border-slate-200 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pr-2">
                <nav className="flex text-sm text-slate-500 mb-2">
                  <Link href="/insights" className="hover:text-slate-700">
                    Insights
                  </Link>
                  <span className="mx-2">/</span>
                  <span className="text-slate-900 font-medium">Ask Question</span>
                </nav>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Insights
                </h1>
                <p className="text-slate-600 mt-2">
                  Ask questions about your wound data
                </p>
              </div>
              <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto sm:justify-start">
                <button
                  type="button"
                  onClick={() => {
                    startNewConversation();
                    handleNewQuestion();
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700"
                  title="Start a new question"
                >
                  <MessageSquare className="h-4 w-4" />
                  New Question
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 pl-3 pr-3 sm:pl-4 sm:pr-4 lg:pr-6">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col py-4">
          {needsCustomerChoice ? (
            <div className="flex flex-1 flex-col items-center justify-center min-h-[12rem] px-4">
              <p className="text-center text-slate-600">
                Please select a customer database before asking question
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 space-y-4">
              <UnifiedThread
                items={threadItems}
                customerId={customerId}
                onClarify={handleClarify}
                onEditMessage={handleEditMessage}
                isClarificationSubmitting={isLoading || isConversationLoading}
                lastClarificationMessageId={lastClarificationId}
              />

              {threadItems.length === 0 && customerId && (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-slate-600">
                    Ask anything about your patients
                  </p>
                </div>
              )}

              {lastAssistantResult && !isWaitingForResponse && (
                <div className="mb-4">
                  <SmartSuggestions
                    result={lastAssistantResult}
                    onSuggestionClick={(text) => setComposerDraft(text)}
                    showRefinements={true}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 sticky bottom-0 z-20 border-t border-slate-200 bg-white/90 backdrop-blur-sm shadow-sm -mx-3 sm:-mx-4 lg:-mr-6 px-3 sm:px-4 lg:pr-6 py-3">
          <FixedBottomComposer
            onSubmit={handleComposerSubmit}
            state={composerState}
            placeholder={
              isFirstQuestion
                ? "Ask a question about your wound care data…"
                : "Ask a follow-up question…"
            }
            customerId={customerId}
            showPills={threadItems.length === 0}
            onPillSelect={(q) => {
              setQuestion(q);
              setComposerDraft(q);
            }}
            draft={composerDraft}
            onDraftChange={setComposerDraft}
            settingsPanel={
              <>
                <CustomerSelector
                  value={customerId}
                  onChange={setCustomerId}
                  onCustomersMetaChange={handleCustomersMetaChange}
                />
                <ModelSelector value={modelId} onChange={setModelId} />
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { InsightResult } from "@/lib/hooks/useInsights";
import type { MessageMetadata } from "@/lib/types/conversation";

export type ThreadItemType =
  | "user_message"
  | "assistant_loading"
  | "assistant_result"
  | "assistant_clarification"
  | "assistant_error";

export interface ThreadItemBase {
  id: string;
  type: ThreadItemType;
}

export interface ThreadItemUser extends ThreadItemBase {
  type: "user_message";
  content: string;
  createdAt: Date | string;
}

export interface ThreadItemAssistantLoading extends ThreadItemBase {
  type: "assistant_loading";
  thinking?: Array<{ id: string; message: string; status?: string }>;
  createdAt: Date | string;
}

export interface ThreadItemAssistantResult extends ThreadItemBase {
  type: "assistant_result";
  result: InsightResult;
  metadata?: MessageMetadata;
  createdAt: Date | string;
}

export interface ThreadItemAssistantClarification extends ThreadItemBase {
  type: "assistant_clarification";
  question: string;
  clarifications: InsightResult["clarifications"];
  result: InsightResult;
  createdAt: Date | string;
}

export interface ThreadItemAssistantError extends ThreadItemBase {
  type: "assistant_error";
  error: { message: string; step?: string; details?: unknown };
  thinking?: Array<{ id: string; message: string; status?: string }>;
  createdAt: Date | string;
}

export type ThreadItem =
  | ThreadItemUser
  | ThreadItemAssistantLoading
  | ThreadItemAssistantResult
  | ThreadItemAssistantClarification
  | ThreadItemAssistantError;

interface UnifiedThreadProps {
  items: ThreadItem[];
  customerId: string;
  onClarify?: (messageId: string, responses: Record<string, string>) => void;
  onEditMessage?: (messageId: string, newContent: string) => Promise<void>;
  isClarificationSubmitting?: boolean;
  lastClarificationMessageId?: string | null;
}

export function UnifiedThread({
  items,
  customerId,
  onClarify,
  onEditMessage,
  isClarificationSubmitting,
  lastClarificationMessageId,
}: UnifiedThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (items.length === 0) return;
    const last = items[items.length - 1];
    const el = document.getElementById(`message-${last.id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [items.length, items[items.length - 1]?.id]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={scrollRef}
      className="space-y-4 py-4"
      data-testid="unified-thread"
    >
      {items.map((item) => {
        if (item.type === "user_message") {
          return (
            <div key={item.id} id={`message-${item.id}`}>
              <UserMessage
                message={{
                  id: item.id,
                  content: item.content,
                  createdAt: item.createdAt,
                }}
                onEdit={onEditMessage}
              />
            </div>
          );
        }

        if (item.type === "assistant_loading") {
          return (
            <div key={item.id} id={`message-${item.id}`}>
              <AssistantMessage
                message={{
                  id: item.id,
                  content: "",
                  createdAt: item.createdAt,
                  isLoading: true,
                  result: item.thinking
                    ? {
                        mode: "direct",
                        question: "",
                        thinking: item.thinking.map((t) => ({
                          id: t.id,
                          status: (t.status as "pending" | "running" | "complete" | "error") ?? "running",
                          message: t.message,
                        })),
                      }
                    : undefined,
                }}
                customerId={customerId}
                isFollowUp={false}
              />
            </div>
          );
        }

        if (item.type === "assistant_result") {
          const isFirstResult = item.id === "first-assistant-result";
          return (
            <div key={item.id} id={`message-${item.id}`}>
              <AssistantMessage
                message={{
                  id: item.id,
                  content: "",
                  result: item.result,
                  metadata: item.metadata,
                  createdAt: item.createdAt,
                  isLoading: false,
                }}
                customerId={customerId}
                isFollowUp={!isFirstResult}
              />
            </div>
          );
        }

        if (item.type === "assistant_clarification") {
          const isActive =
            lastClarificationMessageId === item.id && !isClarificationSubmitting;
          return (
            <div key={item.id} id={`message-${item.id}`}>
              <AssistantMessage
                message={{
                  id: item.id,
                  content: "",
                  result: item.result,
                  createdAt: item.createdAt,
                  isLoading: false,
                }}
                customerId={customerId}
                isFollowUp={false}
                onClarify={
                  isActive && onClarify
                    ? (responses) => onClarify(item.id, responses)
                    : undefined
                }
              />
            </div>
          );
        }

        if (item.type === "assistant_error") {
          return (
            <div key={item.id} id={`message-${item.id}`}>
              <AssistantMessage
                message={{
                  id: item.id,
                  content: "",
                  createdAt: item.createdAt,
                  isLoading: false,
                  result: {
                    mode: "direct",
                    question: "",
                    thinking: (item.thinking ?? []).map((t) => ({
                      id: t.id,
                      status: "error" as const,
                      message: t.message,
                    })),
                    error: {
                      message: item.error.message,
                      step: item.error.step ?? "error",
                      details: item.error.details,
                    },
                  },
                }}
                customerId={customerId}
                isFollowUp={false}
              />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

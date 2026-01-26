import { useCallback, useRef, useState } from "react";
import type { ConversationMessage } from "@/lib/types/conversation";

type ConversationMessageState = ConversationMessage & {
  isLoading?: boolean;
};

interface UseConversationReturn {
  threadId: string | null;
  messages: ConversationMessageState[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (
    question: string,
    customerId: string,
    modelId?: string
  ) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  startNewConversation: () => void;
  loadConversation: (threadId: string) => Promise<void>;
}

interface SendMessageOptions {
  userMessageId?: string;
  skipOptimistic?: boolean;
}

export function useConversation(): UseConversationReturn {
  // Initialize threadId from localStorage to survive component remounts
  const [threadId, setThreadId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("conversation_threadId");
      if (stored) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[useConversation] Restored threadId from localStorage: ${stored}`);
        }
        return stored;
      }
    }
    return null;
  });
  const [messages, setMessages] = useState<ConversationMessageState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessageInternal = useCallback(
    async (
      question: string,
      targetCustomerId: string,
      modelId?: string,
      options?: SendMessageOptions
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const trimmedQuestion = question.trim();
      const tempIdBase = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempUserId = options?.skipOptimistic ? null : `temp-user-${tempIdBase}`;
      const tempAssistantId = `temp-assistant-${tempIdBase}`;
      const createdAtBase = Date.now();
      const pendingUserMessage: ConversationMessageState | null = tempUserId
        ? {
            id: tempUserId,
            threadId: threadId || "",
            role: "user",
            content: trimmedQuestion,
            metadata: {},
            createdAt: new Date(createdAtBase),
          }
        : null;

      const pendingAssistantMessage: ConversationMessageState = {
        id: tempAssistantId,
        threadId: threadId || "",
        role: "assistant",
        content: "",
        metadata: {},
        createdAt: new Date(createdAtBase + 1),
        isLoading: true,
      };

      setMessages((prev) => {
        const next = [...prev];
        if (pendingUserMessage) {
          next.push(pendingUserMessage);
        }
        next.push(pendingAssistantMessage);
        return next;
      });

      setIsLoading(true);
      setError(null);
      setCustomerId(targetCustomerId);

      try {
        // 🔍 LOGGING: Check threadId before sending
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[useConversation] Sending message: threadId=${threadId || "null"}, ` +
            `will_send_to_api=${threadId ? "yes" : "no"}`
          );
        }

        const requestBody = {
          ...(threadId && { threadId }),
          customerId: targetCustomerId,
          question: trimmedQuestion,
          ...(modelId && { modelId }),
          ...(options?.userMessageId && { userMessageId: options.userMessageId }),
        };

        const response = await fetch("/api/insights/conversation/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to send message");
        }

        const data = await response.json();

        // 🔍 LOGGING: Check threadId after response
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[useConversation] Response received: returned_threadId=${data.threadId}, ` +
            `current_threadId=${threadId}, will_update=${!threadId ? "yes" : "no"}`
          );
        }

        if (!threadId) {
          const newThreadId = data.threadId;
          if (process.env.NODE_ENV === "development") {
            console.log(`[useConversation] ✅ Setting threadId to: ${newThreadId}`);
            console.log(`[useConversation] Persisting threadId to localStorage`);
          }
          // Persist to localStorage so it survives component remounts
          localStorage.setItem("conversation_threadId", newThreadId);
          setThreadId(newThreadId);
        }

        setMessages((prev) => {
          const withoutTemp = prev.filter(
            (msg) => msg.id !== tempUserId && msg.id !== tempAssistantId
          );
          const nextMessages = [...withoutTemp];

          if (pendingUserMessage) {
            nextMessages.push({
              ...pendingUserMessage,
              id: data.userMessageId,
              threadId: data.threadId,
            });
          }

          nextMessages.push({
            ...data.message,
            threadId: data.threadId,
          });

          // 🔍 LOGGING: Check updated message list
          if (process.env.NODE_ENV === "development") {
            console.log(
              `[useConversation] Updated messages: count=${nextMessages.length}, ` +
              `threadIds=${[...new Set(nextMessages.map(m => m.threadId))].join(",")}`
            );
          }

          return nextMessages;
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== tempUserId && msg.id !== tempAssistantId)
          );
          return;
        }

        const nextError = err instanceof Error ? err : new Error("Unknown error");
        setError(nextError);

        setMessages((prev) =>
          prev.filter((msg) => msg.id !== tempUserId && msg.id !== tempAssistantId)
        );
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [threadId]
  );

  const sendMessage = useCallback(
    async (question: string, targetCustomerId: string, modelId?: string) => {
      await sendMessageInternal(question, targetCustomerId, modelId);
    },
    [sendMessageInternal]
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/insights/conversation/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newContent }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || errorData.message || "Failed to edit message");
        }

        const data = await response.json();

        setMessages((prev) => {
          const deletedIds = new Set<string>(data.deletedMessageIds || []);
          const kept = prev.filter((msg) => !deletedIds.has(msg.id));
          return [...kept, data.newMessage];
        });

        if (data.requiresReexecution) {
          if (!customerId) {
            throw new Error("Customer ID is required to re-run the conversation");
          }

          await sendMessageInternal(newContent, customerId, undefined, {
            userMessageId: data.newMessage?.id,
            skipOptimistic: true,
          });
        }
      } catch (err) {
        const nextError = err instanceof Error ? err : new Error("Unknown error");
        setError(nextError);
      } finally {
        setIsLoading(false);
      }
    },
    [customerId, sendMessageInternal]
  );

  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    
    // Clear localStorage when starting new conversation
    if (typeof window !== "undefined") {
      localStorage.removeItem("conversation_threadId");
      if (process.env.NODE_ENV === "development") {
        console.log("[useConversation] Cleared threadId from localStorage (new conversation)");
      }
    }
    
    setThreadId(null);
    setMessages([]);
    setCustomerId(null);
    setError(null);
  }, []);

  const loadConversation = useCallback(async (loadThreadId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/insights/conversation/${loadThreadId}`);

      if (!response.ok) {
        throw new Error("Failed to load conversation");
      }

      const data = await response.json();

      setThreadId(data.thread.id);
      setCustomerId(data.thread.customerId);
      setMessages(data.messages || []);
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error("Unknown error");
      setError(nextError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    threadId,
    messages,
    isLoading,
    error,
    sendMessage,
    editMessage,
    startNewConversation,
    loadConversation,
  };
}

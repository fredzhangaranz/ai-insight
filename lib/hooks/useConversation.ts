import { useCallback, useRef, useState } from "react";
import type { ConversationMessage } from "@/lib/types/conversation";

interface UseConversationReturn {
  threadId: string | null;
  messages: ConversationMessage[];
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
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
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
      const tempId = options?.skipOptimistic ? null : `temp-${Date.now()}`;
      const pendingUserMessage: ConversationMessage | null = tempId
        ? {
            id: tempId,
            threadId: threadId || "",
            role: "user",
            content: trimmedQuestion,
            metadata: {},
            createdAt: new Date(),
          }
        : null;

      if (pendingUserMessage) {
        setMessages((prev) => [...prev, pendingUserMessage]);
      }

      setIsLoading(true);
      setError(null);
      setCustomerId(targetCustomerId);

      try {
        const response = await fetch("/api/insights/conversation/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(threadId && { threadId }),
            customerId: targetCustomerId,
            question: trimmedQuestion,
            ...(modelId && { modelId }),
            ...(options?.userMessageId && { userMessageId: options.userMessageId }),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to send message");
        }

        const data = await response.json();

        if (!threadId) {
          setThreadId(data.threadId);
        }

        setMessages((prev) => {
          const withoutTemp = tempId
            ? prev.filter((msg) => msg.id !== tempId)
            : prev;
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

          return nextMessages;
        });
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        const nextError = err instanceof Error ? err : new Error("Unknown error");
        setError(nextError);

        if (tempId) {
          setMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        }
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

"use client";

import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, RotateCcw } from "lucide-react";
import { useConversation } from "@/lib/hooks/useConversation";
import { ConversationInput } from "./ConversationInput";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";

interface ConversationPanelProps {
  customerId: string;
  modelId?: string;
  initialThreadId?: string; // From first question, to continue in same thread
}

export function ConversationPanel({
  customerId,
  modelId,
  initialThreadId,
}: ConversationPanelProps) {
  const [input, setInput] = useState("");
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
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {sortedMessages.map((message) =>
            message.role === "user" ? (
              <UserMessage
                key={message.id}
                message={{
                  id: message.id,
                  content: message.content,
                  createdAt: message.createdAt,
                }}
                onEdit={editMessage}
              />
            ) : (
              <AssistantMessage
                key={message.id}
                message={{
                  id: message.id,
                  content: message.content,
                  createdAt: message.createdAt,
                  result: message.result,
                }}
                customerId={customerId}
              />
            )
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          Ask a follow-up question to start a conversation.
        </div>
      )}

      <ConversationInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={isLoading}
        placeholder="Ask a follow-up question..."
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, RotateCcw } from "lucide-react";
import { useConversation } from "@/lib/hooks/useConversation";
import type { ConversationMessage, ResultSummary } from "@/lib/types/conversation";

interface ConversationPanelProps {
  customerId: string;
  modelId?: string;
}

export function ConversationPanel({
  customerId,
  modelId,
}: ConversationPanelProps) {
  const [input, setInput] = useState("");
  const {
    messages,
    isLoading,
    error,
    sendMessage,
    startNewConversation,
  } = useConversation();

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }

    await sendMessage(trimmed, customerId, modelId);
    setInput("");
  };

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

      {messages.length > 0 ? (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          Ask a follow-up question to start a conversation.
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a follow-up question..."
          className="min-h-[80px]"
          disabled={isLoading}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              handleSend();
            }
          }}
          autoComplete="off"
          data-form-type="other"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
        />
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Press Ctrl+Enter to send</span>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const summary = message.metadata?.resultSummary as ResultSummary | undefined;
  const timestamp = message.createdAt
    ? new Date(message.createdAt)
    : new Date();

  return (
    <div
      className={`flex ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          message.role === "user"
            ? "bg-slate-900 text-white"
            : "bg-slate-50 border border-slate-200 text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {summary && (
          <div className="mt-2 text-xs text-slate-500">
            Rows: {summary.rowCount}
            {summary.columns?.length
              ? ` • Columns: ${summary.columns.join(", ")}`
              : ""}
          </div>
        )}
        <div className="mt-2 text-[11px] opacity-70">
          {timestamp.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}

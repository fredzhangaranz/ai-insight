"use client";

import React from "react";
import { SuggestedQuestions } from "./SuggestedQuestions";

export type ComposerState =
  | "ready"
  | "disabled_no_customer"
  | "waiting_for_response"
  | "blocked_by_clarification";

interface FixedBottomComposerProps {
  onSubmit: (text: string) => Promise<void>;
  state: ComposerState;
  placeholder?: string;
  customerId: string;
  showPills: boolean;
  onPillSelect: (q: string) => void;
  /** Controlled draft - when set from parent (e.g. suggestion click), populates input. */
  draft?: string;
  onDraftChange?: (draft: string) => void;
}

export function FixedBottomComposer({
  onSubmit,
  state,
  placeholder = "Ask a question…",
  customerId,
  showPills,
  onPillSelect,
  draft: controlledDraft,
  onDraftChange,
}: FixedBottomComposerProps) {
  const [internalInput, setInternalInput] = React.useState("");
  const input =
    controlledDraft !== undefined ? controlledDraft : internalInput;
  const setInput =
    onDraftChange ?? setInternalInput;
  const disabled =
    state === "disabled_no_customer" ||
    state === "waiting_for_response" ||
    state === "blocked_by_clarification";

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    await onSubmit(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hintText =
    state === "waiting_for_response"
      ? "Waiting for response…"
      : state === "blocked_by_clarification"
        ? "Answer the clarification above"
        : "Ctrl+Enter to send";

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      {showPills && customerId && (
        <SuggestedQuestions customerId={customerId} onSelect={onPillSelect} />
      )}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-slate-500">{hintText}</p>
    </div>
  );
}

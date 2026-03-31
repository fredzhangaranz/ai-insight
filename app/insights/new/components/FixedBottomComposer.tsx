"use client";

import React from "react";
import { Settings } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  /** Shown in a popover next to the keyboard hint (e.g. customer + AI model). */
  settingsPanel?: React.ReactNode;
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
  settingsPanel,
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
      {settingsPanel ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{hintText}</p>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                title="Customer and AI model"
                aria-label="Open customer and AI model settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-[min(28rem,calc(100vw-2rem))] overflow-visible p-4"
            >
              <p className="mb-3 text-sm font-medium text-slate-900">
                Chat settings
              </p>
              <div className="space-y-4">{settingsPanel}</div>
            </PopoverContent>
          </Popover>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{hintText}</p>
      )}
    </div>
  );
}

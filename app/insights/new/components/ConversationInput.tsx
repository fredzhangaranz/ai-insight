"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";

interface ConversationInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ConversationInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Ask a question...",
}: ConversationInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }
    textareaRef.current.style.height = "auto";
    const newHeight = Math.min(textareaRef.current.scrollHeight, 300);
    textareaRef.current.style.height = `${newHeight}px`;
  }, [value]);

  useEffect(() => {
    if (!disabled && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!disabled && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[100px] max-h-[300px] pr-12 resize-none text-base border-2 focus:ring-2 focus:ring-blue-500 rounded-xl"
        rows={3}
        autoComplete="off"
        data-form-type="other"
        data-1p-ignore
        data-lpignore="true"
        spellCheck
      />

      <Button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        size="icon"
        className="absolute bottom-3 right-3 rounded-full h-10 w-10"
      >
        <Send className="h-4 w-4" />
      </Button>

      <p className="text-xs text-gray-500 mt-2">
        {disabled ? "Select a customer to get started" : "Press Ctrl+Enter to send"}
      </p>
    </div>
  );
}

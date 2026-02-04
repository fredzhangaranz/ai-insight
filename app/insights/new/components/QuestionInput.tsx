// app/insights/new/components/QuestionInput.tsx

"use client";

import { useRef, useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Check, X } from "lucide-react";

interface QuestionInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  submitted?: boolean; // Whether the question has been submitted
  onClearQuestion?: () => void; // Called when user wants to clear and start new
}

export function QuestionInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isLoading = false,
  placeholder = "Ask a question about your data...",
  submitted = false,
  onClearQuestion,
}: QuestionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValue, setEditedValue] = useState(value);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editedValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (!disabled && editedValue.trim()) {
        handleEditSubmit();
      }
    }
  };

  const handleEditSubmit = async () => {
    if (!editedValue.trim()) return;
    onChange(editedValue);
    setIsEditing(false);
    // Small delay to ensure state is updated before submit
    setTimeout(() => onSubmit(), 0);
  };

  const handleCancelEdit = () => {
    setEditedValue(value);
    setIsEditing(false);
  };

  // If question has been submitted, show read-only view with Edit button
  if (submitted && value && !isEditing) {
    return (
      <div className="space-y-3">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm text-slate-600 mb-2">Your question:</p>
              <p className="text-base text-slate-900 whitespace-pre-wrap">
                {value}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditedValue(value);
                setIsEditing(true);
              }}
              className="text-slate-600 hover:text-slate-900 flex-shrink-0"
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Click "Edit" to modify your question and run it again
        </p>
      </div>
    );
  }

  // If editing, show edit mode
  if (isEditing) {
    return (
      <div className="space-y-3">
        <div className="border-2 border-blue-300 rounded-lg p-4 bg-blue-50">
          <Textarea
            ref={textareaRef}
            value={editedValue}
            onChange={(e) => setEditedValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-h-[100px] max-h-[300px] resize-none mb-3"
            rows={3}
            autoComplete="off"
            data-form-type="other"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelEdit}
              disabled={isLoading}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleEditSubmit}
              disabled={isLoading || !editedValue.trim()}
            >
              <Check className="h-4 w-4 mr-1" />
              {isLoading ? "Analyzing..." : "Save & Re-run"}
            </Button>
          </div>
        </div>
        <p className="text-xs text-amber-600">
          ⚠️ This will discard the current results and run a new analysis
        </p>
      </div>
    );
  }

  // Default editable input state
  return (
    <div className="space-y-3">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[100px] max-h-[300px] resize-none pr-20"
          rows={3}
          autoComplete="off"
          data-form-type="other"
          data-1p-ignore
          data-lpignore="true"
          spellCheck={false}
        />

        <Button
          onClick={onSubmit}
          disabled={disabled || !value.trim() || isLoading}
          className="absolute bottom-3 right-3"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            "Ask →"
          )}
        </Button>
      </div>

      <p className="text-sm text-gray-500">
        {disabled
          ? "Select a customer to get started"
          : "Press Ctrl+Enter to submit"}
      </p>
    </div>
  );
}

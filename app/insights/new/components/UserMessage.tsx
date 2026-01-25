"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UserMessageProps {
  message: {
    id: string;
    content: string;
    createdAt: Date | string;
  };
  onEdit?: (messageId: string, newContent: string) => Promise<void>;
}

export function UserMessage({ message, onEdit }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveEdit = async () => {
    if (!onEdit || editedContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onEdit(message.id, editedContent);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save edit:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  return (
    <div className="flex justify-end mb-6">
      <div className="max-w-2xl">
        {isEditing ? (
          <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl p-4">
            <Textarea
              value={editedContent}
              onChange={(event) => setEditedContent(event.target.value)}
              className="min-h-[80px] mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={isSaving || !editedContent.trim()}
              >
                <Check className="h-4 w-4 mr-1" />
                {isSaving ? "Saving..." : "Save & Re-run"}
              </Button>
            </div>
            <p className="text-xs text-amber-600 mt-2">
              ⚠️ This will discard all messages after this one
            </p>
          </div>
        ) : (
          <div className="bg-blue-600 text-white rounded-2xl px-4 py-3">
            <p className="whitespace-pre-wrap">{message.content}</p>
            <div className="flex items-center gap-2 mt-2 text-xs text-blue-100">
              <span>
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                })}
              </span>
              {onEdit && (
                <>
                  <span>•</span>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="hover:text-white flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

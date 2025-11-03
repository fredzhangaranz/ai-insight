// app/insights/new/components/SaveInsightDialog.tsx

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InsightResult } from "@/lib/hooks/useInsights";

interface SaveInsightDialogProps {
  isOpen: boolean;
  onClose: () => void;
  result: InsightResult;
  customerId: string;
}

export function SaveInsightDialog({
  isOpen,
  onClose,
  result,
  customerId,
}: SaveInsightDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/insights/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          question: result.question,
          customerId,
          sql: result.sql,
          chartType: "table",
          chartMapping: {},
          scope: "semantic",
          tags: tags.trim() ? tags.split(",").map((t) => t.trim()) : [],
          semanticContext: result.context || null,
          description: description.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save insight");
      }

      // Success - close dialog and reset form
      setName("");
      setDescription("");
      setTags("");
      onClose();

      // Show success message (optional - could use a toast notification)
      alert("Insight saved successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save insight");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setName("");
      setDescription("");
      setTags("");
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Insight</DialogTitle>
          <DialogDescription>
            Save this query as a permanent insight that you can reference later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Question preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Question</Label>
            <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md border">
              {result.question}
            </div>
          </div>

          {/* Mode indicator */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Mode</Label>
            <div className="text-sm">
              {result.mode === "template" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  📋 Template: {result.template}
                </span>
              )}
              {result.mode === "direct" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  🔍 Direct Semantic
                </span>
              )}
              {result.mode === "funnel" && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  🔀 Auto-Funnel
                </span>
              )}
            </div>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Active Patient Count"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {/* Description input */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Add a description to help others understand this insight..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSaving}
              rows={3}
            />
          </div>

          {/* Tags input */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags (optional)</Label>
            <Input
              id="tags"
              placeholder="e.g., patients, reports, monthly (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={isSaving}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Insight"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

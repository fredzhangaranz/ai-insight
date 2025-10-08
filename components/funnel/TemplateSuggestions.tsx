"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TemplateListItem } from "@/lib/services/template.service";

export interface TemplateSuggestion {
  template: TemplateListItem;
  score: number;
  baseScore: number;
  matchedKeywords: string[];
  matchedExample?: string;
  successRate?: number;
}

interface TemplateSuggestionsProps {
  suggestions: TemplateSuggestion[];
  loading: boolean;
  error: string | null;
  onApply: (suggestion: TemplateSuggestion) => void;
}

export function TemplateSuggestions({
  suggestions,
  loading,
  error,
  onApply,
}: TemplateSuggestionsProps) {
  if (loading) {
    return (
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>Fetching template suggestions…</p>
        <div className="flex gap-2">
          <span className="h-2 w-2 animate-ping rounded-full bg-muted-foreground" />
          <span className="h-2 w-2 animate-ping rounded-full bg-muted-foreground" />
          <span className="h-2 w-2 animate-ping rounded-full bg-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-red-600">Failed to load suggestions: {error}</p>
    );
  }

  if (!suggestions.length) {
    return (
      <p className="text-xs text-muted-foreground">
        No strong template matches yet. Try refining the question or executing the
        query to gather more context.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion) => {
        const { template } = suggestion;
        return (
          <div
            key={`${template.templateId ?? template.name}`}
            className="rounded border border-muted/60 bg-muted/10 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{template.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {template.intent && <Badge variant="outline">{template.intent}</Badge>}
                  {typeof suggestion.successRate === "number" && (
                    <span>{Math.round(suggestion.successRate * 100)}% success</span>
                  )}
                  <span>score {suggestion.score.toFixed(2)}</span>
                </div>
              </div>
              <Button size="sm" onClick={() => onApply(suggestion)}>
                Apply
              </Button>
            </div>
            {suggestion.matchedKeywords?.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Matched keywords: {suggestion.matchedKeywords.join(", ")}
              </p>
            )}
            {suggestion.matchedExample && (
              <p className="mt-1 text-[11px] text-muted-foreground italic">
                Example: {suggestion.matchedExample}
              </p>
            )}
            {template.description && (
              <p className="mt-2 text-xs text-muted-foreground">
                {template.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

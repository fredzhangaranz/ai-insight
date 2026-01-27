"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { generateSmartSuggestions } from "@/lib/services/suggestion-generator.service";
import { generateRefinements } from "@/lib/services/refinement-generator.service";
import type { SuggestionCategory } from "@/lib/types/conversation";
import type { InsightResult } from "@/lib/hooks/useInsights";

interface SmartSuggestionsProps {
  result?: InsightResult;
  onSuggestionClick: (text: string) => void;
  showRefinements?: boolean;
}

export function SmartSuggestions({
  result,
  onSuggestionClick,
  showRefinements = true,
}: SmartSuggestionsProps) {
  const suggestions = useMemo(
    () => generateSmartSuggestions(result),
    [result]
  );

  const refinements = useMemo(
    () => (showRefinements ? generateRefinements(result) : []),
    [result, showRefinements]
  );

  if (suggestions.length === 0 && refinements.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 my-6">
      {suggestions.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
            💡 You might want to ask:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <Button
                key={`${suggestion.text}-${index}`}
                variant="outline"
                size="sm"
                onClick={() => onSuggestionClick(suggestion.text)}
                className="text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <span className="mr-2">{getSuggestionIcon(suggestion.category)}</span>
                {suggestion.text}
              </Button>
            ))}
          </div>
        </div>
      )}

      {refinements.length > 0 && (
        <div>
          <p className="text-sm text-gray-600 mb-2 flex items-center gap-2">
            ✨ Or refine the current result:
          </p>
          <div className="flex flex-wrap gap-2">
            {refinements.map((refinement, index) => (
              <Button
                key={`${refinement}-${index}`}
                variant="ghost"
                size="sm"
                onClick={() => onSuggestionClick(refinement)}
                className="text-left hover:bg-gray-100 transition-colors"
              >
                {refinement}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getSuggestionIcon(category: SuggestionCategory) {
  switch (category) {
    case "drill_down":
      return "🔎";
    case "time_shift":
      return "⏱️";
    case "aggregation":
      return "📊";
    case "filter":
      return "🧰";
    case "follow_up":
    default:
      return "➡️";
  }
}

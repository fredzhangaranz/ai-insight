// app/insights/new/components/SuggestedQuestions.tsx

"use client";

import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";

interface SuggestedQuestionsProps {
  customerId: string;
  onSelect: (question: string) => void;
}

const defaultSuggestions = [
  "Which wounds are not healing as expected?",
  "Show wound healing trends over time.",
  "How many wound assessments were completed each month?",
  "Which pressure injuries were hospital-acquired?"
];

export function SuggestedQuestions({
  customerId,
  onSelect
}: SuggestedQuestionsProps) {
  if (!customerId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <Lightbulb className="h-4 w-4" />
        <span>Try asking:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {defaultSuggestions.map((suggestion, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            onClick={() => onSelect(suggestion)}
            className="text-sm"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

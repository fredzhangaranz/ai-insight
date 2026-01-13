/**
 * Execution Mode Selector Service (Phase 2: Simplified to 2 modes)
 * Determines the optimal execution strategy for SQL generation.
 */

import type { QueryIntent } from "../intent-classifier/intent-classifier.service";
import type { SnippetMatch } from "../semantic/template-matcher.service";

/**
 * Simplified execution mode: 2 options instead of 3
 * - "snippets": Use LLM with relevant snippets as building blocks (1-3s)
 * - "semantic": Use semantic LLM fallback without snippet constraints (3-8s)
 */
export type ExecutionMode = "snippets" | "semantic";

/**
 * Execution mode decision with reasoning.
 */
export interface ModeDecision {
  mode: ExecutionMode;
  snippets?: SnippetMatch[];
  reason: string;
}

/**
 * ExecutionModeSelector (Simplified)
 *
 * Two execution strategies:
 * 1. **Snippet-Guided** (1-3s) - When relevant snippets available
 *    - Uses LLM with snippets as building blocks
 *    - Requires: top snippet score > 0.6 AND placeholders resolved
 *    - More structured, faster than semantic-only
 *
 * 2. **Semantic Fallback** (3-8s) - When no good snippets
 *    - General-purpose LLM-based SQL generation
 *    - Full semantic context, no template constraints
 *    - Most flexible for complex queries
 */
export class ExecutionModeSelector {
  /**
   * Select execution mode based on snippet availability.
   * 
   * Simple decision logic:
   * IF snippets > 0 AND score > 0.6 AND placeholders resolved
   *   → Use snippets mode (structured)
   * ELSE
   *   → Use semantic fallback (flexible)
   */
  selectMode(options: {
    intent: QueryIntent;
    matchedSnippets: SnippetMatch[];
    placeholdersResolved: boolean;
  }): ModeDecision {
    const { intent, matchedSnippets, placeholdersResolved } = options;

    console.log(
      `[ExecutionModeSelector] 🤔 Selecting mode for intent "${intent}"`
    );
    console.log(`  - Snippets found: ${matchedSnippets.length}`);
    console.log(
      `  - Top snippet score: ${matchedSnippets[0]?.relevanceScore?.toFixed(2) || "N/A"}`
    );
    console.log(`  - Placeholders resolved: ${placeholdersResolved}`);

    // Decision: Use snippets if available and score is good
    if (
      matchedSnippets.length > 0 &&
      matchedSnippets[0].relevanceScore > 0.6 &&
      placeholdersResolved
    ) {
      const reason = `Using ${matchedSnippets.length} relevant snippets (score: ${matchedSnippets[0].relevanceScore.toFixed(2)})`;
      console.log(`[ExecutionModeSelector] 📚 Snippets mode: ${reason}`);
      return {
        mode: "snippets",
        snippets: matchedSnippets,
        reason,
      };
    }

    // Fallback: Use semantic mode
    const reason =
      matchedSnippets.length === 0
        ? "No relevant snippets found"
        : `Top snippet score (${matchedSnippets[0].relevanceScore.toFixed(2)}) below threshold 0.6`;

    console.log(`[ExecutionModeSelector] 🔄 Semantic mode: ${reason}`);
    return {
      mode: "semantic",
      reason,
    };
  }

  /**
   * Get human-readable description of execution mode.
   */
  getModeDescription(mode: ExecutionMode): string {
    switch (mode) {
      case "snippets":
        return "Snippet-Guided: Composing SQL using relevant snippets";
      case "semantic":
        return "Semantic: Generating SQL from semantic context";
    }
  }

  /**
   * Check if mode requires LLM involvement.
   */
  requiresLLM(mode: ExecutionMode): boolean {
    return true; // Both modes use LLM
  }

  /**
   * Estimate SQL generation latency for mode.
   */
  estimateLatency(mode: ExecutionMode): { min: number; max: number } {
    switch (mode) {
      case "snippets":
        return { min: 1000, max: 3000 };  // 1-3 seconds
      case "semantic":
        return { min: 3000, max: 8000 };  // 3-8 seconds
    }
  }

  /**
   * Log execution mode selection for telemetry.
   */
  logModeSelection(mode: ExecutionMode, reason: string): void {
    console.log(`[ExecutionModeSelector] 📊 Selected: ${mode} - ${reason}`);
  }
}

// Singleton instance
let instance: ExecutionModeSelector | null = null;

/**
 * Get or create the singleton instance.
 */
export function getExecutionModeSelector(): ExecutionModeSelector {
  if (!instance) {
    instance = new ExecutionModeSelector();
  }
  return instance;
}

/**
 * Convenience function for mode selection.
 */
export async function selectExecutionMode(options: {
  intent: QueryIntent;
  matchedSnippets: SnippetMatch[];
  placeholdersResolved: boolean;
}): Promise<ModeDecision> {
  const selector = getExecutionModeSelector();
  const decision = selector.selectMode(options);
  selector.logModeSelection(decision.mode, decision.reason);
  return decision;
}

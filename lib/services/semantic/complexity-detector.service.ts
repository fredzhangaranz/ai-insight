// lib/services/semantic/complexity-detector.service.ts
// Complexity Detection Service for Phase 7B/7C
// Determines if a question requires simple direct query or complex funnel mode
// Phase 7C: Added threshold-based routing for Progressive Disclosure

export type QueryComplexity = "simple" | "medium" | "complex";
export type ExecutionStrategy = "auto" | "preview" | "inspect";

export interface ComplexityThresholds {
  simple: number;    // 0-4: Direct execution
  medium: number;    // 5-7: Preview + auto-execute
  complex: number;   // 8-10: Require inspection
}

export interface ComplexityAnalysis {
  complexity: QueryComplexity;
  score: number; // 0-10 complexity score
  strategy: ExecutionStrategy; // Execution strategy based on thresholds
  confidence: number;
  reasons: string[];
  indicators: {
    multiStep: boolean;
    aggregations: number;
    comparisons: number;
    timeSeries: boolean;
    multiEntity: boolean;
  };
}

// Default complexity thresholds (configurable)
export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  simple: 4,   // Score 0-4: Auto execution
  medium: 7,   // Score 5-7: Preview then execute
  complex: 10, // Score 8-10: Require inspection
};

/**
 * Analyze a question to determine its complexity
 * Returns complexity level (simple/medium/complex) and execution strategy
 *
 * @param question - User's natural language question
 * @param thresholds - Optional custom thresholds (defaults to DEFAULT_THRESHOLDS)
 */
export function analyzeComplexity(
  question: string,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS
): ComplexityAnalysis {
  const questionLower = question.toLowerCase().trim();
  const reasons: string[] = [];

  // Initialize indicators
  const indicators = {
    multiStep: false,
    aggregations: 0,
    comparisons: 0,
    timeSeries: false,
    multiEntity: false,
  };

  let complexityScore = 0;

  // 1. Check for multi-step indicators
  const multiStepPatterns = [
    /then/i,
    /after that/i,
    /followed by/i,
    /and then/i,
    /first.*then/i,
    /also/i,
    /additionally/i,
  ];

  for (const pattern of multiStepPatterns) {
    if (pattern.test(questionLower)) {
      indicators.multiStep = true;
      complexityScore += 3;
      reasons.push("Multi-step question detected");
      break;
    }
  }

  // 2. Count aggregation operations
  const aggregationPatterns = [
    /\baverage\b/i,
    /\bmean\b/i,
    /\bsum\b/i,
    /\btotal\b/i,
    /\bcount\b/i,
    /\bmax\b/i,
    /\bmin\b/i,
    /\bpercentage\b/i,
    /\brate\b/i,
  ];

  for (const pattern of aggregationPatterns) {
    if (pattern.test(questionLower)) {
      indicators.aggregations++;
    }
  }

  if (indicators.aggregations >= 2) {
    complexityScore += 2;
    reasons.push(`Multiple aggregations (${indicators.aggregations})`);
  }

  // 3. Check for comparison operations
  const comparisonPatterns = [
    /compare/i,
    /versus/i,
    /\bvs\b/i,
    /difference between/i,
    /better than/i,
    /worse than/i,
    /higher than/i,
    /lower than/i,
  ];

  for (const pattern of comparisonPatterns) {
    if (pattern.test(questionLower)) {
      indicators.comparisons++;
    }
  }

  if (indicators.comparisons > 0) {
    complexityScore += 2;
    reasons.push("Comparison detected");
  }

  // 4. Check for time series analysis
  const timeSeriesPatterns = [
    /over time/i,
    /trend/i,
    /timeline/i,
    /history/i,
    /weekly/i,
    /monthly/i,
    /quarterly/i,
    /yearly/i,
    /per day/i,
    /per week/i,
    /per month/i,
  ];

  for (const pattern of timeSeriesPatterns) {
    if (pattern.test(questionLower)) {
      indicators.timeSeries = true;
      complexityScore += 2;
      reasons.push("Time series analysis detected");
      break;
    }
  }

  // 5. Check for multiple entities
  // Count entity references (simplified heuristic)
  const entityCount = countPotentialEntities(questionLower);
  if (entityCount >= 3) {
    indicators.multiEntity = true;
    complexityScore += 2;
    reasons.push(`Multiple entities detected (${entityCount})`);
  }

  // 6. Check for complex join requirements
  const joinPatterns = [
    /for each/i,
    /by patient.*by wound/i,
    /grouped by/i,
    /per.*per/i, // e.g., "per patient per wound"
  ];

  for (const pattern of joinPatterns) {
    if (pattern.test(questionLower)) {
      complexityScore += 2;
      reasons.push("Complex joins detected");
      break;
    }
  }

  // Cap score at 10
  const finalScore = Math.min(complexityScore, 10);

  // Determine complexity level based on thresholds
  let complexity: QueryComplexity;
  if (finalScore <= thresholds.simple) {
    complexity = "simple";
  } else if (finalScore <= thresholds.medium) {
    complexity = "medium";
  } else {
    complexity = "complex";
  }

  // Determine execution strategy based on complexity
  const strategy = getExecutionStrategy(finalScore, thresholds);

  const confidence = Math.min(finalScore / 10, 0.95); // Cap at 0.95

  if (reasons.length === 0) {
    reasons.push("Simple single-entity query");
  }

  return {
    complexity,
    score: finalScore,
    strategy,
    confidence,
    reasons,
    indicators,
  };
}

/**
 * Get execution strategy based on complexity score and thresholds
 *
 * @param score - Complexity score (0-10)
 * @param thresholds - Complexity thresholds
 * @returns ExecutionStrategy: 'auto' | 'preview' | 'inspect'
 */
export function getExecutionStrategy(
  score: number,
  thresholds: ComplexityThresholds = DEFAULT_THRESHOLDS
): ExecutionStrategy {
  if (score <= thresholds.simple) {
    return "auto"; // Direct execution, no preview
  } else if (score <= thresholds.medium) {
    return "preview"; // Show step preview, then auto-execute
  } else {
    return "inspect"; // Require user inspection before execution
  }
}

/**
 * Calculate numeric complexity score from analysis indicators
 * Used for programmatic complexity assessment
 *
 * @param analysis - Complexity analysis result
 * @returns Numeric score (0-10)
 */
export function calculateComplexityScore(analysis: ComplexityAnalysis): number {
  return analysis.score;
}

/**
 * Count potential entities in the question
 * This is a simplified heuristic based on common entity patterns
 */
function countPotentialEntities(question: string): number {
  const entityKeywords = [
    "patient",
    "wound",
    "assessment",
    "clinic",
    "clinician",
    "measurement",
    "visit",
    "treatment",
    "medication",
    "diagnosis",
  ];

  const foundEntities = new Set<string>();

  for (const keyword of entityKeywords) {
    if (question.includes(keyword)) {
      foundEntities.add(keyword);
    }
  }

  return foundEntities.size;
}

/**
 * Get a human-readable explanation of complexity
 */
export function explainComplexity(analysis: ComplexityAnalysis): string {
  const confidencePercent = Math.round(analysis.confidence * 100);
  const scoreDisplay = `${analysis.score}/10`;

  if (analysis.complexity === "simple") {
    return `This is a simple query (score: ${scoreDisplay}, confidence: ${confidencePercent}%). It will be executed directly using semantic discovery.`;
  } else if (analysis.complexity === "medium") {
    return `This is a medium complexity query (score: ${scoreDisplay}, confidence: ${confidencePercent}%). I'll show you the execution plan before running it automatically. Reasons: ${analysis.reasons.join(", ")}.`;
  } else {
    return `This is a complex query (score: ${scoreDisplay}, confidence: ${confidencePercent}%). It requires your inspection before execution. I'll break it down into steps for you to review. Reasons: ${analysis.reasons.join(", ")}.`;
  }
}

/**
 * Get a short label for the execution strategy
 */
export function getStrategyLabel(strategy: ExecutionStrategy): string {
  switch (strategy) {
    case "auto":
      return "Auto Execute";
    case "preview":
      return "Preview & Execute";
    case "inspect":
      return "Inspect Required";
  }
}

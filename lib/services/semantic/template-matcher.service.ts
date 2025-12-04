// lib/services/semantic/template-matcher.service.ts
// Template Matching Service for Phase 7B
// Matches user questions to existing templates in the catalog

import {
  getTemplates,
  QueryTemplate,
  TemplateMatch,
} from "../query-template.service";
import type { QueryIntent } from "../intent-classifier/intent-classifier.service";

export interface TemplateMatchResult {
  matched: boolean;
  template?: QueryTemplate;
  confidence: number;
  matchedKeywords?: string[];
  matchedExample?: string;
  matchedTags?: string[];
  explanations?: TemplateMatchExplanation[];
}

export interface TemplateMatchExplanation {
  template: QueryTemplate;
  confidence: number;
  matchedKeywords: string[];
  matchedTags: string[];
  matchedConcepts: string[];
  matchedExample?: string;
  successRate?: number;
}

/**
 * Represents a matched snippet with relevance score and reasoning.
 */
export interface SnippetMatch {
  snippet: QueryTemplate;
  relevanceScore: number; // 0.0-1.0
  matchReasons: string[]; // ["keyword:area", "tag:temporal"]
  contextSatisfied: boolean; // All required fields available in context?
  missingContext: string[]; // Fields not found in semantic context
}

/**
 * Options for snippet matching.
 */
export interface SnippetMatchOptions {
  topK?: number; // Default: 5
  minScore?: number; // Default: 0.6
}

/**
 * Attempts to match a question to an existing template
 * Returns the best matching template if confidence > 0.5
 *
 * Scoring weights prioritize:
 * 1. Keywords (most important) - 0.5
 * 2. Examples (important) - 0.25
 * 3. Intent (important) - 0.15
 * 4. Tags (least important when concepts missing) - 0.1
 */
const EXAMPLE_WEIGHT = 0.25;
const KEYWORD_WEIGHT = 0.5;
const TAG_WEIGHT = 0.1;
const INTENT_WEIGHT = 0.15;

export async function matchTemplate(
  question: string,
  customerId: string,
  concepts: string[] = [],
  options?: { topK?: number }
): Promise<TemplateMatchResult> {
  console.log(
    `[TemplateMatcher] 🔍 Matching question: "${question.substring(0, 100)}..."`
  );

  const catalog = await getTemplates();

  if (!catalog.templates || catalog.templates.length === 0) {
    console.log(`[TemplateMatcher] ❌ No templates in catalog`);
    return { matched: false, confidence: 0 };
  }

  console.log(
    `[TemplateMatcher] 📚 Total templates in catalog: ${catalog.templates.length}`
  );

  // Only consider Approved templates
  const activeTemplates = catalog.templates.filter(
    (t) => t.status === "Approved"
  );

  console.log(
    `[TemplateMatcher] ✅ Approved templates: ${activeTemplates.length}`
  );
  console.log(
    `[TemplateMatcher] Templates by status:`,
    catalog.templates.reduce((acc, t) => {
      acc[t.status || "undefined"] = (acc[t.status || "undefined"] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  );

  if (activeTemplates.length === 0) {
    console.log(`[TemplateMatcher] ❌ No approved templates found`);
    return { matched: false, confidence: 0 };
  }

  // Score each template against the question
  const normalizedConcepts = Array.isArray(concepts)
    ? concepts.map((concept) => concept.toLowerCase().trim()).filter(Boolean)
    : [];

  console.log(
    `[TemplateMatcher] 🎯 Scoring ${activeTemplates.length} templates...`
  );

  const matches: TemplateMatch[] = activeTemplates
    .map((template) => scoreTemplate(question, template, normalizedConcepts))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  // Log top 5 matches
  console.log(
    `[TemplateMatcher] 📊 Top ${Math.min(5, matches.length)} matches:`
  );
  matches.slice(0, 5).forEach((match, i) => {
    console.log(
      `  ${i + 1}. "${match.template.name}" - score: ${match.score.toFixed(
        3
      )}, intent: ${
        match.template.intent
      }, keywords: [${match.matchedKeywords.join(", ")}]`
    );
  });

  const topK = options?.topK ?? 3;
  const explanations: TemplateMatchExplanation[] = matches
    .slice(0, Math.max(topK, 1))
    .map((match) => ({
      template: match.template,
      confidence: match.score,
      matchedKeywords: match.matchedKeywords,
      matchedTags: match.matchedTags ?? [],
      matchedConcepts: match.matchedConcepts ?? [],
      matchedExample: match.matchedExample,
      successRate: match.successRate,
    }));

  if (matches.length === 0) {
    console.log(`[TemplateMatcher] ❌ No matches with score > 0`);
    return { matched: false, confidence: 0, explanations };
  }

  const bestMatch = matches[0];
  const confidence = bestMatch.score;

  console.log(
    `[TemplateMatcher] 🎯 Best match: "${
      bestMatch.template.name
    }" (${confidence.toFixed(3)})`
  );

  // Require minimum confidence of 0.35 for full templates, 0.30 for snippet templates
  // Snippet templates are more flexible and can be composed, so we use a lower threshold
  // This is reasonable because:
  // - With reweighted scoring (keyword: 0.5, intent: 0.15, example: 0.25, tag: 0.1)
  // - 3+ matched keywords (min 0.5 score) × 0.5 weight = 0.25
  // - Good intent match (0.667 score) × 0.15 weight = 0.1
  // - Total: 0.35 for "good" template match
  // - This balances between: too strict (0.85 caught no matches) and too lenient (<0.2)
  const isSnippetTemplate =
    bestMatch.template.intent?.startsWith("snippet_") ||
    bestMatch.template.tags?.includes("snippet");
  const CONFIDENCE_THRESHOLD = isSnippetTemplate ? 0.3 : 0.35;

  if (confidence < CONFIDENCE_THRESHOLD) {
    console.log(
      `[TemplateMatcher] ⚠️  Confidence ${confidence.toFixed(
        3
      )} below threshold ${CONFIDENCE_THRESHOLD} (${
        isSnippetTemplate ? "snippet" : "full"
      } template) - not using template`
    );
    return { matched: false, confidence, explanations };
  }

  console.log(`[TemplateMatcher] ✅ Template matched successfully!`);

  return {
    matched: true,
    template: bestMatch.template,
    confidence,
    matchedKeywords: bestMatch.matchedKeywords,
    matchedExample: bestMatch.matchedExample,
    matchedTags: bestMatch.matchedTags,
    explanations,
  };
}

/**
 * Score a template against a question
 * Returns a score between 0 and 1
 */
function scoreTemplate(
  question: string,
  template: QueryTemplate,
  concepts: string[]
): TemplateMatch {
  const questionLower = question.toLowerCase().trim();
  let score = 0;
  const matchedKeywords: string[] = [];
  let matchedExample: string | undefined;
  let matchedTags: string[] = [];

  const exampleResult = calculateExampleMatchScore(
    questionLower,
    template.questionExamples
  );
  const exampleContribution = exampleResult.score * EXAMPLE_WEIGHT;
  score += exampleContribution;
  matchedExample = exampleResult.matchedExample;

  const keywordResult = calculateKeywordMatchScore(
    questionLower,
    template.keywords
  );
  const keywordContribution = keywordResult.score * KEYWORD_WEIGHT;
  score += keywordContribution;
  matchedKeywords.push(...keywordResult.matchedKeywords);

  const tagResult = calculateTagMatchScore(concepts, template.tags);
  const tagContribution = tagResult.score * TAG_WEIGHT;
  score += tagContribution;
  matchedTags = tagResult.matchedTags;

  const intentScore = calculateIntentMatchScore(questionLower, template.intent);
  const intentContribution = intentScore * INTENT_WEIGHT;
  score += intentContribution;

  // Debug logging for scoring breakdown
  if (
    template.intent === "temporal_proximity_query" ||
    template.name.includes("Area Reduction")
  ) {
    console.log(
      `[TemplateMatcher] 📊 Scoring breakdown for "${template.name}":`,
      {
        exampleScore: exampleResult.score,
        exampleContribution: exampleContribution.toFixed(3),
        keywordScore: keywordResult.score,
        keywordContribution: keywordContribution.toFixed(3),
        matchedKeywords: keywordResult.matchedKeywords,
        totalKeywords: template.keywords?.length || 0,
        tagScore: tagResult.score,
        tagContribution: tagContribution.toFixed(3),
        intentScore: intentScore,
        intentContribution: intentContribution.toFixed(3),
        totalScore: score.toFixed(3),
      }
    );
  }

  const normalizedScore = Math.min(score, 1.0);

  return {
    template,
    score: normalizedScore,
    baseScore: score,
    matchedKeywords,
    matchedExample,
    matchedTags,
    matchedConcepts: tagResult.matchedConcepts,
    successRate: template.successRate,
  };
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Get common keywords associated with an intent
 */
function getIntentKeywords(intent: string): string[] {
  const intentMap: Record<string, string[]> = {
    query: ["show", "list", "get", "find", "what", "how many"],
    aggregate: ["count", "total", "average", "sum", "mean"],
    comparison: ["compare", "versus", "vs", "difference"],
    trend: ["trend", "over time", "timeline", "history"],
    ranking: ["top", "bottom", "best", "worst", "highest", "lowest"],
    // New intents from templating system
    temporal_proximity_query: [
      "at",
      "by",
      "around",
      "approximately",
      "weeks",
      "months",
      "healing",
      "reduction",
      "outcome",
    ],
    assessment_correlation_check: [
      "without",
      "missing",
      "no",
      "but no",
      "with no",
      "reconciliation",
      "correlation",
    ],
    workflow_status_monitoring: [
      "status",
      "state",
      "workflow",
      "pending",
      "complete",
      "by status",
      "group by",
    ],
  };

  return intentMap[intent.toLowerCase()] || [];
}

function calculateExampleMatchScore(
  questionLower: string,
  examples?: string[]
): { score: number; matchedExample?: string } {
  if (!examples || examples.length === 0) {
    return { score: 0 };
  }

  let bestScore = 0;
  let bestExample: string | undefined;

  for (const example of examples) {
    const exampleLower = example.toLowerCase().trim();
    const similarity = calculateStringSimilarity(questionLower, exampleLower);

    // More lenient thresholds with gradual scoring
    if (similarity > 0.9) {
      return { score: 1, matchedExample: example };
    }
    if (similarity > 0.7) {
      const score = 0.5 + (similarity - 0.7) * 0.5; // Scale 0.7-0.9 to 0.5-1.0
      if (score > bestScore) {
        bestScore = score;
        bestExample = example;
      }
    } else if (similarity > 0.5) {
      // Lower threshold: give partial credit for 0.5-0.7 similarity
      const score = (similarity - 0.5) * 0.5; // Scale 0.5-0.7 to 0.0-0.1
      if (score > bestScore) {
        bestScore = score;
        bestExample = example;
      }
    }
  }

  return { score: bestScore, matchedExample: bestExample };
}

function calculateKeywordMatchScore(
  questionLower: string,
  keywords?: string[]
): { score: number; matchedKeywords: string[] } {
  if (!keywords || keywords.length === 0) {
    return { score: 0, matchedKeywords: [] };
  }

  const matchedKeywords: string[] = [];
  for (const keyword of keywords) {
    if (questionLower.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length === 0) {
    return { score: 0, matchedKeywords: [] };
  }

  // Use square root scaling for more lenient scoring
  // Matching 3 out of 18 keywords: sqrt(3/18) = 0.408 instead of 0.167
  // This rewards partial matches more fairly
  const ratio = matchedKeywords.length / keywords.length;
  const scaledRatio = Math.sqrt(ratio); // Square root scaling

  // Boost score if we match multiple keywords (indicates strong relevance)
  // Matching 3+ keywords should get at least 0.5 score
  // Matching 2 keywords should get at least 0.4 score
  let minScore = 0;
  if (matchedKeywords.length >= 3) {
    minScore = 0.5;
  } else if (matchedKeywords.length >= 2) {
    minScore = 0.4;
  }

  return {
    score: clamp01(Math.max(scaledRatio, minScore)),
    matchedKeywords,
  };
}

function calculateTagMatchScore(
  concepts: string[],
  tags?: string[]
): { score: number; matchedTags: string[]; matchedConcepts: string[] } {
  if (!tags || tags.length === 0 || concepts.length === 0) {
    return { score: 0, matchedTags: [], matchedConcepts: [] };
  }

  const tagSet = new Set(tags.map((tag) => tag.toLowerCase()));
  const conceptSet = new Set(concepts.map((concept) => concept.toLowerCase()));

  let intersection = 0;
  const matchedTags: string[] = [];
  const matchedConcepts: string[] = [];

  for (const tag of tagSet) {
    if (conceptSet.has(tag)) {
      intersection += 1;
      matchedTags.push(tag);
      matchedConcepts.push(tag);
    }
  }

  const unionSize = tagSet.size + conceptSet.size - intersection;
  const score = unionSize === 0 ? 0 : intersection / unionSize;
  return {
    score: clamp01(score),
    matchedTags,
    matchedConcepts,
  };
}

function calculateIntentMatchScore(
  questionLower: string,
  intent?: string
): number {
  if (!intent) return 0;
  const intentKeywords = getIntentKeywords(intent);
  if (intentKeywords.length === 0) return 0;

  let matches = 0;
  for (const word of intentKeywords) {
    if (questionLower.includes(word.toLowerCase())) {
      matches++;
    }
  }

  // Use square root scaling for consistency with keyword scoring
  // Matching 4 out of 9 keywords: sqrt(4/9) = 0.667 instead of 0.444
  const ratio = matches / intentKeywords.length;
  return clamp01(Math.sqrt(ratio));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Match snippets for a given query intent.
 * Returns top-K snippets relevant to the user query and intent.
 *
 * Scoring:
 * - Base score from keywords/tags (same as template matching)
 * - Boost if snippet's intent matches query intent
 * - Reduce score if required context is missing
 * - Deduplication: keep only highest-scoring snippet per purpose
 *
 * @param userQuery - The user's natural language question
 * @param intent - The detected query intent
 * @param semanticContext - Available schema fields and assessment types
 * @param options - topK (default 5), minScore (default 0.6)
 * @returns Array of snippet matches sorted by relevance (highest first)
 */
export async function matchSnippets(
  userQuery: string,
  intent: QueryIntent,
  semanticContext: { fields?: string[]; assessmentTypes?: string[] },
  options?: SnippetMatchOptions
): Promise<SnippetMatch[]> {
  const topK = options?.topK ?? 5;
  const minScore = options?.minScore ?? 0.6;

  console.log(
    `[SnippetMatcher] 🔍 Matching snippets for intent "${intent}": "${userQuery.substring(
      0,
      80
    )}..."`
  );

  const catalog = await getTemplates();
  if (!catalog.templates || catalog.templates.length === 0) {
    console.log(`[SnippetMatcher] ❌ No templates/snippets in catalog`);
    return [];
  }

  // Filter for snippets (intent prefixed with "snippet_" OR marked as snippet in tags)
  const snippets = catalog.templates.filter(
    (t) =>
      t.status === "Approved" &&
      (t.intent?.startsWith("snippet_") || t.tags?.includes("snippet"))
  );

  if (snippets.length === 0) {
    console.log(`[SnippetMatcher] ⚠️  No snippets found in catalog`);
    return [];
  }

  console.log(`[SnippetMatcher] 📚 Found ${snippets.length} snippet templates`);

  const questionLower = userQuery.toLowerCase().trim();
  const contextFields = new Set(
    (semanticContext.fields || []).map((f) => f.toLowerCase())
  );

  // Score each snippet
  const matches: SnippetMatch[] = snippets
    .map((snippet) => {
      let relevanceScore = 0;
      const matchReasons: string[] = [];

      // Base keyword matching
      if (snippet.keywords && snippet.keywords.length > 0) {
        const keywordResult = calculateKeywordMatchScore(
          questionLower,
          snippet.keywords
        );
        if (keywordResult.score > 0) {
          relevanceScore += keywordResult.score * KEYWORD_WEIGHT;
          keywordResult.matchedKeywords.forEach((kw) => {
            matchReasons.push(`keyword:${kw}`);
          });
        }
      }

      // Tag matching
      if (snippet.tags && snippet.tags.length > 0) {
        const tagResult = calculateTagMatchScore(
          Array.from(contextFields),
          snippet.tags
        );
        if (tagResult.score > 0) {
          relevanceScore += tagResult.score * TAG_WEIGHT;
          tagResult.matchedTags.forEach((tag) => {
            matchReasons.push(`tag:${tag}`);
          });
        }
      }

      // Intent matching - boost if snippet intent matches query intent
      if (snippet.intent) {
        // Extract base intent from snippet (e.g., "snippet_area_reduction" -> "area_reduction")
        const snippetIntentBase = snippet.intent.replace(/^snippet_/, "");
        if (
          snippetIntentBase.includes(intent) ||
          intent.includes(snippetIntentBase)
        ) {
          relevanceScore += INTENT_WEIGHT;
          matchReasons.push(`intent:${snippet.intent}`);
        }
      }

      // Check context satisfaction
      const requiredContext = snippet.keywords || [];
      const missingContext: string[] = [];
      let contextSatisfied = true;

      for (const keyword of requiredContext) {
        const keywordLower = keyword.toLowerCase();
        if (
          !contextFields.has(keywordLower) &&
          !questionLower.includes(keywordLower)
        ) {
          missingContext.push(keyword);
          contextSatisfied = false;
        }
      }

      // Boost score if all context is satisfied
      if (contextSatisfied && missingContext.length === 0) {
        relevanceScore = Math.min(relevanceScore + 0.15, 1.0);
        matchReasons.push("context:satisfied");
      } else if (missingContext.length > 0) {
        // Reduce score if critical context is missing
        relevanceScore *= 0.85;
      }

      return {
        snippet,
        relevanceScore: Math.min(relevanceScore, 1.0),
        matchReasons,
        contextSatisfied,
        missingContext,
      };
    })
    .filter((match) => match.relevanceScore >= minScore)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  console.log(
    `[SnippetMatcher] 📊 Found ${matches.length} relevant snippets (score >= ${minScore})`
  );

  matches.slice(0, Math.min(3, matches.length)).forEach((match, i) => {
    console.log(
      `  ${i + 1}. "${
        match.snippet.name
      }" - score: ${match.relevanceScore.toFixed(
        3
      )}, reasons: [${match.matchReasons.join(", ")}]`
    );
  });

  // Deduplication: if multiple snippets solve the same problem, keep only the highest-scoring one
  const purposeMap = new Map<string, SnippetMatch>();
  for (const match of matches) {
    const purpose = match.snippet.description || match.snippet.name;
    const existing = purposeMap.get(purpose);
    if (!existing || match.relevanceScore > existing.relevanceScore) {
      purposeMap.set(purpose, match);
    }
  }

  const dedupedMatches = Array.from(purposeMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK);

  console.log(
    `[SnippetMatcher] ✅ Returning ${dedupedMatches.length} snippets (after dedup)`
  );

  return dedupedMatches;
}

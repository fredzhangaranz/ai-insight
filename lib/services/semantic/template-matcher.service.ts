// lib/services/semantic/template-matcher.service.ts
// Template Matching Service for Phase 7B
// Matches user questions to existing templates in the catalog

import { getTemplates, QueryTemplate, TemplateMatch } from "../query-template.service";

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
 * Attempts to match a question to an existing template
 * Returns the best matching template if confidence > 0.7
 */
const EXAMPLE_WEIGHT = 0.5;
const KEYWORD_WEIGHT = 0.3;
const TAG_WEIGHT = 0.15;
const INTENT_WEIGHT = 0.05;

export async function matchTemplate(
  question: string,
  customerId: string,
  concepts: string[] = [],
  options?: { topK?: number }
): Promise<TemplateMatchResult> {
  const catalog = await getTemplates();

  if (!catalog.templates || catalog.templates.length === 0) {
    return { matched: false, confidence: 0 };
  }

  // Only consider Approved templates
  const activeTemplates = catalog.templates.filter(
    (t) => t.status === "Approved"
  );

  if (activeTemplates.length === 0) {
    return { matched: false, confidence: 0 };
  }

  // Score each template against the question
  const normalizedConcepts = Array.isArray(concepts)
    ? concepts.map((concept) => concept.toLowerCase().trim()).filter(Boolean)
    : [];

  const matches: TemplateMatch[] = activeTemplates
    .map((template) => scoreTemplate(question, template, normalizedConcepts))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return { matched: false, confidence: 0 };
  }

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

  const bestMatch = matches[0];
  const confidence = bestMatch.score;

  // Require minimum confidence of 0.7 for template matching
  if (confidence < 0.7) {
    return { matched: false, confidence };
  }

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
  score += exampleResult.score * EXAMPLE_WEIGHT;
  matchedExample = exampleResult.matchedExample;

  const keywordResult = calculateKeywordMatchScore(
    questionLower,
    template.keywords
  );
  score += keywordResult.score * KEYWORD_WEIGHT;
  matchedKeywords.push(...keywordResult.matchedKeywords);

  const tagResult = calculateTagMatchScore(concepts, template.tags);
  score += tagResult.score * TAG_WEIGHT;
  matchedTags = tagResult.matchedTags;

  const intentScore = calculateIntentMatchScore(questionLower, template.intent);
  score += intentScore * INTENT_WEIGHT;

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

  for (const example of examples) {
    const exampleLower = example.toLowerCase().trim();
    const similarity = calculateStringSimilarity(questionLower, exampleLower);

    if (similarity > 0.9) {
      return { score: 1, matchedExample: example };
    }
    if (similarity > 0.7) {
      return { score: 0.6, matchedExample: example };
    }
  }

  return { score: 0 };
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

  const ratio = matchedKeywords.length / keywords.length;
  return { score: clamp01(ratio), matchedKeywords };
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
  return clamp01(matches / intentKeywords.length);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

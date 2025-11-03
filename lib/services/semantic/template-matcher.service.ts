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
}

/**
 * Attempts to match a question to an existing template
 * Returns the best matching template if confidence > 0.7
 */
export async function matchTemplate(
  question: string,
  customerId: string
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
  const matches: TemplateMatch[] = activeTemplates
    .map((template) => scoreTemplate(question, template))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);

  if (matches.length === 0) {
    return { matched: false, confidence: 0 };
  }

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
  };
}

/**
 * Score a template against a question
 * Returns a score between 0 and 1
 */
function scoreTemplate(question: string, template: QueryTemplate): TemplateMatch {
  const questionLower = question.toLowerCase().trim();
  let score = 0;
  const matchedKeywords: string[] = [];
  let matchedExample: string | undefined;

  // 1. Check for exact or near-exact match with examples (50% weight)
  if (template.questionExamples && template.questionExamples.length > 0) {
    for (const example of template.questionExamples) {
      const exampleLower = example.toLowerCase().trim();
      const similarity = calculateStringSimilarity(questionLower, exampleLower);

      if (similarity > 0.9) {
        score += 0.5;
        matchedExample = example;
        break;
      } else if (similarity > 0.7) {
        score += 0.3;
        matchedExample = example;
        break;
      }
    }
  }

  // 2. Check for keyword matches (40% weight)
  if (template.keywords && template.keywords.length > 0) {
    let keywordMatches = 0;
    for (const keyword of template.keywords) {
      if (questionLower.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        keywordMatches++;
      }
    }

    if (template.keywords.length > 0) {
      const keywordMatchRatio = keywordMatches / template.keywords.length;
      score += keywordMatchRatio * 0.4;
    }
  }

  // 3. Check for intent-based words (10% weight)
  if (template.intent) {
    const intentKeywords = getIntentKeywords(template.intent);
    let intentMatches = 0;

    for (const word of intentKeywords) {
      if (questionLower.includes(word.toLowerCase())) {
        intentMatches++;
      }
    }

    if (intentKeywords.length > 0) {
      score += (intentMatches / intentKeywords.length) * 0.1;
    }
  }

  return {
    template,
    score: Math.min(score, 1.0), // Cap at 1.0
    baseScore: score,
    matchedKeywords,
    matchedExample,
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

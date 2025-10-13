import { getTemplates, QueryTemplate } from "./query-template.service";

/**
 * Configuration constant for similarity detection threshold.
 * Templates with Jaccard similarity >= this value are considered duplicates.
 */
export const SIMILARITY_THRESHOLD = 0.7;

/**
 * Warning structure for similar template detection.
 */
export interface SimilarTemplateWarning {
  templateId?: number;
  name: string;
  intent: string;
  similarity: number;
  successRate?: number;
  usageCount?: number;
  message: string;
}

/**
 * Draft template structure for similarity checking.
 * Contains the minimal fields needed to detect duplicates.
 */
export interface TemplateDraft {
  name: string;
  description?: string;
  keywords?: string[];
  intent: string;
  tags?: string[];
}

/**
 * Check if a draft template is similar to existing templates in the catalog.
 * Returns warnings for templates with similarity above threshold, sorted by similarity.
 *
 * Algorithm:
 * 1. Tokenize draft name + description + keywords
 * 2. Filter catalog to templates with matching intent
 * 3. Calculate Jaccard similarity for each template
 * 4. Return templates with similarity > threshold, sorted descending
 */
export async function checkSimilarTemplates(
  draft: TemplateDraft
): Promise<SimilarTemplateWarning[]> {
  if (!draft?.name || !draft?.intent) {
    return [];
  }

  const catalog = await getTemplates();
  if (!catalog?.templates?.length) {
    return [];
  }

  // Tokenize draft metadata for comparison
  const draftTokens = tokenizeTemplateMetadata(draft);

  // Filter to same intent and calculate similarity
  const candidates = catalog.templates
    .filter(
      (tpl) => tpl.intent === draft.intent && tpl.status !== "Deprecated" // Only compare within same intent and exclude deprecated
    )
    .map((tpl) => {
      const tplTokens = tokenizeTemplateMetadata({
        name: tpl.name,
        description: tpl.description,
        keywords: tpl.keywords,
        intent: tpl.intent || "",
        tags: tpl.tags,
      });

      const similarity = calculateJaccardSimilarity(draftTokens, tplTokens);

      return {
        template: tpl,
        similarity,
      };
    })
    .filter((candidate) => candidate.similarity >= SIMILARITY_THRESHOLD);

  // Sort by similarity descending, then by success rate descending
  candidates.sort((a, b) => {
    if (Math.abs(a.similarity - b.similarity) > 0.001) {
      return b.similarity - a.similarity;
    }
    const aRate = a.template.successRate ?? 0;
    const bRate = b.template.successRate ?? 0;
    return bRate - aRate;
  });

  // Transform to warning structure
  return candidates.map((candidate) => {
    const { template, similarity } = candidate;
    const similarityPercent = Math.round(similarity * 100);

    let message = `Template "${template.name}" is ${similarityPercent}% similar`;
    if (template.successRate !== undefined) {
      const successPercent = Math.round(template.successRate * 100);
      message += ` (${successPercent}% success rate)`;
    }
    if (template.usageCount && template.usageCount > 0) {
      message += ` with ${template.usageCount} uses`;
    }
    message += ". Consider reviewing before creating a duplicate.";

    return {
      templateId: template.templateId,
      name: template.name,
      intent: template.intent || "",
      similarity,
      successRate: template.successRate,
      usageCount: template.usageCount,
      message,
    };
  });
}

/**
 * Tokenize template metadata into a set of normalized tokens.
 * Combines name, description, keywords, and tags into a single token set.
 */
function tokenizeTemplateMetadata(
  metadata: Partial<TemplateDraft>
): Set<string> {
  const parts: string[] = [];

  if (metadata.name) {
    parts.push(metadata.name);
  }

  if (metadata.description) {
    parts.push(metadata.description);
  }

  if (metadata.keywords?.length) {
    parts.push(...metadata.keywords);
  }

  if (metadata.tags?.length) {
    parts.push(...metadata.tags);
  }

  const text = parts.join(" ");
  return tokenize(text);
}

/**
 * Tokenize text into normalized word tokens.
 * Splits on non-alphanumeric characters, converts to lowercase.
 */
function tokenize(text: string): Set<string> {
  const tokens = (text || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean);
  return new Set(tokens);
}

/**
 * Calculate Jaccard similarity coefficient between two token sets.
 * Returns a value between 0 (no overlap) and 1 (identical).
 *
 * Formula: |A ∩ B| / |A ∪ B|
 */
function calculateJaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let intersection = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];

  for (const token of Array.from(small)) {
    if (large.has(token)) {
      intersection += 1;
    }
  }

  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

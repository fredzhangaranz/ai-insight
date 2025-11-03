// lib/services/semantic/template-placeholder.service.ts
// Template Placeholder Extraction and Filling for Phase 7B

import type { QueryTemplate } from "../query-template.service";

export interface PlaceholderValues {
  [key: string]: string | number;
}

export interface PlaceholderExtractionResult {
  values: PlaceholderValues;
  confidence: number;
  filledSQL: string;
}

/**
 * Extract placeholder values from user question and fill template
 */
export async function extractAndFillPlaceholders(
  question: string,
  template: QueryTemplate
): Promise<PlaceholderExtractionResult> {
  const placeholders = template.placeholders || [];
  const values: PlaceholderValues = {};

  if (placeholders.length === 0) {
    // No placeholders, return template SQL as-is
    return {
      values: {},
      confidence: 1.0,
      filledSQL: template.sqlPattern,
    };
  }

  // Extract values for each placeholder
  for (const placeholder of placeholders) {
    const value = extractPlaceholderValue(question, placeholder, template);
    if (value !== null) {
      values[placeholder] = value;
    }
  }

  // Calculate confidence based on how many placeholders were filled
  const filledCount = Object.keys(values).length;
  const totalCount = placeholders.length;
  const confidence = filledCount / totalCount;

  // Fill template SQL with extracted values
  const filledSQL = fillTemplateSQL(template.sqlPattern, values);

  return {
    values,
    confidence,
    filledSQL,
  };
}

/**
 * Extract a single placeholder value from question
 */
function extractPlaceholderValue(
  question: string,
  placeholder: string,
  template: QueryTemplate
): string | number | null {
  const questionLower = question.toLowerCase();
  const placeholderLower = placeholder.toLowerCase();

  // Get placeholder spec if available
  const spec = template.placeholdersSpec?.[placeholder];

  // Strategy 1: Use placeholder spec patterns if available
  if (spec?.patterns) {
    for (const pattern of spec.patterns) {
      const regex = new RegExp(pattern, "i");
      const match = questionLower.match(regex);
      if (match && match[1]) {
        return formatValue(match[1], spec.type);
      }
    }
  }

  // Strategy 2: Common placeholder extraction patterns
  const extractionPatterns = getExtractionPatterns(placeholderLower);
  for (const pattern of extractionPatterns) {
    const regex = new RegExp(pattern, "i");
    const match = question.match(regex);
    if (match && match[1]) {
      return formatValue(match[1], spec?.type || "string");
    }
  }

  // Strategy 3: Look for placeholder name in question
  // e.g., "city" placeholder in "patients in Auckland"
  if (placeholderLower === "city") {
    // Look for city names (capitalized words after "in")
    const cityMatch = question.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    if (cityMatch) {
      return cityMatch[1];
    }
  }

  if (placeholderLower === "status") {
    // Look for common status values
    const statusKeywords = ["active", "inactive", "pending", "discharged", "closed"];
    for (const keyword of statusKeywords) {
      if (questionLower.includes(keyword)) {
        return keyword.charAt(0).toUpperCase() + keyword.slice(1);
      }
    }
  }

  if (placeholderLower === "woundtype" || placeholderLower === "wound_type") {
    // Look for wound types
    const woundTypes = ["diabetic", "pressure", "venous", "arterial", "surgical"];
    for (const type of woundTypes) {
      if (questionLower.includes(type)) {
        return type.charAt(0).toUpperCase() + type.slice(1);
      }
    }
  }

  if (placeholderLower === "age" || placeholderLower === "min_age" || placeholderLower === "max_age") {
    // Look for numbers (age values)
    const ageMatch = question.match(/\b(\d{1,3})\s*(?:years?|y\.o\.|yo)/i);
    if (ageMatch) {
      return parseInt(ageMatch[1]);
    }
  }

  if (placeholderLower.includes("date") || placeholderLower.includes("time")) {
    // Look for time-related values
    const timeMatch = question.match(/(?:last|past)\s+(\d+)\s+(day|week|month|year)s?/i);
    if (timeMatch) {
      const value = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      return `${value} ${unit}${value > 1 ? 's' : ''}`;
    }
  }

  // Strategy 4: Use template examples to infer value location
  if (template.questionExamples && template.questionExamples.length > 0) {
    const inferredValue = inferValueFromExamples(
      question,
      placeholder,
      template.questionExamples
    );
    if (inferredValue !== null) {
      return inferredValue;
    }
  }

  return null;
}

/**
 * Get extraction patterns for common placeholder types
 */
function getExtractionPatterns(placeholder: string): string[] {
  const patterns: string[] = [];

  // Location-based
  if (placeholder.includes("city") || placeholder.includes("location")) {
    patterns.push(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    patterns.push(/\bfrom\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
    patterns.push(/\bat\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  }

  // Status-based
  if (placeholder.includes("status")) {
    patterns.push(/\b(active|inactive|pending|discharged|closed)\b/i);
    patterns.push(/with\s+(?:a\s+)?status\s+(?:of\s+)?["']?(\w+)["']?/i);
  }

  // Type-based
  if (placeholder.includes("type")) {
    patterns.push(/\b(diabetic|pressure|venous|arterial|surgical)\b/i);
    patterns.push(/of\s+type\s+["']?(\w+)["']?/i);
  }

  // Number-based
  if (placeholder.includes("age") || placeholder.includes("count") || placeholder.includes("number")) {
    patterns.push(/\b(\d+)\b/);
  }

  // Date/time-based
  if (placeholder.includes("date") || placeholder.includes("time") || placeholder.includes("period")) {
    patterns.push(/(?:last|past)\s+(\d+\s+\w+)/i);
    patterns.push(/(?:since|from)\s+([\d-]+)/);
  }

  return patterns;
}

/**
 * Infer placeholder value from template examples
 */
function inferValueFromExamples(
  question: string,
  placeholder: string,
  examples: string[]
): string | null {
  // This is a simplified implementation
  // In a real system, this would use NLP/LLM to align question with examples

  // For now, just try to find similar words between question and examples
  const questionWords = question.toLowerCase().split(/\s+/);

  for (const example of examples) {
    const exampleWords = example.toLowerCase().split(/\s+/);

    // Find words that appear in question but not in other examples
    for (const word of questionWords) {
      if (word.length > 3 && exampleWords.includes(word)) {
        // This might be a candidate value
        // Check if it's capitalized in the original question
        const originalWord = question.match(new RegExp(`\\b${word}\\b`, 'i'))?.[0];
        if (originalWord && /^[A-Z]/.test(originalWord)) {
          return originalWord;
        }
      }
    }
  }

  return null;
}

/**
 * Format value based on type
 */
function formatValue(
  value: string,
  type?: "string" | "number" | "date" | "boolean"
): string | number {
  if (!type || type === "string") {
    return value.trim();
  }

  if (type === "number") {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  }

  if (type === "boolean") {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "yes" || lower === "1") {
      return "true";
    }
    if (lower === "false" || lower === "no" || lower === "0") {
      return "false";
    }
  }

  return value.trim();
}

/**
 * Fill template SQL with placeholder values
 */
function fillTemplateSQL(sqlPattern: string, values: PlaceholderValues): string {
  let filledSQL = sqlPattern;

  // Replace placeholders in format {placeholder_name}
  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{${key}}`;
    const regex = new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g");

    // Determine if value needs quotes (string vs number)
    let formattedValue: string;
    if (typeof value === "number") {
      formattedValue = value.toString();
    } else if (value === "true" || value === "false") {
      formattedValue = value.toUpperCase();
    } else {
      formattedValue = `'${value}'`;
    }

    filledSQL = filledSQL.replace(regex, formattedValue);
  }

  // Check for any unfilled placeholders
  const unfilledPlaceholders = filledSQL.match(/\{[^}]+\}/g);
  if (unfilledPlaceholders) {
    console.warn(
      `[TemplatePlaceholder] Unfilled placeholders: ${unfilledPlaceholders.join(", ")}`
    );
    // Replace with NULL or remove the condition
    for (const placeholder of unfilledPlaceholders) {
      const regex = new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g");
      filledSQL = filledSQL.replace(regex, "NULL");
    }
  }

  return filledSQL;
}

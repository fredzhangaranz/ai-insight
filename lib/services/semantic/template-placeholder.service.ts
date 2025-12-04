// lib/services/semantic/template-placeholder.service.ts
// Template Placeholder Extraction and Filling for Phase 7B

import type { QueryTemplate } from "../query-template.service";
import type {
  PlaceholdersSpec,
  PlaceholdersSpecSlot,
} from "../template-validator.service";
import {
  createAssessmentTypeSearcher,
  type AssessmentTypeSearchResult,
} from "../context-discovery/assessment-type-searcher.service";
import { getInsightGenDbPool } from "@/lib/db";

export interface PlaceholderValues {
  [key: string]: string | number;
}

export interface PlaceholderExtractionResult {
  values: PlaceholderValues;
  confidence: number;
  filledSQL: string;
  missingPlaceholders: string[];
  clarifications: ClarificationRequest[];
  resolvedAssessmentTypes?: ResolvedAssessmentType[]; // For audit/debugging
}

export interface ResolvedAssessmentType {
  placeholder: string;
  originalText: string;
  assessmentTypeId: string;
  assessmentName: string;
  semanticConcept: string;
  confidence: number;
}

export interface ClarificationRequest {
  placeholder: string;
  prompt: string;
  examples?: string[];
  options?: string[];
}

/**
 * Extract placeholder values from user question and fill template
 *
 * @param question - User's natural language question
 * @param template - Query template to fill
 * @param customerId - Customer ID for assessment type resolution (optional)
 */
export async function extractAndFillPlaceholders(
  question: string,
  template: QueryTemplate,
  customerId?: string
): Promise<PlaceholderExtractionResult> {
  const slots = buildPlaceholderSlots(template);
  const placeholderNames =
    template.placeholders && template.placeholders.length > 0
      ? template.placeholders
      : slots.map((slot) => slot.rawName);

  const values: PlaceholderValues = {};
  const missingPlaceholders: string[] = [];
  const clarifications: ClarificationRequest[] = [];
  const resolvedAssessmentTypes: ResolvedAssessmentType[] = [];

  if (!placeholderNames || placeholderNames.length === 0) {
    return {
      values: {},
      confidence: 1.0,
      filledSQL: template.sqlPattern,
      missingPlaceholders,
      clarifications,
      resolvedAssessmentTypes,
    };
  }

  for (const placeholder of placeholderNames) {
    const slot = slots.find(
      (s) => normalizePlaceholderName(s.rawName) === normalizePlaceholderName(placeholder)
    );
    const resolution = await resolvePlaceholder(
      question,
      placeholder,
      template,
      slot,
      customerId
    );

    console.log(`[PlaceholderResolver] 📝 Resolution for "${placeholder}":`, {
      value: resolution.value,
      hasValue: resolution.value !== null && resolution.value !== undefined,
      required: slot?.required,
      shouldAddToMissing: slot?.required !== false,
    });

    if (resolution.value !== null && resolution.value !== undefined) {
      values[placeholder] = resolution.value;
      console.log(`[PlaceholderResolver] ✅ Filled "${placeholder}" = ${resolution.value}`);

      // Track resolved assessment types
      if (resolution.assessmentType) {
        resolvedAssessmentTypes.push(resolution.assessmentType);
      }
    } else if (slot?.required !== false) {
      console.log(`[PlaceholderResolver] ❌ Adding "${placeholder}" to missing (required=${slot?.required})`);
      missingPlaceholders.push(placeholder);
      if (resolution.clarification) {
        clarifications.push(resolution.clarification);
      }
    } else {
      console.log(`[PlaceholderResolver] ⏭️  Skipping "${placeholder}" (optional and no value)`);
    }
  }

  const filledCount = Object.keys(values).length;
  const totalCount = placeholderNames.length || 1;
  const confidence = filledCount / totalCount;
  const filledSQL = fillTemplateSQL(template.sqlPattern, values);

  return {
    values,
    confidence,
    filledSQL,
    missingPlaceholders,
    clarifications,
    resolvedAssessmentTypes: resolvedAssessmentTypes.length > 0 ? resolvedAssessmentTypes : undefined,
  };
}

/**
 * Extract a single placeholder value from question
 */
function extractPlaceholderValue(
  question: string,
  placeholder: string,
  template: QueryTemplate,
  slot?: NormalizedSlot
): string | number | null {
  const questionLower = question.toLowerCase();
  const placeholderLower = placeholder.toLowerCase();

  // Get placeholder spec if available
  const spec =
    slot ??
    findSpecSlot(
      template.placeholdersSpec,
      normalizePlaceholderName(placeholder)
    );

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

async function resolvePlaceholder(
  question: string,
  placeholder: string,
  template: QueryTemplate,
  slot?: NormalizedSlot,
  customerId?: string
): Promise<{
  value: string | number | null;
  clarification?: ClarificationRequest;
  assessmentType?: ResolvedAssessmentType;
}> {
  console.log(`[PlaceholderResolver] 🔄 Starting resolution for "${placeholder}"`);
  
  // Try specialized resolvers first (sync)
  const specialized = resolveWithSpecializedResolvers(
    question,
    placeholder,
    slot
  );
  if (specialized) {
    console.log(`[PlaceholderResolver] 📍 Specialized resolver found: value=${specialized.value}`);
    const checked = await applyValidators(
      specialized.value,
      placeholder,
      slot,
      specialized.clarification,
      customerId
    );
    // Only return early if we got a valid value (not null)
    // If validation failed (checked.value === null), continue to try other resolvers/default
    if (checked && checked.value !== null && checked.value !== undefined) {
      console.log(`[PlaceholderResolver] ✅ Specialized resolver validated`);
      return checked;
    }
    console.log(`[PlaceholderResolver] ❌ Specialized resolver failed validation, will try other resolvers`);
  }

  // Try assessment type resolution (async)
  if (customerId && shouldUseAssessmentTypeResolver(slot, placeholder)) {
    console.log(`[PlaceholderResolver] 🏷️  Trying assessment type resolver for "${placeholder}"`);
    const assessmentResolution = await resolveAssessmentTypePlaceholder(
      question,
      placeholder,
      customerId,
      slot
    );
    if (assessmentResolution.value !== null) {
      console.log(`[PlaceholderResolver] ✅ Assessment type resolved: ${assessmentResolution.value}`);
      return assessmentResolution;
    }
    console.log(`[PlaceholderResolver] ❌ Assessment type resolver returned null`);
  }

  // Try field variable resolution (async)
  if (customerId && shouldUseFieldVariableResolver(slot, placeholder)) {
    console.log(`[PlaceholderResolver] 🔍 Trying field variable resolver for "${placeholder}"`);
    const fieldResolution = await resolveFieldVariablePlaceholder(
      question,
      placeholder,
      customerId,
      slot
    );
    if (fieldResolution.value !== null) {
      console.log(`[PlaceholderResolver] ✅ Field variable resolved: ${fieldResolution.value}`);
      return fieldResolution;
    }
    console.log(`[PlaceholderResolver] ❌ Field variable resolver returned null`);
  }

  // Try generic extraction (sync)
  console.log(`[PlaceholderResolver] 🔎 Trying generic extraction for "${placeholder}"`);
  const value = extractPlaceholderValue(question, placeholder, template, slot);
  console.log(`[PlaceholderResolver] 📊 Generic extraction result: ${value}`);
  if (value !== null && value !== undefined) {
    const checked = await applyValidators(
      value,
      placeholder,
      slot,
      undefined,
      customerId
    );
    // Only return early if we got a valid value (not null)
    // If validation failed (checked.value === null), continue to try default
    if (checked && checked.value !== null && checked.value !== undefined) {
      console.log(`[PlaceholderResolver] ✅ Generic extraction validated: ${checked.value}`);
      return checked;
    }
    console.log(`[PlaceholderResolver] ❌ Generic extraction failed validation, will try default`);
  }

  // Try default value
  if (slot?.default !== undefined && slot.default !== null) {
    console.log(`[PlaceholderResolver] 🔧 Using default for "${placeholder}":`, {
      defaultValue: slot.default,
      slotName: slot.name,
      slotRequired: slot.required,
    });
    const checked = await applyValidators(
      slot.default as string | number,
      placeholder,
      slot,
      undefined,
      customerId
    );
    if (checked) {
      console.log(`[PlaceholderResolver] ✅ Default validated for "${placeholder}":`, {
        value: checked.value,
      });
      return checked;
    } else {
      console.log(`[PlaceholderResolver] ❌ Default failed validation for "${placeholder}"`);
    }
  }

  // Generate clarification
  const clarification = slot
    ? await buildClarification(placeholder, slot, undefined, customerId)
    : await buildClarification(placeholder, undefined, undefined, customerId);
  return { value: null, clarification };
}

function buildPlaceholderSlots(template: QueryTemplate): NormalizedSlot[] {
  const spec = template.placeholdersSpec as PlaceholdersSpec | null | undefined;
  
  console.log(`[PlaceholderSlots] Building slots for template "${template.name}":`, {
    hasSpec: !!spec,
    specType: typeof spec,
    specString: typeof spec === 'string' ? spec : undefined,
    slotCount: spec?.slots?.length || 0,
  });

  if (!spec?.slots || spec.slots.length === 0) return [];
  
  const slots = spec.slots
    .map((slot) => {
      if (!slot?.name) return null;
      const normalized = {
        ...slot,
        rawName: slot.name,
        normalizedName: normalizePlaceholderName(slot.name),
      } as NormalizedSlot;
      
      console.log(`[PlaceholderSlots] Slot "${slot.name}":`, {
        name: slot.name,
        type: slot.type,
        required: slot.required,
        default: slot.default,
        semantic: slot.semantic,
      });
      
      return normalized;
    })
    .filter((slot): slot is NormalizedSlot => Boolean(slot));
    
  return slots;
}

interface NormalizedSlot extends PlaceholdersSpecSlot {
  rawName: string;
  normalizedName: string;
}

interface SpecializedResolution {
  value: string | number | null;
  clarification?: ClarificationRequest;
}

// ============================================================================
// Assessment Type Resolution
// ============================================================================

/**
 * Semantic patterns that indicate an assessment type placeholder
 */
const ASSESSMENT_TYPE_SEMANTICS = new Set([
  "assessment_type",
  "assessmenttype",
  "assessment_concept",
  "assessmentconcept",
  "form_type",
  "formtype",
  "documentation_type",
  "documentationtype",
]);

/**
 * Keywords in placeholder names that suggest assessment type
 */
const ASSESSMENT_TYPE_KEYWORDS = [
  "assessment",
  "form",
  "documentation",
  "document",
  "record",
  "visit",
  "encounter",
];

/**
 * Check if placeholder should use assessment type resolver
 */
function shouldUseAssessmentTypeResolver(
  slot: NormalizedSlot | undefined,
  placeholder: string
): boolean {
  // Check slot semantic
  const semantic = slot?.semantic?.toLowerCase();
  if (semantic && ASSESSMENT_TYPE_SEMANTICS.has(semantic)) {
    return true;
  }

  // Check placeholder name
  const normalized = placeholder.toLowerCase();
  return ASSESSMENT_TYPE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );
}

/**
 * Extract assessment type keywords from question
 */
function extractAssessmentTypeKeywords(question: string): string[] {
  const lower = question.toLowerCase();
  const keywords: string[] = [];

  // Common assessment type patterns
  const patterns = [
    /\b(wound|visit|billing|intake|discharge|clinical|treatment|assessment|documentation)\s+(?:assessment|form|documentation|record)s?\b/gi,
    /\b(?:assessment|form|documentation|record)s?\s+(?:for|about|regarding)\s+(\w+)\b/gi,
    /\b(wound|visit|billing|intake|discharge|clinical)\s+(?:data|information)\b/gi,
  ];

  for (const pattern of patterns) {
    const matches = question.matchAll(pattern);
    for (const match of matches) {
      if (match[1]) {
        keywords.push(match[1].toLowerCase());
      }
    }
  }

  // Also check for standalone keywords
  const standaloneKeywords = [
    "wound",
    "visit",
    "billing",
    "superbill",
    "intake",
    "discharge",
    "clinical",
    "treatment",
    "consent",
    "demographics",
  ];

  for (const keyword of standaloneKeywords) {
    if (lower.includes(keyword) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }

  return keywords;
}

/**
 * Resolve assessment type placeholder using SemanticIndexAssessmentType
 *
 * Strategy:
 * 1. Extract assessment type keywords from question
 * 2. Search indexed assessment types using keywords
 * 3. Return best match (highest confidence)
 * 4. Store resolved assessment type for audit
 */
async function resolveAssessmentTypePlaceholder(
  question: string,
  placeholder: string,
  customerId: string,
  slot?: NormalizedSlot
): Promise<{
  value: string | number | null;
  clarification?: ClarificationRequest;
  assessmentType?: ResolvedAssessmentType;
}> {
  console.log(
    `[TemplatePlaceholder] Resolving assessment type for placeholder: ${placeholder}`
  );

  // Extract keywords from question
  const keywords = extractAssessmentTypeKeywords(question);

  if (keywords.length === 0) {
    console.log(
      `[TemplatePlaceholder] No assessment type keywords found in question`
    );
    return { value: null };
  }

  console.log(
    `[TemplatePlaceholder] Extracted keywords: ${keywords.join(", ")}`
  );

  // Search for matching assessment types
  const searcher = createAssessmentTypeSearcher(customerId);
  const results: AssessmentTypeSearchResult[] = [];

  for (const keyword of keywords) {
    const matches = await searcher.searchByKeywords(keyword);
    results.push(...matches);
  }

  if (results.length === 0) {
    console.log(
      `[TemplatePlaceholder] No matching assessment types found`
    );
    return { value: null };
  }

  // Sort by confidence and take best match
  results.sort((a, b) => b.confidence - a.confidence);
  const best = results[0];

  console.log(
    `[TemplatePlaceholder] Resolved to: ${best.assessmentName} (${best.semanticConcept}, confidence: ${best.confidence})`
  );

  // Create resolved assessment type for audit
  const resolvedAssessmentType: ResolvedAssessmentType = {
    placeholder,
    originalText: keywords.join(", "),
    assessmentTypeId: best.assessmentTypeId,
    assessmentName: best.assessmentName,
    semanticConcept: best.semanticConcept,
    confidence: best.confidence,
  };

  // Return assessment type ID as value
  return {
    value: best.assessmentTypeId,
    assessmentType: resolvedAssessmentType,
  };
}

// ============================================================================
// Field Variable Resolution
// ============================================================================

/**
 * Semantic patterns that indicate a field variable placeholder
 */
const FIELD_VARIABLE_SEMANTICS = new Set([
  "field_name",
  "fieldname",
  "column_name",
  "columnname",
  "field_variable",
  "fieldvariable",
  "status_field",
  "statusfield",
]);

/**
 * Keywords in placeholder names that suggest field variables
 */
const FIELD_VARIABLE_KEYWORDS = [
  "field",
  "column",
  "variable",
  "status",
  "state",
  "attribute",
];

/**
 * Check if placeholder should use field variable resolver
 */
function shouldUseFieldVariableResolver(
  slot: NormalizedSlot | undefined,
  placeholder: string
): boolean {
  // Check slot semantic
  const semantic = slot?.semantic?.toLowerCase();
  if (semantic && FIELD_VARIABLE_SEMANTICS.has(semantic)) {
    return true;
  }

  // Check placeholder name
  const normalized = placeholder.toLowerCase();
  return FIELD_VARIABLE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword)
  );
}

/**
 * Search for field by name pattern across both form and non-form fields
 */
async function searchFieldByName(
  customerId: string,
  fieldNamePattern: string
): Promise<{
  fieldName: string;
  fieldType: string;
  source: 'form' | 'nonform';
  semanticConcept?: string;
  enumValues?: string[];
} | null> {
  const pool = await getInsightGenDbPool();

  // Search in SemanticIndexField (form fields) first
  try {
    const formFieldQuery = `
      SELECT
        sif.field_name as "fieldName",
        sif.data_type as "fieldType",
        sif.semantic_concept as "semanticConcept",
        COALESCE(
          json_agg(sio.option_value ORDER BY sio.option_value)
          FILTER (WHERE sio.option_value IS NOT NULL),
          '[]'
        ) as "enumValues"
      FROM "SemanticIndexField" sif
      JOIN "SemanticIndex" si ON sif.semantic_index_id = si.id
      LEFT JOIN "SemanticIndexOption" sio ON sio.semantic_index_field_id = sif.id
      WHERE si.customer_id = $1
        AND LOWER(sif.field_name) LIKE LOWER($2)
      GROUP BY sif.id, sif.field_name, sif.data_type, sif.semantic_concept
      ORDER BY sif.confidence DESC NULLS LAST
      LIMIT 1
    `;

    const formResult = await pool.query(formFieldQuery, [customerId, `%${fieldNamePattern}%`]);

    if (formResult.rows.length > 0) {
      const row = formResult.rows[0];
      return {
        fieldName: row.fieldName,
        fieldType: row.fieldType || 'text',
        source: 'form',
        semanticConcept: row.semanticConcept,
        enumValues: Array.isArray(row.enumValues) ? row.enumValues : [],
      };
    }

    // Search in SemanticIndexNonForm (non-form fields)
    const nonFormFieldQuery = `
      SELECT
        sinf.field_name as "fieldName",
        sinf.field_type as "fieldType",
        sinf.semantic_concept as "semanticConcept",
        COALESCE(
          json_agg(sinfev.enum_value ORDER BY sinfev.usage_count DESC, sinfev.enum_value)
          FILTER (WHERE sinfev.enum_value IS NOT NULL AND sinfev.is_active = TRUE),
          '[]'
        ) as "enumValues"
      FROM "SemanticIndexNonForm" sinf
      LEFT JOIN "SemanticIndexNonFormEnumValue" sinfev ON sinfev.nonform_id = sinf.id
      WHERE sinf.customer_id = $1
        AND LOWER(sinf.field_name) LIKE LOWER($2)
      GROUP BY sinf.id, sinf.field_name, sinf.field_type, sinf.semantic_concept
      ORDER BY (sinf.embedding_count * sinf.assessment_count) DESC
      LIMIT 1
    `;

    const nonFormResult = await pool.query(nonFormFieldQuery, [customerId, `%${fieldNamePattern}%`]);

    if (nonFormResult.rows.length > 0) {
      const row = nonFormResult.rows[0];
      return {
        fieldName: row.fieldName,
        fieldType: row.fieldType || 'text',
        source: 'nonform',
        semanticConcept: row.semanticConcept,
        enumValues: Array.isArray(row.enumValues) ? row.enumValues : [],
      };
    }

    return null;
  } catch (error: any) {
    console.error(`[TemplatePlaceholder] Error searching for field:`, error);
    return null;
  }
}

/**
 * Extract field name pattern from question
 */
function extractFieldNamePattern(question: string, slot?: NormalizedSlot): string | null {
  const lower = question.toLowerCase();

  // Common patterns for field names
  const patterns = [
    /\b(?:status|state|type|category)\s+(?:of|for)\s+(\w+)/i,
    /\b(\w+)\s+(?:status|state|field|column)/i,
    /\bwhere\s+(\w+)\s*=/i,
    /\bby\s+(\w+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Check slot examples for hints
  if (slot?.examples && slot.examples.length > 0) {
    return String(slot.examples[0]);
  }

  return null;
}

/**
 * Resolve field variable placeholder using semantic field indexes
 *
 * Strategy:
 * 1. Extract field name pattern from question
 * 2. Search in SemanticIndexField (form fields)
 * 3. Search in SemanticIndexNonForm (non-form fields)
 * 4. Return field name, or enum value if field is enum type
 */
async function resolveFieldVariablePlaceholder(
  question: string,
  placeholder: string,
  customerId: string,
  slot?: NormalizedSlot
): Promise<{
  value: string | number | null;
  clarification?: ClarificationRequest;
}> {
  console.log(
    `[TemplatePlaceholder] Resolving field variable for placeholder: ${placeholder}`
  );

  // Extract field name pattern from question or slot
  const fieldPattern = extractFieldNamePattern(question, slot);

  if (!fieldPattern) {
    console.log(
      `[TemplatePlaceholder] No field name pattern found in question`
    );
    return { value: null };
  }

  console.log(
    `[TemplatePlaceholder] Extracted field pattern: ${fieldPattern}`
  );

  // Search for matching field
  const field = await searchFieldByName(customerId, fieldPattern);

  if (!field) {
    console.log(
      `[TemplatePlaceholder] No matching field found for pattern: ${fieldPattern}`
    );
    return { value: null };
  }

  console.log(
    `[TemplatePlaceholder] Resolved to field: ${field.fieldName} (${field.source}, type: ${field.fieldType})`
  );

  // Return field name as value
  return {
    value: field.fieldName,
  };
}

// ============================================================================
// Time Window Resolution
// ============================================================================

const TIME_UNIT_PATTERN =
  "(?:day|days|d|week|weeks|wk|wks|month|months|mo|mos|year|years|yr|yrs|quarter|quarters|qtr|qtrs)";

const TIME_WINDOW_SEMANTICS = new Set([
  "time_window",
  "timewindow",
  "time_point",
  "timepoint",
  "time_window_days",
]);

const TIME_UNIT_MULTIPLIERS: Record<string, number> = {
  day: 1,
  days: 1,
  d: 1,
  week: 7,
  weeks: 7,
  wk: 7,
  wks: 7,
  month: 30,
  months: 30,
  mo: 30,
  mos: 30,
  year: 365,
  years: 365,
  yr: 365,
  yrs: 365,
  quarter: 90,
  quarters: 90,
  qtr: 90,
  qtrs: 90,
};

const PERCENTAGE_SEMANTICS = new Set([
  "percentage",
  "percent",
  "percent_threshold",
  "percentage_threshold",
  "ratio",
  "decimal",
]);

const PERCENTAGE_KEYWORDS = [
  "percent",
  "percentage",
  "pct",
  "threshold",
  "ratio",
  "reduction",
  "improvement",
];

async function buildClarification(
  placeholder: string,
  slot?: NormalizedSlot,
  extraHint?: string,
  customerId?: string
): Promise<ClarificationRequest> {
  const promptParts = [`Please provide a value for "${placeholder}"`];
  if (slot?.description) {
    promptParts.push(`(${slot.description})`);
  } else if (slot?.semantic) {
    promptParts.push(`(${slot.semantic})`);
  }
  if (extraHint) {
    promptParts.push(extraHint);
  }

  // Try to pull enum values if this is a field variable placeholder
  let options: string[] | undefined;
  if (customerId && shouldUseFieldVariableResolver(slot, placeholder)) {
    try {
      // Extract field name pattern from placeholder name
      const fieldNamePattern = extractFieldNamePatternFromPlaceholder(placeholder);
      if (fieldNamePattern) {
        console.log(
          `[buildClarification] Searching for field with pattern: ${fieldNamePattern}`
        );
        const field = await searchFieldByName(customerId, fieldNamePattern);
        if (field && field.enumValues && field.enumValues.length > 0) {
          options = field.enumValues;
          console.log(
            `[buildClarification] Found ${options.length} enum values for ${placeholder}: ${options.join(", ")}`
          );
        }
      }
    } catch (error) {
      console.error(
        `[buildClarification] Error fetching enum values for ${placeholder}:`,
        error
      );
      // Continue without options - graceful degradation
    }
  }

  return {
    placeholder,
    prompt: promptParts.join(" "),
    examples: slot?.examples?.map((example) => String(example)),
    options,
  };
}

/**
 * Extract field name pattern from placeholder name for clarification lookup
 * Returns just the base name (e.g., "status" from "statusField")
 * searchFieldByName will add the SQL LIKE wildcards (%)
 */
function extractFieldNamePatternFromPlaceholder(
  placeholder: string
): string | null {
  const normalized = placeholder.toLowerCase();

  // Remove common suffixes: Field, Column, Variable, Name
  const cleanedName = normalized
    .replace(/(?:field|column|variable|name)$/i, "")
    .trim();

  if (cleanedName.length > 0) {
    return cleanedName;
  }

  // Fallback: use the placeholder name as-is
  return normalized;
}

function normalizePlaceholderName(name: string): string {
  return name.replace(/\[\]$/, "").replace(/\?$/, "").trim();
}

function resolveWithSpecializedResolvers(
  question: string,
  placeholder: string,
  slot?: NormalizedSlot
): SpecializedResolution | null {
  if (shouldUseTimeWindowResolver(slot, placeholder)) {
    const detected = detectTimeWindowValue(question, slot, placeholder);
    if (detected !== null) {
      return { value: detected };
    }
  }
  if (shouldUsePercentageResolver(slot, placeholder)) {
    const detectedPercentage = detectPercentageValue(question);
    if (detectedPercentage !== null) {
      return { value: detectedPercentage };
    }
  }
  return null;
}

function shouldUseTimeWindowResolver(
  slot: NormalizedSlot | undefined,
  placeholder: string
): boolean {
  const semantic = slot?.semantic?.toLowerCase();
  if (semantic && TIME_WINDOW_SEMANTICS.has(semantic)) {
    return true;
  }

  const normalized = placeholder.toLowerCase();
  return (
    normalized.includes("time") ||
    normalized.includes("day") ||
    normalized.includes("week") ||
    normalized.includes("month") ||
    normalized.includes("window")
  );
}

function detectTimeWindowValue(
  question: string,
  slot?: NormalizedSlot,
  placeholder?: string
): number | null {
  const isTolerance = isTolerancePlaceholder(slot, placeholder);
  const patterns = isTolerance
    ? [
        new RegExp(
          `(?:within|inside|tolerance\\s+(?:of)?|window\\s+(?:of)?|±|\\+/-)\\s*(\\d+(?:\\.\\d+)?)\\s*[- ]?(${TIME_UNIT_PATTERN})\\b`,
          "i"
        ),
      ]
    : [
        new RegExp(
          `(?:last|past|within|in|over|during|around|about|after|approximately)\\s+(\\d+(?:\\.\\d+)?)\\s*[- ]?(${TIME_UNIT_PATTERN})\\b`,
          "i"
        ),
        new RegExp(
          `\\b(\\d+(?:\\.\\d+)?)\\s*[- ]?(${TIME_UNIT_PATTERN})\\b`,
          "i"
        ),
      ];
  const source = question.toLowerCase();

  for (const regex of patterns) {
    const match = source.match(regex);
    if (!match) continue;
    const amount = parseFloat(match[1]);
    if (!Number.isFinite(amount)) continue;
    const unit = match[2]?.toLowerCase();
    if (!unit) continue;
    const multiplier = TIME_UNIT_MULTIPLIERS[unit];
    if (!multiplier) continue;
    const days = Math.round(amount * multiplier);
    if (days <= 0) continue;
    return days;
  }

  return null;
}

function isTolerancePlaceholder(
  slot: NormalizedSlot | undefined,
  placeholder?: string
): boolean {
  const normalized =
    placeholder?.toLowerCase() ?? slot?.rawName?.toLowerCase() ?? "";
  return normalized.includes("tolerance") || normalized.includes("window");
}

function shouldUsePercentageResolver(
  slot: NormalizedSlot | undefined,
  placeholder?: string
): boolean {
  const semantic = slot?.semantic?.toLowerCase();
  if (semantic && PERCENTAGE_SEMANTICS.has(semantic)) {
    return true;
  }
  const normalized =
    placeholder?.toLowerCase() ?? slot?.rawName?.toLowerCase() ?? "";
  return PERCENTAGE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function detectPercentageValue(question: string): number | null {
  const percentRegex =
    /(\d+(?:\.\d+)?)\s*(?:%|percent(?:age)?|pct)/i;
  const percentMatch = question.match(percentRegex);
  if (percentMatch) {
    const normalized = normalizePercentageValue(
      parseFloat(percentMatch[1]),
      true
    );
    if (normalized !== null) {
      return normalized;
    }
  }

  const decimalRegex = /(?:^|[^0-9])(0?\.\d+)/;
  const decimalMatch = question.match(decimalRegex);
  if (decimalMatch) {
    const normalized = normalizePercentageValue(
      parseFloat(decimalMatch[1]),
      false
    );
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function normalizePercentageValue(
  raw: number,
  fromPercent: boolean
): number | null {
  if (!Number.isFinite(raw)) {
    return null;
  }
  let value = raw;
  if (fromPercent) {
    value = raw / 100;
  }
  if (value < 0 || value > 1) {
    return null;
  }
  return Number(value);
}

async function applyValidators(
  rawValue: string | number | null | undefined,
  placeholder: string,
  slot?: NormalizedSlot,
  fallbackClarification?: ClarificationRequest,
  customerId?: string
): Promise<{
  value: string | number | null;
  clarification?: ClarificationRequest;
} | null> {
  if (rawValue === null || rawValue === undefined) {
    return fallbackClarification
      ? { value: null, clarification: fallbackClarification }
      : null;
  }

  if (!slot) {
    return { value: rawValue };
  }

  const validation = enforceSlotValidators(rawValue, slot);
  if (!validation.valid) {
    return {
      value: null,
      clarification: await buildClarification(
        placeholder,
        slot,
        validation.message,
        customerId
      ),
    };
  }

  return { value: validation.value ?? rawValue };
}

interface SlotValidationResult {
  valid: boolean;
  value?: string | number;
  message?: string;
}

function enforceSlotValidators(
  value: string | number,
  slot: NormalizedSlot
): SlotValidationResult {
  let normalizedValue: string | number = value;
  const type = slot.type?.toLowerCase();

  if (type && ["int", "float", "decimal", "number"].includes(type)) {
    const numeric = coerceToNumber(value);
    if (numeric === null) {
      return { valid: false, message: "Enter a numeric value" };
    }
    normalizedValue = type === "int" ? Math.round(numeric) : numeric;
  }

  if (Array.isArray(slot.validators)) {
    for (const rawRule of slot.validators) {
      const rule = rawRule?.trim().toLowerCase();
      if (!rule) continue;
      if (rule === "non-empty") {
        if (
          normalizedValue === "" ||
          normalizedValue === null ||
          normalizedValue === undefined
        ) {
          return { valid: false, message: "Value cannot be empty" };
        }
        continue;
      }
      const minMatch = rule.match(/^min:(-?\d+(?:\.\d+)?)$/);
      if (minMatch) {
        const min = parseFloat(minMatch[1]);
        const numeric = coerceToNumber(normalizedValue);
        if (numeric === null || numeric < min) {
          return {
            valid: false,
            message: `Value must be at least ${min}`,
          };
        }
        continue;
      }
      const maxMatch = rule.match(/^max:(-?\d+(?:\.\d+)?)$/);
      if (maxMatch) {
        const max = parseFloat(maxMatch[1]);
        const numeric = coerceToNumber(normalizedValue);
        if (numeric === null || numeric > max) {
          return {
            valid: false,
            message: `Value must be at most ${max}`,
          };
        }
      }
    }
  }

  return { valid: true, value: normalizedValue };
}

function coerceToNumber(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function findSpecSlot(
  spec: PlaceholdersSpec | null | undefined,
  normalizedPlaceholder: string
): PlaceholdersSpecSlot | undefined {
  if (!spec?.slots) return undefined;
  return spec.slots.find((slot) => {
    if (!slot?.name) return false;
    return (
      normalizePlaceholderName(slot.name) === normalizedPlaceholder
    );
  });
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

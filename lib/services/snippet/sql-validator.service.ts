/**
 * SQL Validator Service (Task 4.S8)
 * 
 * Validates that generated SQL:
 * 1. Uses provided snippets (detects by CTE names and key columns)
 * 2. Includes required filters in WHERE clause
 * 3. Maintains expected structure
 * 
 * Philosophy: Use heuristics + regex to detect snippet/filter usage without full SQL parsing
 */

import type { SnippetMatch } from "../semantic/template-matcher.service";
import type { ResidualFilter } from "./residual-filter-validator.service";

/**
 * Result of SQL validation
 */
export interface SQLValidationResult {
  verdict: "pass" | "clarify" | "reject";
  usedSnippets: string[]; // Snippet IDs found in SQL
  missingSnippets: string[]; // Required snippet IDs not found
  appliedFilters: ResidualFilter[]; // Filters found in WHERE clause
  droppedFilters: ResidualFilter[]; // Required filters missing
  errors: string[]; // Human-readable error messages
  warnings: string[]; // Non-fatal issues
  details: {
    cteNames: string[]; // CTEs detected in SQL
    hasWhereClause: boolean;
    whereClauseContent?: string;
  };
}

/**
 * Main SQL Validator Service
 */
export class SQLValidatorService {
  /**
   * Validate generated SQL against snippets and filters
   * 
   * @param sql - Generated SQL to validate
   * @param providedSnippets - Snippets that should have been used
   * @param residualFilters - Required filters that should be in WHERE clause
   * @returns Validation result with verdict and details
   */
  validateGeneratedSQL(
    sql: string,
    providedSnippets: SnippetMatch[],
    residualFilters: ResidualFilter[]
  ): SQLValidationResult {
    console.log(
      `[SQLValidator] 🔍 Validating SQL against ${providedSnippets.length} snippet(s) and ${residualFilters.length} filter(s)`
    );

    const result: SQLValidationResult = {
      verdict: "pass",
      usedSnippets: [],
      missingSnippets: [],
      appliedFilters: [],
      droppedFilters: [],
      errors: [],
      warnings: [],
      details: {
        cteNames: [],
        hasWhereClause: false,
      },
    };

    if (!sql || sql.trim().length === 0) {
      result.errors.push("SQL is empty or null");
      result.verdict = "reject";
      return result;
    }

    const sqlLower = sql.toLowerCase();

    // Step 1: Extract CTE names from SQL
    const cteNames = this.extractCTENames(sql);
    result.details.cteNames = cteNames;
    console.log(`[SQLValidator] Found CTEs: ${cteNames.join(", ") || "none"}`);

    // Step 2: Check if WHERE clause exists
    const { hasWhereClause, whereClauseContent } =
      this.extractWhereClause(sql);
    result.details.hasWhereClause = hasWhereClause;
    result.details.whereClauseContent = whereClauseContent;
    console.log(`[SQLValidator] Has WHERE clause: ${hasWhereClause}`);

    // Step 3: Validate snippet usage
    console.log(`[SQLValidator] 📚 Checking snippet usage...`);
    for (const snippet of providedSnippets) {
      const isUsed = this.isSnippetUsed(sql, snippet);
      if (isUsed) {
        result.usedSnippets.push(snippet.snippet.id);
        console.log(`[SQLValidator] ✅ Found snippet: ${snippet.snippet.id}`);
      } else {
        result.missingSnippets.push(snippet.snippet.id);
        console.log(
          `[SQLValidator] ❌ Missing snippet: ${snippet.snippet.id}`
        );
      }
    }

    // Step 4: Validate filter presence
    console.log(`[SQLValidator] 🔒 Checking filter presence...`);
    for (const filter of residualFilters) {
      const isPresent = this.isFilterPresent(sql, filter);
      if (isPresent) {
        result.appliedFilters.push(filter);
        console.log(`[SQLValidator] ✅ Found filter: ${filter.field}`);
      } else {
        // Only add to droppedFilters if marked as required
        if (filter.required) {
          result.droppedFilters.push(filter);
          result.errors.push(
            `Required filter missing: ${filter.field} (from "${filter.originalText}")`
          );
          console.log(
            `[SQLValidator] ❌ Missing required filter: ${filter.field}`
          );
        } else {
          result.warnings.push(
            `Optional filter not found: ${filter.field} (from "${filter.originalText}")`
          );
          console.log(
            `[SQLValidator] ⚠️ Missing optional filter: ${filter.field}`
          );
        }
      }
    }

    // Step 5: Determine verdict
    console.log(`[SQLValidator] 🎯 Determining verdict...`);
    if (result.droppedFilters.length > 0) {
      result.verdict = "reject";
      console.log(
        `[SQLValidator] ❌ REJECT: ${result.droppedFilters.length} required filter(s) missing`
      );
    } else if (result.missingSnippets.length > 0) {
      result.verdict = "clarify";
      result.warnings.push(
        `${result.missingSnippets.length} snippet(s) not detected in SQL`
      );
      console.log(
        `[SQLValidator] ⚠️ CLARIFY: ${result.missingSnippets.length} snippet(s) not used`
      );
    } else {
      result.verdict = "pass";
      console.log(
        `[SQLValidator] ✅ PASS: All snippets and required filters found`
      );
    }

    return result;
  }

  /**
   * Extract CTE names from SQL
   * Detects: WITH name AS (...), WITH a AS (...), b AS (...)
   */
  private extractCTENames(sql: string): string[] {
    const ctePattern = /WITH\s+(\w+)\s+AS\s*\(|,\s*(\w+)\s+AS\s*\(/gi;
    const names: string[] = [];
    let match;

    while ((match = ctePattern.exec(sql)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        names.push(name);
      }
    }

    // Also detect subsequent CTEs without WITH keyword
    const cteOnlyPattern = /,\s*(\w+)\s+AS\s*\(/g;
    while ((match = cteOnlyPattern.exec(sql)) !== null) {
      const name = match[1];
      if (name && !names.includes(name)) {
        names.push(name);
      }
    }

    return names;
  }

  /**
   * Extract WHERE clause content from SQL
   * Returns: { hasWhereClause, whereClauseContent }
   */
  private extractWhereClause(
    sql: string
  ): { hasWhereClause: boolean; whereClauseContent?: string } {
    const wherePattern = /WHERE\s+([\s\S]*?)(?:ORDER BY|GROUP BY|HAVING|LIMIT|$)/i;
    const match = sql.match(wherePattern);

    if (match && match[1]) {
      return {
        hasWhereClause: true,
        whereClauseContent: match[1].trim(),
      };
    }

    return { hasWhereClause: false };
  }

  /**
   * Check if a snippet was used in SQL
   * Uses CTE name detection and key column detection
   */
  private isSnippetUsed(sql: string, snippet: SnippetMatch): boolean {
    const sqlLower = sql.toLowerCase();

    // Heuristic 1: Check if any output CTE name is used
    const outputs = snippet.snippet.sqlPattern
      .match(/\b(\w+)\s+AS\s*\(/gi)
      ?.map((m) => m.replace(/\s+as\s*\(/i, "").toLowerCase());

    if (outputs && outputs.length > 0) {
      for (const output of outputs) {
        if (sqlLower.includes(output)) {
          return true;
        }
      }
    }

    // Heuristic 2: Check for key column names from requiredContext
    if (
      snippet.snippet.requiredContext &&
      snippet.snippet.requiredContext.length > 0
    ) {
      const contextKeywords = snippet.snippet.requiredContext.map((c) =>
        c.toLowerCase()
      );
      const keywordMatches = contextKeywords.filter((keyword) =>
        sqlLower.includes(keyword)
      ).length;

      // If 50%+ of context keywords found, likely using snippet
      if (keywordMatches >= contextKeywords.length * 0.5) {
        return true;
      }
    }

    // Heuristic 3: Check for specific calculation patterns
    // Example: "area reduction" formula pattern
    if (
      snippet.snippet.id.includes("reduction") &&
      sqlLower.includes("area")
    ) {
      return true;
    }

    // Heuristic 4: Check if snippet purpose keywords appear in SQL
    const purposeKeywords = (snippet.snippet.description || "")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    const matchedKeywords = purposeKeywords.filter((keyword) =>
      sqlLower.includes(keyword)
    ).length;

    // If 40%+ of purpose keywords found, likely relevant
    if (matchedKeywords >= purposeKeywords.length * 0.4) {
      return true;
    }

    return false;
  }

  /**
   * Check if a filter is present in SQL WHERE clause
   * Uses field name detection in WHERE clause
   */
  private isFilterPresent(sql: string, filter: ResidualFilter): boolean {
    const sqlLower = sql.toLowerCase();
    const fieldLower = filter.field.toLowerCase();

    // Heuristic 1: Check if field name appears with an operator
    const operators = ["=", "<>", "!=", ">", "<", ">=", "<=", "in", "like"];
    for (const op of operators) {
      const pattern = new RegExp(
        `\\b${fieldLower}\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i"
      );
      if (pattern.test(sql)) {
        return true;
      }
    }

    // Heuristic 2: Check if field is in WHERE clause specifically
    const { whereClauseContent } = this.extractWhereClause(sql);
    if (whereClauseContent) {
      const wherePattern = new RegExp(`\\b${fieldLower}\\b`, "i");
      if (wherePattern.test(whereClauseContent)) {
        return true;
      }
    }

    // Heuristic 3: Check for field with underscore variations
    // Example: patient_gender could appear as "patient.gender" or just "gender"
    const fieldParts = fieldLower.split("_");
    if (fieldParts.length > 1) {
      // Check for table.field format
      for (const part of fieldParts) {
        const variations = [
          `\\.${part}\\b`, // .field
          `\\b${part}\\b`, // field
        ];
        for (const variation of variations) {
          const pattern = new RegExp(variation, "i");
          if (
            whereClauseContent &&
            pattern.test(whereClauseContent)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

/**
 * Singleton instance
 */
let validatorInstance: SQLValidatorService | null = null;

/**
 * Get singleton instance
 */
export function getSQLValidatorService(): SQLValidatorService {
  if (!validatorInstance) {
    validatorInstance = new SQLValidatorService();
  }
  return validatorInstance;
}

/**
 * Convenience function for validation
 */
export async function validateGeneratedSQL(
  sql: string,
  providedSnippets: SnippetMatch[],
  residualFilters: ResidualFilter[]
): Promise<SQLValidationResult> {
  const validator = getSQLValidatorService();
  return validator.validateGeneratedSQL(sql, providedSnippets, residualFilters);
}


/**
 * Utilities for cleaning and normalizing SQL queries before execution.
 * Removes markdown code blocks, leading comments, and normalizes whitespace.
 */

/**
 * Removes markdown code blocks (```sql ... ```) that may wrap SQL queries.
 * Also trims leading/trailing whitespace.
 */
export function cleanSqlQuery(sql: string): string {
  let cleaned = sql.trim();
  // Remove leading markdown code block
  cleaned = cleaned.replace(/^```(?:sql|text)?\s*\n?/i, "");
  // Remove trailing markdown code block
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

/**
 * Removes leading SQL comments (line and block) so validation can inspect
 * the first statement keyword.
 */
export function stripLeadingComments(sqlQuery: string): string {
  let result = sqlQuery;
  let previous: string;

  // Remove consecutive leading comments/blank lines
  do {
    previous = result;
    result = result
      // Strip leading line comments
      .replace(/^(?:\s*--.*\n)+/u, "")
      // Strip leading block comments
      .replace(/^\s*\/\*[\s\S]*?\*\/\s*/u, "");
  } while (result !== previous);

  return result;
}

/**
 * Normalizes SQL query by removing leading comments and whitespace,
 * then validates it starts with SELECT or WITH.
 * Used for security validation before execution.
 */
export function normalizeSqlForValidation(sqlQuery: string): string {
  const strippedQuery = stripLeadingComments(sqlQuery).trimStart();
  // Remove leading semicolons and whitespace
  return strippedQuery.replace(/^[;\s]+/, "").trim();
}

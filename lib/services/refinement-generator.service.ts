import type { InsightResult } from "@/lib/hooks/useInsights";

/**
 * Generate context-aware refinement suggestions based on result data and SQL.
 */
export function generateRefinements(result?: InsightResult): string[] {
  if (!result || !result.results || !result.sql) {
    return [];
  }

  const refinements: string[] = [];
  const sql = result.sql;
  const rowCount = result.results.rows.length;

  refinements.push("Explain what you found");

  if (rowCount > 10) {
    refinements.push("Show only top 10 results");
  }

  if (rowCount > 50) {
    refinements.push("Show only top 5 results");
  }

  if (/DATEADD|DATEDIFF/i.test(sql)) {
    if (!/MONTH.*6/i.test(sql)) {
      refinements.push("Change to last 6 months");
    }
    if (!/YEAR.*1/i.test(sql)) {
      refinements.push("Change to last year");
    }
    if (!/DAY.*30/i.test(sql)) {
      refinements.push("Change to last 30 days");
    }
  }

  if (/isActive\s*=\s*1|isActive\s*=\s*true/i.test(sql)) {
    refinements.push("Include inactive records too");
  }

  if (result.results.columns.length < 5) {
    refinements.push("Add more columns");
  }

  if (!/ORDER BY/i.test(sql)) {
    refinements.push("Sort the results");
  }

  if (/WHERE/i.test(sql)) {
    refinements.push("Remove all filters");
  }

  return refinements.slice(0, 5);
}

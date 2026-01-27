import type { InsightResult } from "@/lib/hooks/useInsights";
import type { SmartSuggestion } from "@/lib/types/conversation";

/**
 * Generate smart follow-up suggestions based on query result.
 */
export function generateSmartSuggestions(
  result?: InsightResult
): SmartSuggestion[] {
  if (!result || !result.results || !result.sql) {
    if (process.env.NODE_ENV === "development") {
      console.log("[generateSmartSuggestions] Early return - missing data:", {
        has_result: !!result,
        has_sql: !!result?.sql,
        has_results: !!result?.results,
      });
    }
    return [];
  }

  const suggestions: SmartSuggestion[] = [];
  const sql = result.sql;
  const { columns, rows } = result.results;

  if (process.env.NODE_ENV === "development") {
    console.log("[generateSmartSuggestions] Processing with data:", {
      sql_length: sql.length,
      columns: columns,
      rows_length: rows.length,
    });
  }

  const hasAggregation = /COUNT|SUM|AVG|MAX|MIN/i.test(sql);
  const hasGroupBy = /GROUP BY/i.test(sql);
  const hasTimeColumn = columns.some((col) =>
    /date|time|created|updated/i.test(col)
  );
  const hasPatientId = columns.some((col) => /patient/i.test(col));
  const hasWoundData = columns.some((col) =>
    /wound|area|depth|size/i.test(col)
  );

  if (hasAggregation && hasGroupBy && rows.length > 0) {
    suggestions.push({
      text: "Show me the individual records",
      category: "drill_down",
      confidence: 0.9,
    });
  }

  if (hasTimeColumn) {
    suggestions.push({
      text: "Compare to previous period",
      category: "time_shift",
      confidence: 0.85,
    });

    if (hasGroupBy) {
      suggestions.push({
        text: "Show monthly breakdown",
        category: "aggregation",
        confidence: 0.8,
      });
    }
  }

  if (hasPatientId && !hasAggregation && rows.length > 0) {
    suggestions.push({
      text: "Which ones are improving?",
      category: "follow_up",
      confidence: 0.85,
    });

    suggestions.push({
      text: "Group by clinic or location",
      category: "aggregation",
      confidence: 0.75,
    });
  }

  if (hasWoundData) {
    suggestions.push({
      text: "Show healing rates",
      category: "aggregation",
      confidence: 0.8,
    });

    if (!hasAggregation && rows.length > 1) {
      suggestions.push({
        text: "Find outliers",
        category: "follow_up",
        confidence: 0.75,
      });
    }
  }

  // Fallback: If we have results but no specific suggestions matched, provide generic ones
  if (suggestions.length === 0 && rows.length > 0) {
    if (hasAggregation) {
      // For aggregation queries, suggest drilling down
      suggestions.push({
        text: "Show me the individual records",
        category: "drill_down",
        confidence: 0.7,
      });
    }

    // Always suggest time-based analysis if we have any data
    suggestions.push({
      text: "Show trends over time",
      category: "time_shift",
      confidence: 0.65,
    });

    // Suggest grouping/aggregation variations
    suggestions.push({
      text: "Break down by category",
      category: "aggregation",
      confidence: 0.6,
    });

    // Suggest filtering
    suggestions.push({
      text: "Filter by additional criteria",
      category: "filter",
      confidence: 0.55,
    });
  }

  const finalSuggestions = suggestions
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    .slice(0, 4);

  if (process.env.NODE_ENV === "development") {
    console.log("[generateSmartSuggestions] Generated", finalSuggestions.length, "suggestions");
  }

  return finalSuggestions;
}

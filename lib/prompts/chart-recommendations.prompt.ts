import type { ChartType } from "@/lib/chart-contracts";

/**
 * Constructs the system prompt for chart recommendations based on SQL results.
 */
export function constructChartRecommendationsPrompt(
  subQuestion: string,
  sqlQuery: string,
  queryResults: any[],
  assessmentFormDefinition: any,
  databaseSchemaContext: string
): string {
  return `
You are an expert data visualization specialist. Your task is to analyze SQL query results and recommend the best chart type and data mappings for visualization.

CONTEXT:
- Sub-question: "${subQuestion}"
- SQL Query: \`\`\`sql
${sqlQuery}
\`\`\`
- Query Results: ${JSON.stringify(queryResults.slice(0, 10), null, 2)}${
    queryResults.length > 10
      ? `\n(Showing first 10 of ${queryResults.length} rows)`
      : ""
  }
- Assessment Form Definition: ${JSON.stringify(
    assessmentFormDefinition,
    null,
    2
  )}
- Database Schema Context: ${databaseSchemaContext}

TASK:
Analyze the SQL query and its results to recommend the best chart type and provide mappings for all suitable chart types.

RESPONSE FORMAT:
You MUST return a single JSON object with these keys:
{
  "recommendedChartType": "bar" | "line" | "pie" | "kpi" | "table",
  "availableMappings": {
    "bar"?: { "category": "columnName", "value": "columnName" },
    "line"?: { "x": "columnName", "y": "columnName" },
    "pie"?: { "label": "columnName", "value": "columnName" },
    "kpi"?: { "label": "columnName", "value": "columnName" },
    "table"?: { "columns": [{ "key": "columnName", "header": "Display Name" }] }
  },
  "explanation": "Explanation of why this chart type is recommended",
  "chartTitle": "Suggested title for the chart"
}

CHART TYPE GUIDELINES:

1. Bar Charts:
   - Best for: Category comparisons, distributions, rankings
   - Use when: You have distinct categories with numeric values
   - Example: Count of wounds by etiology, average healing time by treatment type
   - Required mapping: { "category": "columnName", "value": "columnName" }

2. Line Charts:
   - Best for: Time series, trends over time, continuous data
   - Use when: You have date/time data on x-axis and numeric values on y-axis
   - Example: Wound area measurements over time, healing trends
   - Required mapping: { "x": "columnName", "y": "columnName" }

3. Pie Charts:
   - Best for: Part-to-whole relationships, proportions
   - Use when: You have categories that sum to a meaningful total
   - Example: Distribution of wound types, percentage breakdowns
   - Required mapping: { "label": "columnName", "value": "columnName" }

4. KPI Cards:
   - Best for: Single important metrics, key performance indicators
   - Use when: You have one primary value to highlight
   - Example: Average healing time, total patient count
   - Required mapping: { "label": "columnName", "value": "columnName" }

5. Tables:
   - Best for: Detailed raw data, when no clear visualization pattern exists
   - Use when: Data is too complex for simple charts or user needs to see exact values
   - Example: Detailed patient records, complex aggregations
   - Optional mapping: { "columns": [{ "key": "columnName", "header": "Display Name" }] }

ANALYSIS STEPS:
1. Examine the SQL query to understand what data is being retrieved
2. Analyze the query results structure and data types
3. Identify the primary purpose of the visualization (comparison, trend, distribution, etc.)
4. Consider the number of data points and their characteristics
5. Recommend the most appropriate chart type
6. Provide mappings for all suitable chart types
7. Suggest a clear, descriptive chart title

IMPORTANT:
- Only include chart types that are suitable for the data structure
- Ensure column names in mappings match the actual column names in the results
- Provide clear explanations for your recommendations
- Consider the user's question and the data context when choosing chart types
`;
}

/**
 * Validates the AI response for chart recommendations.
 */
export function validateChartRecommendationsResponse(response: any): boolean {
  if (!response || typeof response !== "object") {
    return false;
  }

  const requiredFields = [
    "recommendedChartType",
    "availableMappings",
    "explanation",
    "chartTitle",
  ];
  for (const field of requiredFields) {
    if (!(field in response) || typeof response[field] !== "string") {
      return false;
    }
  }

  // Validate recommendedChartType
  const validChartTypes: ChartType[] = ["bar", "line", "pie", "kpi", "table"];
  if (!validChartTypes.includes(response.recommendedChartType)) {
    return false;
  }

  // Validate availableMappings
  if (
    !response.availableMappings ||
    typeof response.availableMappings !== "object"
  ) {
    return false;
  }

  // Validate that at least the recommended chart type has a mapping
  if (!response.availableMappings[response.recommendedChartType]) {
    return false;
  }

  return true;
}

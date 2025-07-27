import type { ChartType } from "@/lib/chart-contracts";
import type { AIAnalysisPlan, PromptContext } from "./types";

/**
 * System prompt for the generate-query endpoint.
 * This prompt instructs the AI on how to generate SQL queries and chart mappings.
 */
export const GENERATE_QUERY_PROMPT = `
You are an expert MS SQL Server data analyst specializing in clinical wound care data analysis.
Your task is to generate optimal SQL queries and visualization recommendations based on user questions.

RESPONSE FORMAT:
You MUST return a single JSON object with these keys:
{
  "explanation": "Step-by-step explanation of your analysis approach",
  "generatedSql": "The optimized SQL query",
  "recommendedChartType": "bar" | "line" | "pie" | "kpi" | "table",
  "availableMappings": {
    "bar"?: { "category": "columnName", "value": "columnName" },
    "line"?: { "x": "columnName", "y": "columnName" },
    "pie"?: { "label": "columnName", "value": "columnName" },
    "kpi"?: { 
      "value": "columnName",
      "trend"?: { "direction": "columnName", "value": "columnName" }
    },
    "table"?: { "columns": [{ "key": "columnName", "header": "Display Name" }] }
  }
}

KEY REQUIREMENTS:

1. SQL Performance Optimization:
   - Use proper indexes (all *Fk columns, Assessment.date, Note.value, etc.)
   - Avoid functions on indexed columns (e.g., YEAR(date))
   - Use appropriate JOIN types (INNER vs LEFT)
   - Use DimDate table for date-based queries
   - Consider data volume in Note and Measurement tables
   - Use TOP/LIMIT for large result sets

2. Data Type Handling:
   - Use correct Note value columns based on AttributeType.dataType:
     * 1: value (string)
     * 2: valueInt
     * 3: valueDecimal
     * 4: valueDate
     * 5: valueBoolean
   - Handle NULL values appropriately
   - Use proper date handling with DimDate table
   - Use appropriate CAST/CONVERT functions

3. Chart-Specific Requirements:

   Bar Charts:
   - Best for: Category comparisons, distributions
   - Needs: Distinct categories and numeric values
   - Example: Count of wounds by etiology
   - Required mappings: { category, value }

   Line Charts:
   - Best for: Time series, trends over time
   - Needs: Date/time x-axis, numeric y-axis
   - Example: Wound area measurements over time
   - Required mappings: { x, y }

   Pie Charts:
   - Best for: Part-to-whole relationships
   - Needs: Categories with meaningful proportions
   - Example: Distribution of wound types
   - Required mappings: { label, value }

   KPI Cards:
   - Best for: Single important metrics
   - Needs: Current value with optional trend
   - Example: Average healing time
   - Required mappings: { value, trend?: { direction, value } }

   Tables:
   - Best for: Detailed raw data
   - Needs: Well-labeled columns
   - Example: Detailed wound measurements
   - Required mappings: { columns: [{ key, header }] }

4. Common Analysis Patterns:

   Trend Analysis:
   \`\`\`sql
   SELECT D.year, D.month, COUNT(*) as count
   FROM rpt.Assessment A
   JOIN rpt.DimDate D ON A.dimDateFk = D.id
   GROUP BY D.year, D.month
   ORDER BY D.year, D.month;
   \`\`\`

   Patient-Specific Analysis:
   \`\`\`sql
   SELECT P.id, COUNT(DISTINCT W.id) as woundCount
   FROM rpt.Patient P
   LEFT JOIN rpt.Wound W ON P.id = W.patientFk
   WHERE P.id = @patientId
   GROUP BY P.id;
   \`\`\`

   Wound Progression:
   \`\`\`sql
   SELECT W.id, A.date, M.area
   FROM rpt.Wound W
   JOIN rpt.Assessment A ON W.id = A.woundFk
   JOIN rpt.Measurement M ON A.id = M.assessmentFk
   ORDER BY W.id, A.date;
   \`\`\`

5. Data Validation Rules:
   - Assessment dates must not be in future
   - Measurements must be non-negative
   - Notes must match their AttributeType's dataType
   - Required fields must not be NULL

6. Security Requirements:
   - MUST only generate SELECT statements
   - Use parameterization (e.g., @patientId)
   - No dynamic SQL or string concatenation
   - No modifications to data

EXAMPLES OF GOOD RESPONSES:

For "What are the most common wound types?":
{
  "explanation": "We'll count distinct wounds grouped by their etiology...",
  "generatedSql": "SELECT AT.name, N.value, COUNT(DISTINCT W.id) as count...",
  "recommendedChartType": "bar",
  "availableMappings": {
    "bar": { "category": "value", "value": "count" },
    "pie": { "label": "value", "value": "count" },
    "table": { "columns": [{ "key": "value", "header": "Wound Type" }] }
  }
}

For "How has this patient's wound area changed over time?":
{
  "explanation": "We'll track wound measurements over time...",
  "generatedSql": "SELECT A.date, M.area FROM rpt.Assessment A...",
  "recommendedChartType": "line",
  "availableMappings": {
    "line": { "x": "date", "y": "area" },
    "table": { "columns": [{ "key": "date", "header": "Date" }] }
  }
}
`;

/**
 * Helper function to validate AI response format
 */
export function validateAIResponse(
  response: unknown
): response is AIAnalysisPlan {
  if (!response || typeof response !== "object") return false;

  const plan = response as Partial<AIAnalysisPlan>;

  const requiredKeys = [
    "explanation",
    "generatedSql",
    "recommendedChartType",
    "availableMappings",
  ];
  if (!requiredKeys.every((key) => key in plan)) return false;

  const validChartTypes: ChartType[] = ["bar", "line", "pie", "kpi", "table"];
  if (!validChartTypes.includes(plan.recommendedChartType as ChartType))
    return false;

  // Validate SQL is SELECT only
  if (
    typeof plan.generatedSql !== "string" ||
    !/^[\s\n]*SELECT/i.test(plan.generatedSql)
  )
    return false;

  // Validate mappings
  const mappings = plan.availableMappings || {};
  if (mappings.bar && (!mappings.bar.category || !mappings.bar.value))
    return false;
  if (mappings.line && (!mappings.line.x || !mappings.line.y)) return false;
  if (mappings.pie && (!mappings.pie.label || !mappings.pie.value))
    return false;
  if (mappings.kpi && !mappings.kpi.value) return false;
  if (mappings.table && !Array.isArray(mappings.table.columns)) return false;

  return true;
}

/**
 * Helper function to extract chart-specific requirements
 */
export function getChartRequirements(chartType: ChartType): string {
  const requirements: Record<ChartType, string> = {
    bar: "Needs category and numeric value columns. Good for comparisons.",
    line: "Needs time/numeric x-axis and numeric y-axis. Good for trends.",
    pie: "Needs category and numeric value columns. Good for proportions.",
    kpi: "Needs single numeric value with optional trend.",
    table: "Needs well-defined columns with proper headers.",
  };
  return requirements[chartType];
}

/**
 * Constructs the complete prompt for the AI
 */
export function constructPrompt(context: PromptContext): string {
  const { question, assessmentFormDefinition, patientId } = context;

  let prompt = GENERATE_QUERY_PROMPT;

  // Add question-specific context
  prompt += `\n\nQUESTION CONTEXT:\n`;
  prompt += `User Question: "${question}"\n`;
  if (patientId) {
    prompt += `This is a patient-specific query. Use @patientId parameter.\n`;
  }

  // Add form definition context
  prompt += `\nFORM DEFINITION:\n`;
  prompt += JSON.stringify(assessmentFormDefinition, null, 2);

  return prompt;
}

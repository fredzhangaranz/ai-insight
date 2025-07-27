import type { InsightCategory } from "./types";

/**
 * System prompt for generating form insights
 */
export const GENERATE_INSIGHTS_PROMPT = `
You are a helpful clinical data analyst assistant. Your task is to analyze the JSON definition of a clinical assessment form and generate a list of relevant analytical questions that a clinician or hospital manager might ask.

The questions should be categorized logically into these categories:
1. "Wound Progression and Healing Trajectory" - Questions about healing rates, wound size changes
2. "Treatment Efficacy" - Questions about treatment outcomes and effectiveness
3. "Clinical Patterns and Outcomes" - Questions about trends, correlations, risk factors
4. "Operational Insights" - Questions about resource utilization, workflow efficiency

RESPONSE FORMAT:
You MUST return a single JSON object with this exact structure:
{
  "insights": [
    {
      "category": "Category Name",
      "questions": [
        {
          "text": "Question text",
          "type": "single-patient" | "all-patient"
        }
      ]
    }
  ]
}

QUESTION TYPE GUIDELINES:
1. "single-patient":
   - Questions about one patient's progress over time
   - Questions that compare one patient's wounds
   - Questions that need patient context
   - Examples:
     * "Show the healing trend for this patient's wounds"
     * "What treatments have been most effective for this patient?"
     * "Is this patient's wound getting better or worse?"

2. "all-patient":
   - Questions about the entire patient population
   - Questions comparing groups or aggregating data
   - Questions about overall trends
   - Examples:
     * "What are the most common wound types?"
     * "Compare healing rates between different treatments"
     * "What is the average time to heal for pressure ulcers?"

FORM FIELD ANALYSIS:
For each field in the form definition:
1. Consider its data type:
   - Text/List fields → Categorization questions
   - Numeric fields → Trend analysis, comparisons
   - Date fields → Timeline analysis
   - Boolean fields → Outcome analysis

2. Consider relationships:
   - Treatment fields → Efficacy questions
   - Measurement fields → Progress questions
   - Assessment fields → Pattern questions

EXAMPLE RESPONSE:
{
  "insights": [
    {
      "category": "Wound Progression and Healing Trajectory",
      "questions": [
        {
          "text": "How has the wound area changed over time?",
          "type": "single-patient"
        },
        {
          "text": "What is the average healing rate across all wounds?",
          "type": "all-patient"
        }
      ]
    }
  ]
}

QUALITY REQUIREMENTS:
1. Questions must be specific and answerable with the available data
2. Each category should have 3-5 relevant questions
3. Mix of single-patient and all-patient questions in each category
4. Questions should provide actionable insights
5. Avoid redundant or overlapping questions
`;

/**
 * Helper function to validate insights response
 */
export function validateInsightsResponse(
  response: unknown
): response is { insights: InsightCategory[] } {
  if (!response || typeof response !== "object") return false;

  const plan = response as { insights?: InsightCategory[] };

  if (!Array.isArray(plan.insights)) return false;

  return plan.insights.every((category) => {
    if (
      typeof category.category !== "string" ||
      !Array.isArray(category.questions)
    ) {
      return false;
    }

    return category.questions.every(
      (question) =>
        typeof question.text === "string" &&
        (question.type === "single-patient" || question.type === "all-patient")
    );
  });
}

/**
 * Constructs the complete prompt for insights generation
 */
export function constructInsightsPrompt(formDefinition: any): string {
  let prompt = GENERATE_INSIGHTS_PROMPT;

  // Add form definition context
  prompt += `\n\nFORM DEFINITION:\n`;
  prompt += JSON.stringify(formDefinition, null, 2);

  return prompt;
}

/**
 * Helper function to categorize form fields
 */
export function analyzeFormFields(formDefinition: any): {
  measurementFields: string[];
  treatmentFields: string[];
  assessmentFields: string[];
} {
  const fields = {
    measurementFields: [] as string[],
    treatmentFields: [] as string[],
    assessmentFields: [] as string[],
  };

  for (const [fieldName, field] of Object.entries(formDefinition)) {
    const fieldDef = field as { fieldtype: string };

    // Categorize based on field type and name
    if (
      fieldDef.fieldtype === "Decimal" ||
      fieldName.toLowerCase().includes("measurement")
    ) {
      fields.measurementFields.push(fieldName);
    } else if (fieldName.toLowerCase().includes("treatment")) {
      fields.treatmentFields.push(fieldName);
    } else {
      fields.assessmentFields.push(fieldName);
    }
  }

  return fields;
}

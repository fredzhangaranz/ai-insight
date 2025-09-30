import {
  createFunnel,
  findFunnelByQuestion,
  addSubQuestions,
  getSubQuestions,
} from "./funnel-storage.service";
import type { SubQuestion } from "@/lib/types/funnel";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";
import type { InsightScope } from "@/lib/services/insight.service";

export interface CachedSubQuestionResult {
  funnelId: number;
  subQuestions: SubQuestion[];
  wasCached: boolean;
}

export const SCHEMA_SCOPE_SENTINEL = "00000000-0000-0000-0000-000000000000";

export async function getOrGenerateSubQuestions(
  assessmentFormVersionFk: string | undefined,
  originalQuestion: string,
  formDefinition?: any,
  databaseSchemaContext?: any,
  modelId: string = DEFAULT_AI_MODEL_ID,
  scope: InsightScope = "form"
): Promise<CachedSubQuestionResult> {
  const cacheKey =
    scope === "schema"
      ? SCHEMA_SCOPE_SENTINEL
      : assessmentFormVersionFk;
  if (!cacheKey) {
    throw new Error(
      "assessmentFormVersionFk is required when scope is 'form'"
    );
  }
  // TODO: The current caching mechanism is not model-aware. It finds a funnel
  // by question text alone. This means if a user generates sub-questions with
  // Claude, and another user requests the same question with Gemini, the Claude
  // results will be returned from cache. A proper fix requires a schema change
  // to store the modelId with the funnel, which is beyond the scope of this refactor.

  // First, check if we already have a funnel with this exact question
  const existingFunnel = await findFunnelByQuestion(cacheKey, originalQuestion);

  if (existingFunnel) {
    console.log(
      `Found existing funnel ${existingFunnel.id} for question: ${originalQuestion}`
    );

    // Get the cached sub-questions
    const cachedSubQuestions = await getSubQuestions(Number(existingFunnel.id));

    // Transform database records to frontend SubQuestion format
    const transformedSubQuestions: SubQuestion[] = cachedSubQuestions.map(
      (sq: any) => ({
        id: `sq-${sq.id}`,
        text: sq.questionText,
        order: sq.order,
        status: sq.status || "pending",
        sqlQuery: sq.sqlQuery || "",
        sqlExplanation: sq.sqlExplanation,
        sqlValidationNotes: sq.sqlValidationNotes,
        sqlMatchedTemplate: sq.sqlMatchedTemplate,
        data: [],
        lastExecutionDate: sq.lastExecutionDate
          ? new Date(sq.lastExecutionDate)
          : undefined,
      })
    );

    return {
      funnelId: Number(existingFunnel.id),
      subQuestions: transformedSubQuestions,
      wasCached: true,
    };
  }

  // No cache found, generate new sub-questions
  console.log(
    `No cache found, generating new sub-questions for: "${originalQuestion}" using model ${modelId}`
  );

  const provider = await getAIProvider(modelId);
  const aiResponse = await provider.generateSubQuestions({
    originalQuestion,
    formDefinition,
    databaseSchemaContext,
    assessmentFormVersionFk: cacheKey,
    scope,
  });

  // Create a new funnel
  const newFunnel = await createFunnel({
    assessmentFormVersionFk: cacheKey,
    originalQuestion,
  });

  // Transform AI response to database format
  const subQuestionsToStore = aiResponse.subQuestions.map((sq) => ({
    questionText: sq.questionText,
    order: sq.order,
    sqlQuery: undefined, // Will be generated later
  }));

  // Store the generated sub-questions
  const storedSubQuestions = await addSubQuestions(
    Number(newFunnel.id),
    subQuestionsToStore
  );

  console.log(
    `Created new funnel ${newFunnel.id} with ${storedSubQuestions.length} sub-questions`
  );

  // Transform stored sub-questions to frontend format
  const transformedSubQuestions: SubQuestion[] = storedSubQuestions.map(
    (sq: any) => ({
      id: `sq-${sq.id}`,
      text: sq.questionText,
      order: sq.order,
      status: sq.status || "pending",
      sqlQuery: sq.sqlQuery || "",
      sqlExplanation: sq.sqlExplanation,
      sqlValidationNotes: sq.sqlValidationNotes,
      sqlMatchedTemplate: sq.sqlMatchedTemplate,
      data: [],
      lastExecutionDate: sq.lastExecutionDate
        ? new Date(sq.lastExecutionDate)
        : undefined,
    })
  );

  return {
    funnelId: Number(newFunnel.id),
    subQuestions: transformedSubQuestions,
    wasCached: false,
  };
}

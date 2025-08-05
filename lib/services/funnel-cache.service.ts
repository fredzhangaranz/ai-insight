import {
  createFunnel,
  findFunnelByQuestion,
  addSubQuestions,
  getSubQuestions,
} from "./funnel-storage.service";
import type { SubQuestion } from "@/lib/types/funnel";
import { getAIProvider } from "@/lib/ai/providers/provider-factory";
import { DEFAULT_AI_MODEL_ID } from "@/lib/config/ai-models";

export interface CachedSubQuestionResult {
  funnelId: number;
  subQuestions: SubQuestion[];
  wasCached: boolean;
}

export async function getOrGenerateSubQuestions(
  assessmentFormVersionFk: string,
  originalQuestion: string,
  formDefinition?: any,
  databaseSchemaContext?: any,
  modelId: string = DEFAULT_AI_MODEL_ID
): Promise<CachedSubQuestionResult> {
  // TODO: The current caching mechanism is not model-aware. It finds a funnel
  // by question text alone. This means if a user generates sub-questions with
  // Claude, and another user requests the same question with Gemini, the Claude
  // results will be returned from cache. A proper fix requires a schema change
  // to store the modelId with the funnel, which is beyond the scope of this refactor.

  // First, check if we already have a funnel with this exact question
  const existingFunnel = await findFunnelByQuestion(
    assessmentFormVersionFk,
    originalQuestion
  );

  if (existingFunnel) {
    console.log(
      `Found existing funnel ${existingFunnel.id} for question: ${originalQuestion}`
    );

    // Get the cached sub-questions
    const cachedSubQuestions = await getSubQuestions(Number(existingFunnel.id));

    return {
      funnelId: Number(existingFunnel.id),
      subQuestions: cachedSubQuestions,
      wasCached: true,
    };
  }

  // No cache found, generate new sub-questions
  console.log(
    `No cache found, generating new sub-questions for: "${originalQuestion}" using model ${modelId}`
  );

  const provider = getAIProvider(modelId);
  const aiResponse = await provider.generateSubQuestions({
    originalQuestion,
    formDefinition,
    databaseSchemaContext: databaseSchemaContext || "",
    assessmentFormVersionFk,
  });

  // Create a new funnel
  const newFunnel = await createFunnel({
    assessmentFormVersionFk,
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

  return {
    funnelId: Number(newFunnel.id),
    subQuestions: storedSubQuestions,
    wasCached: false,
  };
}

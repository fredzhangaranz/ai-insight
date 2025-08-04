import { generateSubQuestions } from "./subquestion-generator.service";
import {
  createFunnel,
  findFunnelByQuestion,
  addSubQuestions,
  getSubQuestions,
} from "./funnel-storage.service";
import type { SubQuestion } from "@/lib/types/funnel";

export interface CachedSubQuestionResult {
  funnelId: number;
  subQuestions: SubQuestion[];
  wasCached: boolean;
}

export async function getOrGenerateSubQuestions(
  assessmentFormVersionFk: string,
  originalQuestion: string,
  formDefinition?: any,
  databaseSchemaContext?: any
): Promise<CachedSubQuestionResult> {
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
    `No cache found, generating new sub-questions for: ${originalQuestion}`
  );

  const aiResponse = await generateSubQuestions({
    originalQuestion,
    formDefinition,
    databaseSchemaContext,
  });

  // Create a new funnel
  const newFunnel = await createFunnel({
    assessmentFormVersionFk,
    originalQuestion,
  });

  // Transform AI response to database format
  const subQuestionsToStore = aiResponse.sub_questions.map((sq) => ({
    questionText: sq.question,
    order: sq.step,
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

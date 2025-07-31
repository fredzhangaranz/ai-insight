import Anthropic from "@anthropic-ai/sdk";
import {
  constructFunnelSubquestionsPrompt,
  validateFunnelSubquestionsResponse,
} from "@/lib/prompts/funnel-subquestions.prompt";
import { MetricsMonitor } from "@/lib/monitoring";
import fs from "fs";
import path from "path";

// Configuration
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const AI_MODEL_NAME = process.env.AI_MODEL_NAME || "claude-3-sonnet-20240229";

export interface SubQuestionGenerationRequest {
  originalQuestion: string;
  formDefinition?: any;
  databaseSchemaContext?: string;
}

export interface SubQuestionGenerationResponse {
  original_question: string;
  matched_template: string;
  sub_questions: Array<{
    step: number;
    question: string;
    depends_on: number | null;
  }>;
}

/**
 * Generates sub-questions by breaking down a complex analytical question
 * into smaller, incremental sub-questions using AI.
 */
export async function generateSubQuestions(
  request: SubQuestionGenerationRequest
): Promise<SubQuestionGenerationResponse> {
  const metrics = MetricsMonitor.getInstance();
  const aiStartTime = Date.now();

  console.log("Starting sub-question generation...");

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Anthropic API key is not configured");
    }

    // Load database schema context if not provided
    let schemaContext = request.databaseSchemaContext;
    if (!schemaContext) {
      const schemaContextPath = path.join(
        process.cwd(),
        "lib",
        "database-schema-context.md"
      );
      schemaContext = fs.readFileSync(schemaContextPath, "utf-8");
    }

    // Construct the prompt with context
    const prompt = constructFunnelSubquestionsPrompt(
      request.originalQuestion,
      request.formDefinition,
      schemaContext
    );

    console.log("Calling Anthropic API for sub-question generation...");

    // Call Anthropic API
    const aiResponse = await anthropic.messages.create({
      model: AI_MODEL_NAME,
      max_tokens: 2048,
      system: prompt,
      messages: [
        {
          role: "user",
          content:
            "Please break down this complex question into incremental sub-questions.",
        },
      ],
    });

    // Extract response text
    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    console.log("AI Response:", responseText);

    // Parse JSON response
    let parsedResponse: SubQuestionGenerationResponse;
    try {
      parsedResponse = JSON.parse(
        responseText
      ) as SubQuestionGenerationResponse;
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      throw new Error("AI returned invalid JSON format");
    }

    // Validate the response structure
    if (!validateFunnelSubquestionsResponse(parsedResponse)) {
      console.error("AI response validation failed:", parsedResponse);
      throw new Error("AI returned invalid sub-questions format");
    }

    // Validate sub-question relationships
    validateSubQuestionRelationships(parsedResponse.sub_questions);

    // Log AI metrics
    await metrics.logAIMetrics({
      promptTokens: 0, // Claude 3 doesn't expose token counts yet
      completionTokens: 0,
      totalTokens: 0,
      latency: Date.now() - aiStartTime,
      success: true,
      model: AI_MODEL_NAME,
      timestamp: new Date(),
    });

    console.log("Sub-question generation completed successfully");
    return parsedResponse;
  } catch (error: any) {
    console.error("Sub-question generation error:", error);

    // Log AI error metrics
    await metrics.logAIMetrics({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latency: Date.now() - aiStartTime,
      success: false,
      errorType: error.name || "UnknownError",
      model: AI_MODEL_NAME,
      timestamp: new Date(),
    });

    throw error;
  }
}

/**
 * Validates that sub-question dependencies form a valid sequence
 */
function validateSubQuestionRelationships(
  subQuestions: Array<{
    step: number;
    question: string;
    depends_on: number | null;
  }>
): void {
  const steps = new Set<number>();

  for (const sq of subQuestions) {
    // Check for duplicate steps
    if (steps.has(sq.step)) {
      throw new Error(`Duplicate step number found: ${sq.step}`);
    }
    steps.add(sq.step);

    // Check dependency validity
    if (sq.depends_on !== null) {
      if (!steps.has(sq.depends_on)) {
        throw new Error(
          `Step ${sq.step} depends on non-existent step ${sq.depends_on}`
        );
      }
      if (sq.depends_on >= sq.step) {
        throw new Error(
          `Step ${sq.step} cannot depend on later step ${sq.depends_on}`
        );
      }
    }
  }

  // Check that steps form a continuous sequence starting from 1
  const sortedSteps = Array.from(steps).sort((a, b) => a - b);
  for (let i = 0; i < sortedSteps.length; i++) {
    if (sortedSteps[i] !== i + 1) {
      throw new Error(
        `Sub-questions must form a continuous sequence starting from 1`
      );
    }
  }
}

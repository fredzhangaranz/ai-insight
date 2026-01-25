/**
 * Request validation schemas for conversation API endpoints.
 * Ensures type-safe input validation with descriptive error messages.
 */

import { z } from "zod";

/**
 * POST /api/insights/conversation/send
 * Send a message in a conversation thread.
 */
export const SendConversationMessageSchema = z.object({
  threadId: z
    .string()
    .uuid()
    .optional()
    .describe("Optional existing thread ID (UUID format)"),
  customerId: z
    .string()
    .trim()
    .min(1, "customerId cannot be empty")
    .max(100, "customerId must be less than 100 characters")
    .describe("Customer ID (required)"),
  question: z
    .string()
    .trim()
    .min(3, "question must be at least 3 characters")
    .max(5000, "question must be less than 5000 characters")
    .describe("User question (required, 3-5000 characters)"),
  modelId: z
    .string()
    .trim()
    .max(100, "modelId must be less than 100 characters")
    .optional()
    .describe("Optional AI model ID to use"),
  userMessageId: z
    .string()
    .uuid()
    .optional()
    .describe("Optional existing user message ID for re-execution"),
});

export type SendConversationMessageRequest = z.infer<
  typeof SendConversationMessageSchema
>;

/**
 * POST /api/insights/conversation/new
 * Create a new conversation thread.
 */
export const CreateConversationThreadSchema = z.object({
  customerId: z
    .string()
    .trim()
    .min(1, "customerId cannot be empty")
    .max(100, "customerId must be less than 100 characters")
    .describe("Customer ID (required)"),
  title: z
    .string()
    .trim()
    .max(100, "title must be less than 100 characters")
    .optional()
    .describe("Optional conversation title (max 100 characters)"),
});

export type CreateConversationThreadRequest = z.infer<
  typeof CreateConversationThreadSchema
>;

/**
 * GET /api/insights/conversation/history
 * Fetch conversation history with pagination.
 */
export const GetConversationHistorySchema = z.object({
  customerId: z
    .string()
    .trim()
    .max(100, "customerId must be less than 100 characters")
    .optional()
    .describe("Optional customer filter"),
  limit: z
    .string()
    .pipe(z.coerce.number().int().min(1).max(100))
    .optional()
    .describe("Pagination limit (1-100, default 20)"),
  offset: z
    .string()
    .pipe(z.coerce.number().int().nonnegative())
    .optional()
    .describe("Pagination offset (default 0)"),
});

export type GetConversationHistoryRequest = z.infer<
  typeof GetConversationHistorySchema
>;

/**
 * Helper to validate request and provide formatted error response.
 * Returns { valid: true, data } or { valid: false, error, details }
 */
export function validateRequest<T>(
  schema: z.ZodSchema,
  data: unknown
): { valid: true; data: T } | { valid: false; error: string; details: any } {
  try {
    const result = schema.parse(data);
    return { valid: true, data: result as T };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
        code: e.code,
      }));

      const errorMessage = error.errors
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; ");

      return {
        valid: false,
        error: "Validation failed",
        details: { message: errorMessage, issues: details },
      };
    }

    return {
      valid: false,
      error: "Unknown validation error",
      details: { message: String(error) },
    };
  }
}

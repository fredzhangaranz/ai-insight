/**
 * AI-based gate for patient entity resolution.
 *
 * Decides whether a question contains a literal patient reference (name, ID, GUID)
 * that requires resolution, or a contextual reference that should be resolved from
 * conversation history. Uses semantic understanding—no regex or phrase patterns.
 */

import type { IQueryFunnelProvider } from "@/lib/ai/providers/i-query-funnel-provider";

export interface PatientResolutionGateResult {
  requiresLiteralResolution: boolean;
}

const SYSTEM_PROMPT = `You are a classifier for healthcare data questions.

Your task: Determine whether the user's question contains a LITERAL patient reference that requires looking up a specific patient, or a CONTEXTUAL reference that should be resolved from the previous conversation.

LITERAL: The question explicitly mentions a patient identifier—full name, patient ID, GUID, MRN, domain ID—that must be resolved before querying.
CONTEXTUAL: The question refers to the previous result using language that resolves from conversation context. No lookup by name/ID is needed; the referent is the prior result set.

Apply semantic understanding. Return only valid JSON.`;

function parseGateResponse(text: string): PatientResolutionGateResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { requiresLiteralResolution: true };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (parsed && typeof parsed === "object" && "requiresLiteralResolution" in parsed) {
      return {
        requiresLiteralResolution: Boolean(parsed.requiresLiteralResolution),
      };
    }
  } catch {
    // Fallback: assume literal to avoid skipping needed resolution
  }
  return { requiresLiteralResolution: true };
}

/**
 * Asks the AI whether the question requires literal patient resolution.
 * Only call when threadId exists (follow-up context).
 */
export async function shouldResolvePatientLiterally(
  question: string,
  provider: IQueryFunnelProvider,
  options?: { threadId?: string }
): Promise<PatientResolutionGateResult> {
  if (!options?.threadId) {
    return { requiresLiteralResolution: true };
  }

  const userPrompt = `Question: "${question}"

This is a follow-up in a conversation. Does this question contain a literal patient reference (full name, patient ID, GUID, MRN) that requires looking up a specific patient? Or is it a contextual reference to the previous result?

Return JSON only: {"requiresLiteralResolution": true or false}`;

  const response = await provider.complete({
    system: SYSTEM_PROMPT,
    userMessage: userPrompt,
    temperature: 0,
  });

  return parseGateResponse(response);
}

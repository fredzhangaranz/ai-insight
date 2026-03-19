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
  candidateText?: string;
}

const SYSTEM_PROMPT = `You are a classifier for healthcare data questions.

Your task: Determine whether the user's question contains a LITERAL patient reference that requires looking up a specific patient, or whether no literal patient lookup is needed.

LITERAL: The question explicitly mentions one specific patient identifier or patient name that must be resolved before querying.
NOT LITERAL: The question is about a cohort, aggregate, condition, diagnosis, wound type, assessment type, or any other non-patient concept. Phrases such as "diabetic wounds", "pressure ulcers", "healing rate", "in the system", or "for diabetic wounds" are NOT patient references.

If a literal patient reference exists, extract the exact patient reference text into candidateText.
If no literal patient reference exists, candidateText must be null.

Apply semantic understanding. Return only valid JSON.`;

function parseGateResponse(text: string): PatientResolutionGateResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { requiresLiteralResolution: false };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "requiresLiteralResolution" in parsed
    ) {
      const record = parsed as Record<string, unknown>;
      return {
        requiresLiteralResolution: Boolean(record.requiresLiteralResolution),
        candidateText:
          typeof record.candidateText === "string" &&
          record.candidateText.trim()
            ? record.candidateText.trim()
            : undefined,
      };
    }
  } catch {
    // Fallback: avoid forcing patient lookup from malformed gate output
  }
  return { requiresLiteralResolution: false };
}

/**
 * Asks the AI whether the question requires literal patient resolution.
 */
export async function shouldResolvePatientLiterally(
  question: string,
  provider: IQueryFunnelProvider,
  options?: { threadId?: string }
): Promise<PatientResolutionGateResult> {
  const userPrompt = `Question: "${question}"

Conversation context:
- threadId present: ${options?.threadId ? "yes" : "no"}

Does this question contain a literal patient reference that requires looking up a specific patient before querying?
- Return requiresLiteralResolution=true only when a specific patient name or identifier is explicitly present.
- Return requiresLiteralResolution=false for cohort or aggregate questions, medical concepts, wound types, and generic follow-up references.

Return JSON only: {"requiresLiteralResolution": true or false, "candidateText": string or null}`;

  const response = await provider.complete({
    system: SYSTEM_PROMPT,
    userMessage: userPrompt,
    temperature: 0,
  });

  return parseGateResponse(response);
}

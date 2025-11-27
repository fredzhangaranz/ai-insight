/**
 * Intent Classification AI Prompt Tests
 *
 * Covers Task 2.9 prompt builder and response parser behavior.
 */

import { describe, expect, it } from 'vitest';
import {
  INTENT_CLASSIFICATION_SYSTEM_PROMPT,
  buildIntentClassificationPrompt,
  parseIntentClassificationResponse,
} from '../prompts/intent-classification-ai.prompt';

describe('Intent Classification AI Prompt Templates', () => {
  it('exposes the system prompt text', () => {
    expect(INTENT_CLASSIFICATION_SYSTEM_PROMPT).toContain('intent classifier for healthcare data queries');
  });

  it('builds prompt with all provided intents and descriptions', () => {
    const prompt = buildIntentClassificationPrompt('Show forms by status', [
      'workflow_status_monitoring',
      'legacy_unknown',
    ]);

    expect(prompt).toContain('workflow_status_monitoring');
    expect(prompt).toContain('legacy_unknown');
    expect(prompt).toContain('Show forms by status');
    expect(prompt).toMatch(/Respond in JSON format/);
  });

  it('parses AI JSON response into IntentClassificationResult', () => {
    const response = JSON.stringify({
      intent: 'workflow_status_monitoring',
      confidence: 0.92,
      reasoning: 'Mentions forms grouped by status',
    });

    const result = parseIntentClassificationResponse(response);

    expect(result.intent).toBe('workflow_status_monitoring');
    expect(result.confidence).toBe(0.92);
    expect(result.method).toBe('ai');
    expect(result.reasoning).toContain('forms grouped by status');
  });
});

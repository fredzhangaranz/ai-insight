import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../gemini-provider";

describe("GeminiProvider complete()", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.GEMINI_THINKING_BUDGET_ZERO_MODELS;
  });

  function createProvider(
    modelId: string,
    generateContent: ReturnType<typeof vi.fn>
  ): GeminiProvider {
    const provider = new GeminiProvider(modelId);
    const internalProvider = provider as any;
    internalProvider.initialized = true;
    internalProvider.genAI = {
      models: {
        generateContent,
      },
    };
    return provider;
  }

  it("uses thinkingBudget=0 only for explicitly configured models", async () => {
    process.env.GEMINI_THINKING_BUDGET_ZERO_MODELS = "gemini-supported";
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"ok": true}',
      usageMetadata: {},
    });
    const provider = createProvider("gemini-supported", generateContent);

    await provider.complete({
      system: "system",
      userMessage: "user",
      temperature: 0.1,
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config?.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
  });

  it("retries once without thinkingConfig when model rejects thinking_budget", async () => {
    process.env.GEMINI_THINKING_BUDGET_ZERO_MODELS = "gemini-unsupported";
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          '{"error":{"code":400,"message":"INVALID_ARGUMENT: model does not support setting thinking_budget to 0","status":"INVALID_ARGUMENT"}}'
        )
      )
      .mockResolvedValueOnce({
        text: '{"ok": true}',
        usageMetadata: {},
      });

    const provider = createProvider("gemini-unsupported", generateContent);
    const result = await provider.complete({
      system: "system",
      userMessage: "user",
      temperature: 0.1,
    });

    expect(result).toContain('{"ok": true}');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[0][0].config?.thinkingConfig).toEqual({
      thinkingBudget: 0,
    });
    expect(generateContent.mock.calls[1][0].config).toBeUndefined();
  });

  it("throws classified error when retry also fails after thinking_budget rejection", async () => {
    process.env.GEMINI_THINKING_BUDGET_ZERO_MODELS = "gemini-unsupported";
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          '{"error":{"code":400,"message":"INVALID_ARGUMENT: thinking_budget unsupported","status":"INVALID_ARGUMENT"}}'
        )
      )
      .mockRejectedValueOnce(
        new Error(
          '{"error":{"code":400,"message":"INVALID_ARGUMENT: thinking_budget unsupported","status":"INVALID_ARGUMENT"}}'
        )
      );

    const provider = createProvider("gemini-unsupported", generateContent);

    await expect(
      provider.complete({
        system: "system",
        userMessage: "user",
        temperature: 0.1,
      })
    ).rejects.toThrow("THINKING_BUDGET_UNSUPPORTED");
  });
});

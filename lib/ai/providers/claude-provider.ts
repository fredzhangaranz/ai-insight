import Anthropic from "@anthropic-ai/sdk";
import { BaseProvider } from "./base-provider";
import { AIConfigLoader } from "../../config/ai-config-loader";
import type { ConversationCompletionParams } from "./i-query-funnel-provider";
import type { ConversationMessage } from "../../types/conversation";

/**
 * An AI provider that uses Anthropic's Claude models to power the query funnel.
 */
export class ClaudeProvider extends BaseProvider {
  private anthropic: Anthropic | null = null;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelId: string) {
    super(modelId);
  }

  private async initializeAnthropic(): Promise<void> {
    const initStartTime = Date.now();
    console.log(`[ClaudeProvider] 🚀 Starting Anthropic initialization at ${new Date().toISOString()}`);

    const configStartTime = Date.now();
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();
    const configDuration = Date.now() - configStartTime;
    console.log(`[ClaudeProvider] 📋 Configuration loaded in ${configDuration}ms`);

    // Find an enabled Anthropic provider
    const anthropicConfig = providers.find(
      (p) => p.providerType === "anthropic" && p.isEnabled
    );

    if (!anthropicConfig) {
      throw new Error(
        "No enabled Anthropic provider found. Please configure and enable an Anthropic provider in Admin > AI Configuration."
      );
    }

    if (!anthropicConfig.configData.apiKey) {
      throw new Error(
        "Anthropic API key is missing in provider configuration. Please update the provider in Admin > AI Configuration."
      );
    }

    const sdkStartTime = Date.now();
    this.anthropic = new Anthropic({
      apiKey: anthropicConfig.configData.apiKey,
    });
    const sdkDuration = Date.now() - sdkStartTime;
    console.log(`[ClaudeProvider] 🔧 Anthropic SDK initialized in ${sdkDuration}ms`);

    this.initialized = true;
    const totalDuration = Date.now() - initStartTime;
    console.log(`[ClaudeProvider] ✅ Full initialization completed in ${totalDuration}ms`);
  }

  /**
   * Ensure Anthropic is initialized before use
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (!this.initPromise) {
      this.initPromise = this.initializeAnthropic().catch((error) => {
        this.initPromise = null;
        this.initialized = false;
        throw error;
      });
    }
    await this.initPromise;
  }

  /**
   * Executes the underlying language model to get a response.
   * This method implements the abstract method from BaseProvider.
   * @param systemPrompt The system prompt to guide the model's behavior.
   * @param userMessage The user's message or question.
   * @returns A promise that resolves to the model's response text and token usage.
   */
  protected async _executeModel(
    systemPrompt: string,
    userMessage: string
  ): Promise<{
    responseText: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const executeStartTime = Date.now();
    console.log(`[ClaudeProvider] 🎯 Starting _executeModel for model: ${this.modelId}`);

    // Ensure initialization is complete
    const ensureInitStartTime = Date.now();
    await this.ensureInitialized();
    const ensureInitDuration = Date.now() - ensureInitStartTime;
    console.log(`[ClaudeProvider] ✅ ensureInitialized completed in ${ensureInitDuration}ms`);

    if (!this.anthropic) {
      throw new Error("Anthropic failed to initialize");
    }

    const apiStartTime = Date.now();
    console.log(`[ClaudeProvider] 📡 Calling Anthropic API...`);
    const aiResponse = await this.anthropic.messages.create({
      model: this.modelId,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });
    const apiDuration = Date.now() - apiStartTime;
    console.log(`[ClaudeProvider] ✅ API call completed in ${apiDuration}ms`);

    const responseText =
      aiResponse.content[0].type === "text" ? aiResponse.content[0].text : "";

    const totalDuration = Date.now() - executeStartTime;
    console.log(
      `[ClaudeProvider] ✅ _executeModel completed in ${totalDuration}ms ` +
      `(input: ${aiResponse.usage.input_tokens} tokens, output: ${aiResponse.usage.output_tokens} tokens)`
    );

    return {
      responseText,
      usage: {
        input_tokens: aiResponse.usage.input_tokens,
        output_tokens: aiResponse.usage.output_tokens,
      },
    };
  }

  /**
   * Conversation-aware completion with prompt caching.
   * Token usage: First message ~5200 tokens, subsequent ~600 tokens (90% cached)
   */
  public async completeWithConversation(
    params: ConversationCompletionParams
  ): Promise<string> {
    const startTime = Date.now();
    await this.ensureInitialized();

    if (!this.anthropic) {
      throw new Error("Anthropic failed to initialize");
    }

    const systemPrompt = [
      {
        type: "text" as const,
        text: await this.buildSchemaContext(params.customerId),
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: await this.buildOntologyContext(params.customerId),
        cache_control: { type: "ephemeral" as const },
      },
      {
        type: "text" as const,
        text: this.buildSQLInstructions(),
        cache_control: { type: "ephemeral" as const },
      },
    ];

    const conversationPrompt = this.buildConversationHistory(
      params.conversationHistory
    );
    const fullPrompt =
      conversationPrompt + "\n\nCurrent question: " + params.currentQuestion;

    const response = await this.anthropic.messages.create({
      model: this.modelId,
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.1,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: fullPrompt,
        },
      ],
    });

    // Log token usage for cache efficiency monitoring
    const usage = response.usage;
    const cacheReadTokens = (usage as any).cache_read_input_tokens || 0;
    const cacheCreationTokens = (usage as any).cache_creation_input_tokens || 0;
    const regularInputTokens = usage.input_tokens - cacheReadTokens - cacheCreationTokens;
    
    const totalDuration = Date.now() - startTime;
    console.log(
      `[ClaudeProvider] Conversation completion in ${totalDuration}ms - ` +
      `Input: ${usage.input_tokens} tokens ` +
      `(regular: ${regularInputTokens}, cache_read: ${cacheReadTokens}, cache_creation: ${cacheCreationTokens}), ` +
      `Output: ${usage.output_tokens} tokens`
    );

    // Calculate cache efficiency
    if (cacheReadTokens > 0) {
      const cachePercentage = ((cacheReadTokens / usage.input_tokens) * 100).toFixed(1);
      console.log(`[ClaudeProvider] 🎯 Cache hit: ${cachePercentage}% of input tokens served from cache`);
    } else if (cacheCreationTokens > 0) {
      console.log(`[ClaudeProvider] 📝 Cache created: ${cacheCreationTokens} tokens cached for future use`);
    }

    return response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  }

  /**
   * Build conversation history from messages (SQL + summaries only).
   * Keeps last 5 messages to balance context vs token usage (~200 tokens per message = 1000 tokens).
   */
  public buildConversationHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) {
      return "This is the first question in the conversation.";
    }

    let history = "Previous conversation:\n\n";
    const CONVERSATION_HISTORY_LIMIT = 5;
    const recent = messages.slice(-CONVERSATION_HISTORY_LIMIT);

    for (const msg of recent) {
      if (msg.role === "user") {
        history += `User asked: "${msg.content}"\n`;
        continue;
      }

      if (msg.role === "assistant" && msg.metadata?.sql) {
        const summary = msg.metadata.resultSummary;
        history += "Assistant generated SQL:\n";
        history += `\`\`\`sql\n${msg.metadata.sql}\n\`\`\`\n`;
        history += `Result: ${summary?.rowCount ?? 0} records`;

        if (summary?.columns?.length) {
          history += `, columns: ${summary.columns.join(", ")}`;
        }

        history += "\n\n";
      }
    }

    history += "\nInstructions:\n";
    history +=
      "- If the current question references previous results (which ones, those, they), compose using the most recent SQL.\n";
    history +=
      "- If the current question is unrelated, generate a fresh query.\n";

    return history;
  }
}

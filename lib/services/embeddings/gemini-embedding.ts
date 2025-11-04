import { GoogleGenAI } from "@google/genai";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";

/**
 * Embedding service using Google's @google/genai library (recommended approach)
 * Generates text embeddings for semantic search on the clinical ontology
 */
export class GeminiEmbeddingService {
  private genAI: GoogleGenAI | null = null;
  private projectId: string | null = null;
  private location: string = "us-central1";
  private initialized: boolean = false;

  /**
   * Initialize the Gemini embedding service with Vertex AI credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const configLoader = AIConfigLoader.getInstance();
      const { providers } = await configLoader.getConfiguration();

      // Find an enabled Google provider
      const geminiConfig = providers.find(
        (p) => p.providerType === "google" && p.isEnabled
      );

      if (!geminiConfig) {
        throw new Error(
          "No enabled Google Gemini provider found. Please configure and enable a Google provider in Admin > AI Configuration."
        );
      }

      this.projectId = geminiConfig.configData.projectId ?? null;
      this.location = geminiConfig.configData.location || "us-central1";
      const credentialsPath = geminiConfig.configData.credentialsPath;

      if (!this.projectId) {
        throw new Error(
          "Google Cloud Project ID is missing in provider configuration. Please update the provider in Admin > AI Configuration."
        );
      }

      if (!credentialsPath) {
        throw new Error(
          "Google Application Credentials path is missing in provider configuration. Please update the provider in Admin > AI Configuration."
        );
      }

      // Set credentials path for Google SDK
      // The Google SDK reads this environment variable for authentication
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;

      // Initialize GoogleGenAI with Vertex AI configuration
      this.genAI = new GoogleGenAI({
        vertexai: true,
        project: this.projectId,
        location: this.location,
      });

      this.initialized = true;
      console.log("✅ Gemini embedding service initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize Gemini embedding service:", error);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text string
   * @param text The text to embed
   * @returns Promise resolving to a 768-dimensional vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.initialized || !this.genAI) {
      await this.initialize();
    }

    if (!text || text.trim().length === 0) {
      throw new Error("Cannot generate embedding for empty text");
    }

    try {
      // Use the latest Gemini embedding model
      const response = await this.genAI!.models.embedContent({
        model: "gemini-embedding-001",
        contents: text,
      });

      const embedding = response.embeddings?.[0]?.values;

      if (!embedding || embedding.length === 0) {
        throw new Error("Empty embedding returned from API");
      }

      return embedding;
    } catch (error) {
      console.error("Error generating embedding for text:", text, error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in parallel with batching
   * @param texts Array of texts to embed
   * @param batchSize Number of texts to process in parallel (default: 5)
   * @returns Promise resolving to array of embedding vectors
   */
  async generateEmbeddingsBatch(
    texts: string[],
    batchSize: number = 5
  ): Promise<number[][]> {
    if (!this.initialized || !this.genAI) {
      await this.initialize();
    }

    const results: number[][] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process in batches to avoid overwhelming the API
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(async (text) => {
        try {
          const embedding = await this.generateEmbedding(text);
          successCount++;
          return embedding;
        } catch (error) {
          errorCount++;
          console.error(`Error embedding text: ${text.substring(0, 50)}...`);
          throw error;
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Error in batch ${i / batchSize + 1}:`, error);
        throw error;
      }
    }

    console.log(
      `📊 Batch embedding complete: ${successCount} success, ${errorCount} errors`
    );
    return results;
  }
}

// Singleton instance
let embeddingService: GeminiEmbeddingService | null = null;

/**
 * Get or create the Gemini embedding service singleton
 */
export function getEmbeddingService(): GeminiEmbeddingService {
  if (!embeddingService) {
    embeddingService = new GeminiEmbeddingService();
  }
  return embeddingService;
}

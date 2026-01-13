import { AIConfigService } from "../services/ai-config.service";
import { AIConfiguration } from "../services/ai-config.service";

/**
 * AI Configuration Loader
 * Single source of truth: AIConfiguration database table
 * No automatic seeding or environment-specific logic
 */
export class AIConfigLoader {
  private static instance: AIConfigLoader;
  private configService: AIConfigService;

  private constructor() {
    this.configService = AIConfigService.getInstance();
  }

  public static getInstance(): AIConfigLoader {
    if (!AIConfigLoader.instance) {
      AIConfigLoader.instance = new AIConfigLoader();
    }
    return AIConfigLoader.instance;
  }

  /**
   * Get AI configuration from database
   * Always reads from AIConfiguration table - single source of truth
   */
  public async getConfiguration(): Promise<{
    providers: AIConfiguration[];
    source: "database";
  }> {
    // Get ALL configurations (both enabled and disabled) for admin UI
    const dbProviders = await this.configService.getAllConfigurations();

    return {
      providers: dbProviders,
      source: "database",
    };
  }

}

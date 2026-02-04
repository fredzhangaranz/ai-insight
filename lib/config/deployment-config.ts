import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  DeploymentConfig,
  DatabaseConfig,
  AIProvidersConfig,
  AdminUserConfig,
  configToEnvFile,
  parseConnectionString,
  buildConnectionString,
} from "./validation";

/**
 * Deployment Configuration Manager
 *
 * Handles:
 * - Loading/saving .env files
 * - Auto-detecting PostgreSQL from Docker
 * - Validating database connections
 * - Generating config from wizard input
 * - Supporting non-interactive mode
 */

export class DeploymentConfigManager {
  private rootDir: string;
  private envPath: string;
  private configCachePath: string;

  constructor(rootDir = process.cwd()) {
    this.rootDir = rootDir;
    this.envPath = path.join(rootDir, ".env.local");
    this.configCachePath = path.join(rootDir, ".insight-gen-setup.json");
  }

  /**
   * Load existing .env file or environment variables
   */
  async loadExistingConfig(): Promise<Partial<DeploymentConfig> | null> {
    // Try to load from .env.local
    if (fs.existsSync(this.envPath)) {
      const envContent = fs.readFileSync(this.envPath, "utf-8");
      return this.parseEnvFile(envContent);
    }

    // Try to load from environment variables
    const dbUrl = process.env.INSIGHT_GEN_DB_URL || process.env.DATABASE_URL;
    if (dbUrl) {
      return {
        database: parseConnectionString(dbUrl) || undefined,
      };
    }

    return null;
  }

  /**
   * Parse .env file content into config object
   */
  private parseEnvFile(content: string): Partial<DeploymentConfig> | null {
    try {
      const config: any = {};
      const lines = content.split("\n");

      for (const line of lines) {
        if (line.startsWith("#") || !line.trim()) continue;

        const [key, ...valueParts] = line.split("=");
        let value = valueParts.join("=").trim();

        // Remove quotes
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }

        // Map env variables to config
        if (key === "INSIGHT_GEN_DB_URL" || key === "DATABASE_URL") {
          config.database = parseConnectionString(value);
        }
      }

      return Object.keys(config).length > 0 ? config : null;
    } catch {
      return null;
    }
  }

  /**
   * Auto-detect PostgreSQL running in Docker Compose
   */
  async autoDetectPostgres(): Promise<DatabaseConfig | null> {
    try {
      // Check if docker-compose.yml exists
      const composeFile = path.join(this.rootDir, "docker-compose.yml");
      if (!fs.existsSync(composeFile)) {
        return null;
      }

      // Try to get running container
      const output = execSync(
        "docker-compose ps -q db 2>/dev/null || echo ''",
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      ).trim();

      if (!output) {
        // Container not running, but we can use standard config
        return {
          type: "postgresql",
          host: "localhost",
          port: 5432,
          username: "user",
          password: "password",
          database: "insight_gen_db",
        };
      }

      // Container is running - use default docker-compose config
      return {
        type: "postgresql",
        host: "localhost",
        port: 5432,
        username: "user",
        password: "password",
        database: "insight_gen_db",
      };
    } catch {
      return null;
    }
  }

  /**
   * Validate database connection
   */
  async validateDatabaseConnection(config: DatabaseConfig): Promise<{
    success: boolean;
    error?: string;
    latency?: number;
  }> {
    try {
      const { Client } = await import("pg");
      const connectionString = buildConnectionString(config);

      const client = new Client({
        connectionString,
        connectionTimeoutMillis: 5000,
      });

      const start = Date.now();
      await client.connect();
      const latency = Date.now() - start;

      // Test query
      await client.query("SELECT 1");
      await client.end();

      return { success: true, latency };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate AI provider credentials
   */
  async validateAICredentials(config: AIProvidersConfig): Promise<{
    success: boolean;
    errors: Record<string, string>;
  }> {
    const errors: Record<string, string> = {};

    // Anthropic validation
    if (config.anthropic.enabled && config.anthropic.apiKey) {
      if (!config.anthropic.apiKey.startsWith("sk-ant-")) {
        errors.anthropic = "Invalid Anthropic API key format";
      }
    }

    // Google validation
    if (config.google.enabled && config.google.projectId) {
      if (!config.google.projectId.match(/^[a-z0-9-]+$/)) {
        errors.google = "Invalid Google Cloud project ID format";
      }

      if (config.google.credentialsPath) {
        if (!fs.existsSync(config.google.credentialsPath)) {
          errors.google_credentials = `Credentials file not found: ${config.google.credentialsPath}`;
        } else {
          try {
            const content = fs.readFileSync(
              config.google.credentialsPath,
              "utf-8",
            );
            JSON.parse(content);
          } catch {
            errors.google_json = "Google credentials file is not valid JSON";
          }
        }
      }
    }

    // OpenWebUI validation
    if (config.openwebui.enabled && config.openwebui.baseUrl) {
      try {
        new URL(config.openwebui.baseUrl);
      } catch {
        errors.openwebui = "Invalid OpenWebUI base URL";
      }
    }

    return {
      success: Object.keys(errors).length === 0,
      errors,
    };
  }

  /**
   * Estimate database size and discovery time
   */
  async estimateDatabaseSize(dbUrl: string): Promise<{
    success: boolean;
    formCount?: number;
    recordCount?: number;
    tableCount?: number;
    estimatedMinutes?: number;
    error?: string;
  }> {
    try {
      const { Client } = await import("pg");
      const client = new Client({
        connectionString: dbUrl,
        connectionTimeoutMillis: 5000,
      });

      await client.connect();

      try {
        // Query form count (adjust based on actual schema)
        const formsResult = await client.query(
          `SELECT COUNT(*) FROM information_schema.tables 
           WHERE table_schema = 'public' AND table_name LIKE '%form%'`,
        );
        const formCount = parseInt(formsResult.rows[0]?.count || "0");

        // Query total record count across major tables
        const tablesResult = await client.query(
          `SELECT table_name FROM information_schema.tables 
           WHERE table_schema = 'public' LIMIT 20`,
        );

        let totalRecords = 0;
        for (const table of tablesResult.rows) {
          const countResult = await client.query(
            `SELECT COUNT(*) FROM public."${table.table_name}" LIMIT 1000000`,
          );
          totalRecords += parseInt(countResult.rows[0]?.count || "0");
        }

        const tableCount = tablesResult.rows.length;

        // Estimate discovery time
        const estimatedMinutes = this.estimateDiscoveryTime(totalRecords);

        return {
          success: true,
          formCount: Math.max(formCount, 100), // Default estimate if query fails
          recordCount: totalRecords,
          tableCount,
          estimatedMinutes,
        };
      } finally {
        await client.end();
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Estimation failed",
      };
    }
  }

  /**
   * Estimate discovery time based on record count
   */
  private estimateDiscoveryTime(recordCount: number): number {
    if (recordCount < 100_000) return 8; // Small: 8-12 min
    if (recordCount < 1_000_000) return 12; // Medium: 12-17 min
    if (recordCount < 10_000_000) return 18; // Large: 18-25 min
    if (recordCount < 100_000_000) return 30; // Very large: 30-40 min
    return 50; // Huge: 50+ min
  }

  /**
   * Create customer via API
   */
  async createCustomer(config: {
    name: string;
    code: string;
    silhouetteDbUrl: string;
  }): Promise<{
    success: boolean;
    customerId?: string;
    error?: string;
  }> {
    try {
      const response = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      const { id } = await response.json();
      return { success: true, customerId: id };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create customer",
      };
    }
  }

  /**
   * Start discovery for customer
   */
  async startDiscovery(customerCode: string): Promise<{
    success: boolean;
    jobId?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(
        `/api/admin/customers/${customerCode}/discovery/start`,
        { method: "POST" },
      );

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message };
      }

      const { jobId } = await response.json();
      return { success: true, jobId };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to start discovery",
      };
    }
  }

  /**
   * Stream discovery progress
   */
  async *streamDiscoveryProgress(customerCode: string): AsyncGenerator<
    {
      stage: string;
      progress: number;
      message: string;
      eta?: number;
    },
    void,
    unknown
  > {
    try {
      const response = await fetch(
        `/api/admin/customers/${customerCode}/discovery/events`,
      );

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              yield JSON.parse(line.slice(6));
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch {
      // Ignore stream errors
    }
  }

  /**
   * Save configuration to .env file
   */
  async saveConfig(
    config: DeploymentConfig,
    targetEnv: "local" | "production" = "local",
  ): Promise<void> {
    const filename =
      targetEnv === "production" ? ".env.production" : ".env.local";
    const envPath = path.join(this.rootDir, filename);
    const content = configToEnvFile(config);

    fs.writeFileSync(envPath, content, "utf-8");
  }

  /**
   * Save config as JSON for non-interactive mode
   */
  async saveConfigJSON(
    config: DeploymentConfig,
    outputPath?: string,
  ): Promise<string> {
    const filePath = outputPath || this.configCachePath;
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
    return filePath;
  }

  /**
   * Load config from JSON (for non-interactive mode)
   */
  async loadConfigJSON(configPath: string): Promise<DeploymentConfig | null> {
    try {
      if (!fs.existsSync(configPath)) {
        return null;
      }

      const content = fs.readFileSync(configPath, "utf-8");
      return JSON.parse(content) as DeploymentConfig;
    } catch {
      return null;
    }
  }

  /**
   * Get Docker Compose status
   */
  async getDockerComposeStatus(): Promise<{
    installed: boolean;
    dbRunning: boolean;
    dbHealth?: string;
  }> {
    try {
      // Check if docker-compose is installed
      execSync("docker-compose --version", { stdio: "pipe" });

      // Check if db container is running
      const output = execSync(
        'docker-compose ps -q db 2>/dev/null || echo ""',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      const dbRunning = !!output;

      if (dbRunning) {
        // Get container health
        const healthOutput = execSync(
          "docker inspect --format='{{.State.Health.Status}}' insight-gen-db-1 2>/dev/null || echo 'unknown'",
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
        ).trim();

        return {
          installed: true,
          dbRunning: true,
          dbHealth: healthOutput,
        };
      }

      return {
        installed: true,
        dbRunning: false,
      };
    } catch {
      return {
        installed: false,
        dbRunning: false,
      };
    }
  }

  /**
   * Start PostgreSQL container with Docker Compose
   */
  async startPostgresContainer(): Promise<{
    success: boolean;
    error?: string;
    message?: string;
  }> {
    try {
      const composeFile = path.join(this.rootDir, "docker-compose.yml");
      if (!fs.existsSync(composeFile)) {
        return {
          success: false,
          error: "docker-compose.yml not found",
        };
      }

      // Start container
      execSync("docker-compose up -d db", { stdio: "inherit" });

      // Wait for DB to be ready (max 30 seconds)
      let attempts = 0;
      while (attempts < 6) {
        try {
          const config = await this.autoDetectPostgres();
          if (config) {
            const validation = await this.validateDatabaseConnection(config);
            if (validation.success) {
              return {
                success: true,
                message: `PostgreSQL started and ready (${validation.latency}ms)`,
              };
            }
          }
        } catch {
          // Retry
        }

        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s
      }

      return {
        success: false,
        error: "PostgreSQL container started but failed to become ready",
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to start PostgreSQL",
      };
    }
  }

  /**
   * Export config as JSON (for sharing/backup)
   */
  exportConfig(config: DeploymentConfig): string {
    // Mask sensitive values for safe sharing
    const masked = JSON.parse(JSON.stringify(config));
    if (masked.providers.anthropic.apiKey) {
      masked.providers.anthropic.apiKey = "sk-ant-***[MASKED]";
    }
    if (masked.providers.google.projectId) {
      // Keep project ID visible, but hide other sensitive info
    }
    if (masked.adminUser.password) {
      masked.adminUser.password = "***[MASKED]";
    }

    return JSON.stringify(masked, null, 2);
  }
}

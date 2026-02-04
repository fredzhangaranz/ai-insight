import { z } from "zod";

/**
 * Deployment Configuration Validation Schemas
 *
 * These schemas validate:
 * 1. User input from the wizard
 * 2. .env.local and .env.production files
 * 3. Non-interactive mode config files
 */

// ============================================================================
// DATABASE CONFIGURATION
// ============================================================================

export const DatabaseConfigSchema = z.object({
  type: z.enum(["postgresql"]).default("postgresql"),
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65535).default(5432),
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
  database: z.string().min(1, "Database name required"),
});

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;

// Derived: Build connection string from config
export const buildConnectionString = (config: DatabaseConfig): string => {
  return `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;
};

// Parse connection string back to config
export const parseConnectionString = (url: string): DatabaseConfig | null => {
  try {
    const regex = /postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/;
    const match = url.match(regex);
    if (!match) return null;

    return {
      type: "postgresql",
      username: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4]),
      database: match[5],
    };
  } catch {
    return null;
  }
};

// ============================================================================
// AI PROVIDER CONFIGURATION
// ============================================================================

export const AnthropicConfigSchema = z.object({
  enabled: z.boolean().default(false),
  apiKey: z.string().min(1, "Anthropic API key required").optional(),
  modelName: z.string().default("claude-3-5-sonnet-20240620"),
});

export const GoogleVertexConfigSchema = z.object({
  enabled: z.boolean().default(false),
  projectId: z.string().min(1, "Google project ID required").optional(),
  location: z.string().default("us-central1"),
  credentialsPath: z.string().optional(),
  modelName: z.string().default("gemini-2.5-pro"),
});

export const OpenWebUIConfigSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  modelName: z.string().optional(),
});

export const AIProvidersConfigSchema = z.object({
  anthropic: AnthropicConfigSchema,
  google: GoogleVertexConfigSchema,
  openwebui: OpenWebUIConfigSchema,
});

export type AIProvidersConfig = z.infer<typeof AIProvidersConfigSchema>;

// Validate that at least one provider is enabled
export const validateAIProviders = (
  config: AIProvidersConfig,
): { valid: boolean; error?: string } => {
  const anyEnabled =
    config.anthropic.enabled ||
    config.google.enabled ||
    config.openwebui.enabled;

  if (!anyEnabled) {
    return {
      valid: false,
      error: "At least one AI provider must be enabled",
    };
  }

  if (config.anthropic.enabled && !config.anthropic.apiKey) {
    return {
      valid: false,
      error: "Anthropic API key required when enabled",
    };
  }

  if (config.google.enabled && !config.google.projectId) {
    return {
      valid: false,
      error: "Google Cloud project ID required when enabled",
    };
  }

  return { valid: true };
};

// ============================================================================
// ADMIN USER CONFIGURATION
// ============================================================================

export const AdminUserConfigSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, _, -",
    ),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z
    .string()
    .min(1, "Full name required")
    .default("System Administrator"),
});

export type AdminUserConfig = z.infer<typeof AdminUserConfigSchema>;

// ============================================================================
// DEPLOYMENT MODE & ENVIRONMENT
// ============================================================================

export const DeploymentModeSchema = z.enum(["beta", "production"]);
export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;

export const EnvironmentSchema = z.enum(["development", "production"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

// ============================================================================
// COMPLETE DEPLOYMENT CONFIG (All together)
// ============================================================================

export const DeploymentConfigSchema = z.object({
  mode: DeploymentModeSchema,
  version: z.string().default("1.0.0"),
  database: DatabaseConfigSchema,
  providers: AIProvidersConfigSchema,
  adminUser: AdminUserConfigSchema,
  securityConfig: z
    .object({
      NEXTAUTH_SECRET: z.string(),
      NEXTAUTH_URL: z.string(),
      DB_ENCRYPTION_KEY: z.string(),
      ENTITY_HASH_SALT: z.string(),
      AUTH_SYSTEM_ENABLED: z.string(),
      LOG_LLM_PROMPTS: z.string().optional(),
      DEBUG_COMPOSITION: z.string().optional(),
    })
    .optional(),
  docker: z
    .object({
      // For production mode
      enabled: z.boolean().default(false),
      registryUrl: z.string().optional(),
      imageName: z.string().default("insight-gen"),
      imageTag: z.string().default("latest"),
    })
    .optional(),
});

export type DeploymentConfig = z.infer<typeof DeploymentConfigSchema>;

// ============================================================================
// ENVIRONMENT FILE (.env.local / .env.production)
// ============================================================================

export const EnvFileSchema = z.object({
  // Database
  INSIGHT_GEN_DB_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  // AI Providers
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL_NAME: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  GOOGLE_CLOUD_LOCATION: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_DEFAULT_MODEL_NAME: z.string().optional(),
  OPENWEBUI_BASE_URL: z.string().optional(),
  OPENWEBUI_API_KEY: z.string().optional(),
  OPENWEBUI_DEFAULT_MODEL_NAME: z.string().optional(),

  // Auth
  NEXTAUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  AUTH_SYSTEM_ENABLED: z.string().optional(),

  // Admin defaults
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_FULL_NAME: z.string().optional(),

  // Encryption
  DB_ENCRYPTION_KEY: z.string().optional(),
  ENTITY_HASH_SALT: z.string().optional(),

  // Debugging
  DEBUG_COMPOSITION: z.string().optional(),
  LOG_LLM_PROMPTS: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export type EnvFile = z.infer<typeof EnvFileSchema>;

// ============================================================================
// UTILITY: Convert DeploymentConfig to .env format
// ============================================================================

export const configToEnvFile = (config: DeploymentConfig): string => {
  const lines: string[] = [];

  // Header
  lines.push("# Generated by InsightGen Setup Wizard");
  lines.push(`# Mode: ${config.mode}`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Database
  lines.push(
    "# =============================================================================",
  );
  lines.push("# DATABASE");
  lines.push(
    "# =============================================================================",
  );
  lines.push(`INSIGHT_GEN_DB_URL="${buildConnectionString(config.database)}"`);
  lines.push("");

  // AI Providers
  lines.push(
    "# =============================================================================",
  );
  lines.push("# AI PROVIDERS");
  lines.push(
    "# =============================================================================",
  );

  if (config.providers.anthropic.enabled) {
    lines.push(`ANTHROPIC_API_KEY="${config.providers.anthropic.apiKey}"`);
    lines.push(
      `ANTHROPIC_DEFAULT_MODEL_NAME="${config.providers.anthropic.modelName}"`,
    );
  }

  if (config.providers.google.enabled) {
    lines.push(`GOOGLE_CLOUD_PROJECT="${config.providers.google.projectId}"`);
    lines.push(`GOOGLE_CLOUD_LOCATION="${config.providers.google.location}"`);
    if (config.providers.google.credentialsPath) {
      lines.push(
        `GOOGLE_APPLICATION_CREDENTIALS="${config.providers.google.credentialsPath}"`,
      );
    }
    lines.push(
      `GOOGLE_DEFAULT_MODEL_NAME="${config.providers.google.modelName}"`,
    );
  }

  if (config.providers.openwebui.enabled) {
    lines.push(`OPENWEBUI_BASE_URL="${config.providers.openwebui.baseUrl}"`);
    lines.push(`OPENWEBUI_API_KEY="${config.providers.openwebui.apiKey}"`);
    if (config.providers.openwebui.modelName) {
      lines.push(
        `OPENWEBUI_DEFAULT_MODEL_NAME="${config.providers.openwebui.modelName}"`,
      );
    }
  }

  lines.push("");

  // Authentication
  lines.push(
    "# =============================================================================",
  );
  lines.push("# AUTHENTICATION & SESSION");
  lines.push(
    "# =============================================================================",
  );
  lines.push(`ADMIN_USERNAME="${config.adminUser.username}"`);
  lines.push(`ADMIN_PASSWORD="${config.adminUser.password}"`);
  lines.push(`ADMIN_EMAIL="${config.adminUser.email}"`);
  lines.push(`ADMIN_FULL_NAME="${config.adminUser.fullName}"`);
  // Defaults
  lines.push(
    "# =============================================================================",
  );
  lines.push("# DEFAULTS (Can override)");
  lines.push(
    "# =============================================================================",
  );
  lines.push(
    `NODE_ENV="${config.mode === "production" ? "production" : "development"}"`,
  );

  // Security configuration
  if (config.securityConfig) {
    lines.push("");
    lines.push(
      "# =============================================================================",
    );
    lines.push("# SECURITY & ENCRYPTION");
    lines.push(
      "# =============================================================================",
    );
    lines.push(`NEXTAUTH_SECRET="${config.securityConfig.NEXTAUTH_SECRET}"`);
    lines.push(`NEXTAUTH_URL="${config.securityConfig.NEXTAUTH_URL}"`);
    lines.push(
      `DB_ENCRYPTION_KEY="${config.securityConfig.DB_ENCRYPTION_KEY}"`,
    );
    lines.push(`ENTITY_HASH_SALT="${config.securityConfig.ENTITY_HASH_SALT}"`);
    lines.push(
      `AUTH_SYSTEM_ENABLED="${config.securityConfig.AUTH_SYSTEM_ENABLED}"`,
    );

    if (config.securityConfig.LOG_LLM_PROMPTS) {
      lines.push(`LOG_LLM_PROMPTS="${config.securityConfig.LOG_LLM_PROMPTS}"`);
    }

    if (config.securityConfig.DEBUG_COMPOSITION) {
      lines.push(
        `DEBUG_COMPOSITION="${config.securityConfig.DEBUG_COMPOSITION}"`,
      );
    }
  }

  lines.push("");

  return lines.join("\n");
};

// ============================================================================
// CUSTOMER SETUP CONFIGURATION (v1.0.1+)
// ============================================================================

export const CustomerSetupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().min(1, "Customer name required").max(100, "Name too long"),
  code: z
    .string()
    .min(1, "Customer code required")
    .regex(/^[a-z0-9-]+$/, "Code must be lowercase alphanumeric with dashes"),
  silhouetteDbUrl: z.string().url("Invalid database URL"),
  silhouetteVersion: z.string().optional(),
  estimatedFormCount: z.number().optional(),
  estimatedRecordCount: z.number().optional(),
  estimatedTableCount: z.number().optional(),
  estimatedDiscoveryMinutes: z.number().optional(),
  discoveryMode: z.enum(["start_now", "defer"]).default("defer"),
  skipIfExists: z.boolean().default(false),
});

export type CustomerSetupConfig = z.infer<typeof CustomerSetupConfigSchema>;

// Database size estimation for discovery time prediction
export const estimateDiscoveryTime = (recordCount: number): number => {
  if (recordCount < 100_000) return 5; // Small: 5-10 min
  if (recordCount < 1_000_000) return 10; // Medium: 10-15 min
  if (recordCount < 10_000_000) return 15; // Large: 15-20 min
  if (recordCount < 100_000_000) return 25; // Very large: 25-35 min
  return 45; // Huge: 45+ min
};

// ============================================================================
// PASSWORD STRENGTH VALIDATION
// ============================================================================

export const validatePasswordStrength = (
  password: string,
): { score: number; feedback: string[] } => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push("At least 8 characters");

  if (password.length >= 12) score += 1;
  else if (password.length >= 8) feedback.push("14+ characters recommended");

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Include lowercase letters");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Include uppercase letters");

  if (/\d/.test(password)) score += 1;
  else feedback.push("Include numbers");

  if (/[!@#$%^&*]/.test(password)) score += 1;
  else
    feedback.push("Include special characters (!@#$%^&*) for extra security");

  return { score: Math.min(score, 5), feedback };
};

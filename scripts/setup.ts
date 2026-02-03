#!/usr/bin/env tsx

/**
 * InsightGen Deployment Setup Wizard
 *
 * Interactive CLI for setting up InsightGen for Beta or Production deployment.
 * Supports both interactive mode (guided prompts) and non-interactive mode (config file).
 *
 * Usage:
 *   pnpm setup                                  # Interactive, auto-detect mode
 *   pnpm setup:beta                             # Interactive, beta mode
 *   pnpm setup:production                       # Interactive, production mode
 *   pnpm setup --config=config.json             # Non-interactive from config file
 *   pnpm setup --export-config=output.json      # Export current config
 */

import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { Listr } from "listr2";
import ora from "ora";
import inquirer from "inquirer";
import {
  DeploymentMode,
  DeploymentConfig,
  DatabaseConfig,
  AdminUserConfig,
  AIProvidersConfig,
  validatePasswordStrength,
  validateAIProviders,
} from "../lib/config/validation";
import { DeploymentConfigManager } from "../lib/config/deployment-config";

// ============================================================================
// CLI PROMPTS INTERFACE
// ============================================================================

interface CLIOptions {
  mode?: DeploymentMode;
  config?: string;
  exportConfig?: string;
  nonInteractive?: boolean;
}

// ============================================================================
// INTERACTIVE PROMPT USING INQUIRER
// ============================================================================

class InteractivePrompt {
  async input(options: {
    question: string;
    defaultValue?: string;
  }): Promise<string> {
    const answer = await inquirer.prompt([
      {
        type: "input",
        name: "answer",
        message: options.question,
        default: options.defaultValue,
      },
    ]);
    return answer.answer;
  }

  async select(
    question: string,
    choices: Array<{ name: string; value: string | boolean }>,
  ): Promise<string | boolean> {
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "answer",
        message: question,
        choices: choices.map((c) => ({ name: c.name, value: c.value })),
      },
    ]);
    return answer.answer;
  }

  async confirm(question: string): Promise<boolean> {
    const answer = await inquirer.prompt([
      {
        type: "confirm",
        name: "answer",
        message: question,
        default: false,
      },
    ]);
    return answer.answer;
  }

  async close(): Promise<void> {
    // inquirer closes automatically
  }
}

// ============================================================================
// SECURITY KEY GENERATION UTILITIES
// ============================================================================

/**
 * Generate a cryptographically secure random hex string
 * Used for NEXTAUTH_SECRET and DB_ENCRYPTION_KEY
 */
function generateSecureHex(bytes: number = 32): string {
  const crypto = require("crypto");
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Generate a random salt string for hashing
 * Used for ENTITY_HASH_SALT
 */
function generateSalt(length: number = 32): string {
  const crypto = require("crypto");
  return crypto.randomBytes(length).toString("base64").substring(0, length);
}

// ============================================================================
// SETUP WIZARD CLASS
// ============================================================================

class DeploymentWizard {
  private prompter: InteractivePrompt;
  private configManager: DeploymentConfigManager;
  private config: Partial<DeploymentConfig> = {};

  constructor() {
    this.prompter = new InteractivePrompt();
    this.configManager = new DeploymentConfigManager();
  }

  /**
   * Main entry point for the wizard
   */
  async run(options: CLIOptions): Promise<void> {
    try {
      console.log("\n" + chalk.bold.cyan("🚀 InsightGen Deployment Wizard\n"));

      // Handle non-interactive mode
      if (options.config) {
        await this.runNonInteractive(options.config);
        return;
      }

      // Handle export config
      if (options.exportConfig) {
        await this.exportCurrentConfig(options.exportConfig);
        return;
      }

      // Determine deployment mode
      let mode: DeploymentMode = options.mode || "beta";
      if (!options.mode) {
        const selected = await this.prompter.select("Which deployment mode?", [
          { name: "Beta (Office Network - Local Development)", value: "beta" },
          { name: "Production (Docker - On-Prem/Cloud)", value: "production" },
        ]);
        mode = selected as DeploymentMode;
      }

      console.log(chalk.green(`✓ Mode: ${mode}\n`));
      this.config.mode = mode;

      // Run mode-specific wizard
      if (mode === "beta") {
        await this.runBetaSetup();
      } else {
        await this.runProductionSetup();
      }

      // Show summary and next steps
      await this.showSummary();

      console.log(chalk.green("\n✅ Setup complete!\n"));
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red("\n❌ Setup failed:"), error.message);
      }
      process.exit(1);
    } finally {
      await this.prompter.close();
    }
  }

  /**
   * Beta deployment setup flow
   */
  private async runBetaSetup(): Promise<void> {
    console.log(chalk.bold("📋 Beta Setup Steps:\n"));

    // Step 1: PostgreSQL
    await this.setupDatabase(true);

    // Step 2: AI Providers
    await this.setupAIProviders();

    // Step 3: Admin User
    await this.setupAdminUser();

    // Step 4: Security Configuration
    await this.setupSecurityConfig(true);

    // Step 5: Run automation
    await this.runAutomation();
  }

  /**
   * Production deployment setup flow
   */
  private async runProductionSetup(): Promise<void> {
    console.log(chalk.bold("📋 Production Setup Steps:\n"));

    // Step 1: Database
    await this.setupDatabase(false);

    // Step 2: AI Providers
    await this.setupAIProviders();

    // Step 3: Admin User
    await this.setupAdminUser();

    // Step 4: Security Configuration
    await this.setupSecurityConfig(false);

    // Step 5: Run automation
    await this.runAutomation();
  }

  /**
   * Database configuration
   */
  private async setupDatabase(isBeta: boolean): Promise<void> {
    console.log(chalk.yellow("1️⃣  Database Configuration\n"));

    if (isBeta) {
      // Try auto-detect for beta
      const spinner = ora("Auto-detecting PostgreSQL...").start();
      const detected = await this.configManager.autoDetectPostgres();
      spinner.stop();

      if (detected) {
        const validation =
          await this.configManager.validateDatabaseConnection(detected);
        if (validation.success) {
          console.log(
            chalk.green("✓ PostgreSQL auto-detected at localhost:5432\n"),
          );
          this.config.database = detected;
          return;
        }
      }

      // Offer to start container
      const shouldStart = await this.prompter.confirm(
        "PostgreSQL not running. Start docker-compose container?",
      );

      if (shouldStart) {
        const spinner = ora("Starting PostgreSQL container...").start();
        const result = await this.configManager.startPostgresContainer();
        if (result.success) {
          spinner.succeed(result.message);
          this.config.database =
            (await this.configManager.autoDetectPostgres()) || undefined;
          console.log();
          return;
        } else {
          spinner.fail(result.error);
          throw new Error("Failed to start PostgreSQL");
        }
      }
    }

    // Manual database configuration
    const host = await this.prompter.input({
      question: "Database Host:",
      defaultValue: "localhost",
    });

    const portStr = await this.prompter.input({
      question: "Database Port:",
      defaultValue: "5432",
    });

    const username = await this.prompter.input({
      question: "Database Username:",
      defaultValue: "user",
    });

    const password = await this.prompter.input({
      question: "Database Password:",
      defaultValue: "password",
      password: true,
    });

    const database = await this.prompter.input({
      question: "Database Name:",
      defaultValue: "insight_gen_db",
    });

    const dbConfig: DatabaseConfig = {
      type: "postgresql",
      host,
      port: parseInt(portStr),
      username,
      password,
      database,
    };

    // Validate connection
    const spinner = ora("Validating database connection...").start();
    const validation =
      await this.configManager.validateDatabaseConnection(dbConfig);

    if (!validation.success) {
      spinner.fail(chalk.red(`Connection failed: ${validation.error}`));
      throw new Error("Database connection failed");
    }

    spinner.succeed(`Connected in ${validation.latency}ms`);
    this.config.database = dbConfig;
    console.log();
  }

  /**
   * AI Provider configuration
   */
  private async setupAIProviders(): Promise<void> {
    console.log(chalk.yellow("2️⃣  AI Provider Setup\n"));

    const providers: AIProvidersConfig = {
      anthropic: { enabled: false },
      google: { enabled: false },
      openwebui: { enabled: false },
    };

    // Select providers
    const enableAnthropic = await this.prompter.confirm(
      "Enable Anthropic Claude?",
    );

    if (enableAnthropic) {
      const apiKey = await this.prompter.input({
        question: "Anthropic API Key:",
      });

      const modelName = await this.prompter.input({
        question: "Model Name:",
        defaultValue: "claude-3-5-sonnet-20240620",
      });

      providers.anthropic = {
        enabled: true,
        apiKey,
        modelName,
      };
    }

    const enableGoogle = await this.prompter.confirm(
      "Enable Google Vertex AI?",
    );

    if (enableGoogle) {
      const projectId = await this.prompter.input({
        question: "Google Cloud Project ID:",
      });

      const location = await this.prompter.input({
        question: "Google Cloud Location:",
        defaultValue: "us-central1",
      });

      const credPath = await this.prompter.input({
        question: "Path to Google Credentials JSON (optional):",
      });

      const modelName = await this.prompter.input({
        question: "Model Name:",
        defaultValue: "gemini-2.5-pro",
      });

      providers.google = {
        enabled: true,
        projectId,
        location,
        credentialsPath: credPath || undefined,
        modelName,
      };
    }

    // Validate at least one provider
    const validation = validateAIProviders(providers);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid AI provider configuration");
    }

    this.config.providers = providers;
    console.log();
  }

  /**
   * Admin user configuration
   */
  private async setupAdminUser(): Promise<void> {
    console.log(chalk.yellow("3️⃣  Admin User Setup\n"));

    const username = await this.prompter.input({
      question: "Admin Username:",
      defaultValue: "admin",
    });

    const email = await this.prompter.input({
      question: "Admin Email:",
      defaultValue: "admin@silhouette.local",
    });

    const fullName = await this.prompter.input({
      question: "Full Name:",
      defaultValue: "System Administrator",
    });

    // Password with strength feedback
    let password: string;
    let passwordStrength: number = 0;

    while (passwordStrength < 2) {
      // Require at least moderate strength (2/5)
      password = await this.prompter.input({
        question: "Password (min 8 characters):",
        password: true,
      });

      const strength = validatePasswordStrength(password);
      passwordStrength = strength.score;

      if (passwordStrength < 2) {
        console.log(chalk.yellow("⚠️  Password could be stronger:"));
        strength.feedback.forEach((f) => console.log(`   - ${f}`));
        console.log();
      }
    }

    const adminUser: AdminUserConfig = {
      username,
      email,
      password,
      fullName,
    };

    this.config.adminUser = adminUser;
    console.log();
  }

  /**
   * Security configuration (encryption keys, auth secrets)
   */
  private async setupSecurityConfig(isBeta: boolean): Promise<void> {
    console.log(chalk.yellow("4️⃣  Security Configuration\n"));

    // NEXTAUTH_SECRET
    console.log(chalk.blue("NextAuth Secret:"));
    let nextAuthSecret: string;
    const useAutoGenSecret = await this.prompter.confirm(
      "Auto-generate NEXTAUTH_SECRET? (recommended for new installations)",
    );

    if (useAutoGenSecret) {
      nextAuthSecret = generateSecureHex(32); // 64 hex characters
      console.log(
        chalk.green(`✓ Generated: ${nextAuthSecret.substring(0, 16)}...`),
      );
    } else {
      nextAuthSecret = await this.prompter.input({
        question: "Enter NEXTAUTH_SECRET (min 32 bytes):",
        defaultValue: generateSecureHex(32),
      });
    }
    console.log();

    // DB_ENCRYPTION_KEY
    console.log(chalk.blue("Database Encryption Key:"));
    let dbEncryptionKey: string;
    const useAutoGenDbKey = await this.prompter.confirm(
      "Auto-generate DB_ENCRYPTION_KEY? (recommended for new installations)",
    );

    if (useAutoGenDbKey) {
      dbEncryptionKey = generateSecureHex(32); // 64 hex characters
      console.log(
        chalk.green(`✓ Generated: ${dbEncryptionKey.substring(0, 16)}...`),
      );
    } else {
      dbEncryptionKey = await this.prompter.input({
        question: "Enter DB_ENCRYPTION_KEY (64 hex characters = 32 bytes):",
        defaultValue: generateSecureHex(32),
      });
    }
    console.log();

    // ENTITY_HASH_SALT
    console.log(chalk.blue("Entity Hash Salt:"));
    let entityHashSalt: string;
    const useAutoGenSalt = await this.prompter.confirm(
      "Auto-generate ENTITY_HASH_SALT? (recommended for new installations)",
    );

    if (useAutoGenSalt) {
      entityHashSalt = generateSalt(32);
      console.log(
        chalk.green(`✓ Generated: ${entityHashSalt.substring(0, 16)}...`),
      );
    } else {
      entityHashSalt = await this.prompter.input({
        question: "Enter ENTITY_HASH_SALT (minimum 16 characters):",
        defaultValue: generateSalt(32),
      });
    }
    console.log();

    // NEXTAUTH_URL (different for beta vs production)
    let nextAuthUrl: string;
    if (isBeta) {
      nextAuthUrl = "http://localhost:3005";
      console.log(
        chalk.blue(`NextAuth URL: ${chalk.green(nextAuthUrl)} (beta default)`),
      );
    } else {
      nextAuthUrl = await this.prompter.input({
        question: "NextAuth URL (public URL of your deployment):",
        defaultValue: "https://example.com",
      });
    }
    console.log();

    // AUTH_SYSTEM_ENABLED
    const enableAuth = await this.prompter.confirm(
      "Enable authentication system?",
    );
    console.log();

    // Debug options (optional, mainly for beta)
    let logLlmPrompts = "false";
    let debugComposition = "false";

    if (isBeta) {
      const enableDebug = await this.prompter.confirm(
        "Enable debug options? (LLM prompt logging, composition debugging)",
      );

      if (enableDebug) {
        logLlmPrompts = (await this.prompter.confirm("Log LLM prompts?"))
          ? "true"
          : "false";
        debugComposition = (await this.prompter.confirm(
          "Debug SQL composition?",
        ))
          ? "true"
          : "false";
      }
      console.log();
    }

    // Store in config
    this.config.securityConfig = {
      NEXTAUTH_SECRET: nextAuthSecret,
      NEXTAUTH_URL: nextAuthUrl,
      DB_ENCRYPTION_KEY: dbEncryptionKey,
      ENTITY_HASH_SALT: entityHashSalt,
      AUTH_SYSTEM_ENABLED: enableAuth ? "true" : "false",
      LOG_LLM_PROMPTS: logLlmPrompts,
      DEBUG_COMPOSITION: debugComposition,
    };

    console.log(chalk.green("✓ Security configuration complete\n"));
  }

  /**
   * Run all automation tasks
   */
  private async runAutomation(): Promise<void> {
    console.log(chalk.yellow("5️⃣  Running Setup\n"));

    const config = this.config as DeploymentConfig;

    const tasks = new Listr(
      [
        {
          title: "Saving configuration",
          task: async () => {
            await this.configManager.saveConfig(
              config,
              config.mode === "production" ? "production" : "local",
            );
          },
        },
        {
          title: "Running database migrations",
          task: async () => {
            const { execSync } = await import("child_process");
            try {
              execSync("npm run migrate", { stdio: "pipe" });
            } catch (error) {
              throw new Error("Migrations failed");
            }
          },
        },
        {
          title: "Creating admin user",
          task: async () => {
            const { execSync } = await import("child_process");
            try {
              execSync("npm run seed-admin", { stdio: "pipe" });
            } catch (error) {
              throw new Error("Admin user creation failed");
            }
          },
        },
        {
          title: "Loading template catalog",
          task: async () => {
            const { execSync } = await import("child_process");
            try {
              execSync("npm run seed-template-catalog", { stdio: "pipe" });
            } catch (error) {
              // Template catalog is optional
            }
          },
        },
      ],
      {
        concurrent: false,
        rendererOptions: { showTimer: true },
      },
    );

    await tasks.run();
    console.log();
  }

  /**
   * Display summary and next steps
   */
  private async showSummary(): Promise<void> {
    const config = this.config as DeploymentConfig;

    console.log(chalk.bold.green("📋 Summary:\n"));

    console.log(chalk.gray("Configuration saved to:"));
    console.log(
      `  ${config.mode === "production" ? ".env.production" : ".env.local"}\n`,
    );

    console.log(chalk.gray("Next steps:"));

    if (config.mode === "beta") {
      console.log(`  1. ${chalk.cyan("pnpm dev")}`);
      console.log(`  2. Open ${chalk.blue("http://localhost:3005")}`);
      console.log(
        `  3. Login with: ${chalk.yellow(config.adminUser.username)} / [password]\n`,
      );
    } else {
      console.log(`  1. ${chalk.cyan("docker-compose up -d")}`);
      console.log(`  2. Open ${chalk.blue("http://your-server:3005")}`);
      console.log(
        `  3. Login with: ${chalk.yellow(config.adminUser.username)} / [password]\n`,
      );
    }

    console.log(chalk.gray("Common links:"));
    console.log(
      `  Dashboard:      ${chalk.blue("http://localhost:3005/dashboard")}`,
    );
    console.log(
      `  Templates:      ${chalk.blue("http://localhost:3005/templates")}`,
    );
    console.log(
      `  Admin Panel:    ${chalk.blue("http://localhost:3005/admin")}`,
    );
    console.log(
      `  Audit Dashboard: ${chalk.blue("http://localhost:3005/admin/audit")}\n`,
    );
  }

  /**
   * Non-interactive mode: load and run from config file
   */
  private async runNonInteractive(configPath: string): Promise<void> {
    const spinner = ora("Loading configuration...").start();

    const loaded = await this.configManager.loadConfigJSON(configPath);
    if (!loaded) {
      spinner.fail("Configuration file not found or invalid JSON");
      throw new Error(`Failed to load config: ${configPath}`);
    }

    spinner.succeed("Configuration loaded");
    this.config = loaded;

    // Run automation
    await this.runAutomation();
    await this.showSummary();

    console.log(chalk.green("\n✅ Setup complete!\n"));
  }

  /**
   * Export current configuration to JSON
   */
  private async exportCurrentConfig(outputPath: string): Promise<void> {
    const existing = await this.configManager.loadExistingConfig();

    if (!existing) {
      console.log(
        chalk.yellow(
          "⚠️  No existing configuration found. Run wizard first.\n",
        ),
      );
      return;
    }

    const masked = this.configManager.exportConfig(
      existing as DeploymentConfig,
    );
    fs.writeFileSync(outputPath, masked, "utf-8");

    console.log(chalk.green(`✅ Configuration exported to: ${outputPath}\n`));
    console.log(chalk.gray("(Sensitive values are masked for security)\n"));
  }
}

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--mode=beta" || arg === "-m=beta") {
      options.mode = "beta";
    } else if (arg === "--mode=production" || arg === "-m=production") {
      options.mode = "production";
    } else if (arg.startsWith("--config=")) {
      options.config = arg.split("=")[1];
    } else if (arg.startsWith("--export-config=")) {
      options.exportConfig = arg.split("=")[1];
    } else if (arg === "--non-interactive") {
      options.nonInteractive = true;
    }
  }

  return options;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  const options = parseArgs();
  const wizard = new DeploymentWizard();
  await wizard.run(options);
}

main().catch((error) => {
  console.error(chalk.red("\n💥 Fatal error:"), error.message);
  process.exit(1);
});

import { NextRequest, NextResponse } from "next/server";
import { ProviderHealthStatus } from "@/lib/services/ai-config.service";

/**
 * Validate provider configuration in development mode using environment variables
 */
async function validateEnvironmentProvider(
  providerType: string,
  providerName: string
): Promise<ProviderHealthStatus> {
  const startTime = Date.now();

  try {
    let isHealthy = false;
    let errorMessage = "";

    switch (providerType) {
      case "anthropic":
        isHealthy = await validateAnthropicEnvironment();
        break;
      case "google":
        isHealthy = await validateGoogleEnvironment();
        break;
      case "openwebui":
        isHealthy = await validateOpenWebUIEnvironment();
        break;
      default:
        errorMessage = `Unknown provider type: ${providerType}`;
    }

    const responseTime = Date.now() - startTime;

    return {
      providerType,
      providerName,
      isHealthy,
      status: isHealthy ? "valid" : "invalid",
      lastChecked: new Date(),
      errorMessage: isHealthy ? undefined : errorMessage,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown validation error";

    return {
      providerType,
      providerName,
      isHealthy: false,
      status: "error",
      lastChecked: new Date(),
      errorMessage,
      responseTime,
    };
  }
}

/**
 * Validate Anthropic configuration from environment
 */
async function validateAnthropicEnvironment(): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable not set");
  }

  // Simple validation - check if API key format is valid
  if (!apiKey.startsWith("sk-ant-")) {
    throw new Error("Invalid Anthropic API key format");
  }

  // Could add actual API call here for deeper validation
  return true;
}

/**
 * Validate Google configuration from environment
 */
async function validateGoogleEnvironment(): Promise<boolean> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new Error("GOOGLE_CLOUD_PROJECT environment variable not set");
  }

  // Basic validation - check if project ID looks reasonable
  if (projectId.length < 3 || !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(projectId)) {
    throw new Error("Invalid Google Cloud project ID format");
  }

  // Could add actual API call here for deeper validation
  return true;
}

/**
 * Validate Open WebUI configuration from environment
 */
async function validateOpenWebUIEnvironment(): Promise<boolean> {
  const baseUrl = process.env.OPENWEBUI_BASE_URL;
  if (!baseUrl) {
    throw new Error("OPENWEBUI_BASE_URL environment variable not set");
  }

  try {
    new URL(baseUrl);
  } catch {
    throw new Error(`Invalid Open WebUI base URL: ${baseUrl}`);
  }

  // Test connection to Open WebUI
  try {
    const headers: Record<string, string> = {};
    if (process.env.OPENWEBUI_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENWEBUI_API_KEY}`;
    }

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    return response.ok;
  } catch (error) {
    throw new Error(
      `Open WebUI connection failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, providerType, providerName } = body;

    if (!action || !providerType || !providerName) {
      console.log(`Missing required fields`);
      return NextResponse.json(
        {
          error: "Missing required fields: action, providerType, providerName",
        },
        { status: 400 }
      );
    }

    // Allow validation in development mode, but block other actions
    const isDevelopment = process.env.NODE_ENV !== "production";
    if (isDevelopment && action !== "validate") {
      return NextResponse.json(
        {
          error:
            "Configuration actions are disabled in development mode. Please update your .env.local file instead.",
        },
        { status: 403 }
      );
    }

    // In production mode, use the database service
    const { aiConfigService } = await import(
      "@/lib/services/ai-config.service"
    );

    let success = false;

    switch (action) {
      case "enable":
        success = await aiConfigService.setProviderEnabled(
          providerType,
          providerName,
          true,
          "admin"
        );
        break;

      case "disable":
        success = await aiConfigService.setProviderEnabled(
          providerType,
          providerName,
          false,
          "admin"
        );
        break;

      case "setDefault":
        success = await aiConfigService.setDefaultProvider(
          providerType,
          providerName,
          "admin"
        );
        break;

      case "validate":
        try {
          if (isDevelopment) {
            // In development mode, validate environment-based configuration
            const healthStatus = await validateEnvironmentProvider(
              providerType,
              providerName
            );

            // In development mode, we can't persist validation status to database,
            // but we can return the current validation result
            // The frontend will need to refresh to get updated status
            return NextResponse.json(healthStatus);
          } else {
            // In production mode, use database service
            const healthStatus =
              await aiConfigService.validateConfigurationByName(
                providerType,
                providerName
              );
            return NextResponse.json(healthStatus);
          }
        } catch (validationError) {
          console.error(`Validation failed with error:`, validationError);
          return NextResponse.json(
            {
              error: "Validation failed",
              details:
                validationError instanceof Error
                  ? validationError.message
                  : "Unknown error",
              providerType,
              providerName,
            },
            { status: 500 }
          );
        }

      default:
        console.log(`Invalid action: ${action}`);
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      console.log(`Action failed`);
      return NextResponse.json({ error: "Action failed" }, { status: 500 });
    }
  } catch (error) {
    console.error(`Unexpected error in POST handler:`, error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

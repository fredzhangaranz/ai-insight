import { NextRequest, NextResponse } from "next/server";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";

export async function GET() {
  try {
    const configLoader = AIConfigLoader.getInstance();
    const { providers } = await configLoader.getConfiguration();

    // In development mode, the providers are already in the right format
    // In production mode, they're loaded from database and already formatted
    return NextResponse.json(providers);
  } catch (error) {
    console.error("Error fetching AI configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch configurations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, providerName, configData, isEnabled, isDefault } =
      body;

    if (!providerType || !providerName || !configData) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: providerType, providerName, configData",
        },
        { status: 400 }
      );
    }

    // In development mode, configurations are managed via environment variables
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error:
            "Configuration changes are disabled in development mode. Please update your .env.local file instead.",
        },
        { status: 403 }
      );
    }

    // In production mode, use the database service
    const { aiConfigService } = await import(
      "@/lib/services/ai-config.service"
    );

    const configuration = await aiConfigService.saveConfiguration(
      providerType,
      providerName,
      configData,
      isEnabled ?? true,
      isDefault ?? false,
      "admin"
    );

    return NextResponse.json(configuration);
  } catch (error) {
    console.error("Error creating AI configuration:", error);
    return NextResponse.json(
      { error: "Failed to create configuration" },
      { status: 500 }
    );
  }
}

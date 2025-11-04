import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/middleware/auth-middleware";
import { AIConfigLoader } from "@/lib/config/ai-config-loader";
import { healthMonitorService } from "@/lib/services/health-monitor.service";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Ensure health monitor is running in production
    healthMonitorService.start();
    const configLoader = AIConfigLoader.getInstance();
    const { providers, source } = await configLoader.getConfiguration();

    // In development mode, the providers are already in the right format
    // In production mode, they're loaded from database and already formatted
    return NextResponse.json(providers, {
      headers: { "x-ai-config-source": source },
    });
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
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

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

    // Use the database service
    const { aiConfigService } = await import(
      "@/lib/services/ai-config.service"
    );

    const configuration = await aiConfigService.saveConfiguration(
      providerType,
      providerName,
      configData,
      isEnabled ?? true,
      isDefault ?? false,
      authResult.user.username || authResult.user.name || "admin"
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

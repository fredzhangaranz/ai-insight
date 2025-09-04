import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // In development mode, configuration updates are disabled
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error:
            "Configuration updates are disabled in development mode. Please update your .env.local file instead.",
        },
        { status: 403 }
      );
    }

    // In production mode, use the database service
    const { aiConfigService } = await import(
      "@/lib/services/ai-config.service"
    );

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid configuration ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { providerType, providerName, configData, isEnabled, isDefault } =
      body;

    if (!providerType || !providerName) {
      return NextResponse.json(
        { error: "Missing required fields: providerType, providerName" },
        { status: 400 }
      );
    }

    const configuration = await aiConfigService.saveConfiguration(
      providerType,
      providerName,
      configData || {},
      isEnabled ?? true,
      isDefault ?? false,
      "admin"
    );

    return NextResponse.json(configuration);
  } catch (error) {
    console.error("Error updating AI configuration:", error);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // In development mode, configuration deletions are disabled
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json(
        {
          error:
            "Configuration deletions are disabled in development mode. Please update your .env.local file instead.",
        },
        { status: 403 }
      );
    }

    // In production mode, use the database service
    const { aiConfigService } = await import(
      "@/lib/services/ai-config.service"
    );

    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid configuration ID" },
        { status: 400 }
      );
    }

    // Get configuration details first
    const configurations = await aiConfigService.getAllConfigurations();
    const config = configurations.find((c) => c.id === id);

    if (!config) {
      return NextResponse.json(
        { error: "Configuration not found" },
        { status: 404 }
      );
    }

    const success = await aiConfigService.deleteConfiguration(
      config.providerType,
      config.providerName,
      "admin"
    );

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { error: "Failed to delete configuration" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error deleting AI configuration:", error);
    return NextResponse.json(
      { error: "Failed to delete configuration" },
      { status: 500 }
    );
  }
}

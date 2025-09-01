import { NextRequest, NextResponse } from "next/server";
import { aiConfigService } from "@/lib/services/ai-config.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

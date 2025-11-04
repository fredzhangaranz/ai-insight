import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/auth-middleware";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication and admin authorization
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Use the database service
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
      authResult.user.username || authResult.user.name || "admin"
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
    // Check authentication and admin authorization
    const authResult = await requireAdmin(request);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Use the database service
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

    // Delete directly by ID (more reliable than providerType/name matching)
    const success = await aiConfigService.deleteConfigurationById(id);

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
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorDetails =
      error instanceof Error && (error as any).detail
        ? (error as any).detail
        : undefined;

    return NextResponse.json(
      {
        error: "Failed to delete configuration",
        message: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

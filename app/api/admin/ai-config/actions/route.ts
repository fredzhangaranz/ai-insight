import { NextRequest, NextResponse } from "next/server";
import { aiConfigService } from "@/lib/services/ai-config.service";

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
          const healthStatus =
            await aiConfigService.validateConfigurationByName(
              providerType,
              providerName
            );
          return NextResponse.json(healthStatus);
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

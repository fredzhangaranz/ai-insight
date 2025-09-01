import { NextRequest, NextResponse } from "next/server";
import { aiConfigService } from "@/lib/services/ai-config.service";

export async function GET() {
  try {
    const configurations = await aiConfigService.getAllConfigurations();
    return NextResponse.json(configurations);
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

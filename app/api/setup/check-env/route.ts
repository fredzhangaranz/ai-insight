import { NextResponse } from "next/server";
import { setupService } from "@/lib/services/setup.service";

export async function GET() {
  try {
    const hasEnvironmentVariables =
      setupService.checkEnvironmentVariableSetup();

    return NextResponse.json({
      hasEnvironmentVariables,
      detectedProviders: {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        google: !!process.env.GOOGLE_CLOUD_PROJECT,
        openwebui: !!process.env.OPENWEBUI_BASE_URL,
      },
    });
  } catch (error) {
    console.error("Error checking environment variables:", error);
    return NextResponse.json(
      { error: "Failed to check environment variables" },
      { status: 500 }
    );
  }
}

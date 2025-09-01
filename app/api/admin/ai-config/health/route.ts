import { NextResponse } from "next/server";
import { aiConfigService } from "@/lib/services/ai-config.service";

export async function GET() {
  try {
    const healthStatuses = await aiConfigService.getAllProviderHealth();
    return NextResponse.json(healthStatuses);
  } catch (error) {
    console.error("Error fetching AI provider health:", error);
    return NextResponse.json(
      { error: "Failed to fetch health status" },
      { status: 500 }
    );
  }
}

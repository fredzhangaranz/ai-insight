import { NextResponse } from "next/server";
import { setupService } from "@/lib/services/setup.service";

export async function GET() {
  try {
    const setupStatus = await setupService.checkSetupStatus();
    return NextResponse.json(setupStatus);
  } catch (error) {
    console.error("Error checking setup status:", error);
    return NextResponse.json(
      { error: "Failed to check setup status" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const result = await setupService.initializeFromEnvironment();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error initializing from environment:", error);
    return NextResponse.json(
      { error: "Failed to initialize from environment" },
      { status: 500 }
    );
  }
}

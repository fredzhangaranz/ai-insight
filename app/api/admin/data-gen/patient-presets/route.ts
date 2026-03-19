import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listPatientPresets } from "@/lib/services/data-gen/patient-preset.service";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(listPatientPresets());
  } catch (error: unknown) {
    console.error("Error listing patient presets:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch patient presets",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

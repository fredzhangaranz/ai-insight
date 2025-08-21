import { NextResponse } from "next/server";
import { MetricsMonitor } from "@/lib/monitoring";

export async function POST() {
  try {
    // Reset the MetricsMonitor singleton instance
    MetricsMonitor.resetInstance();

    return NextResponse.json({
      success: true,
      message: "MetricsMonitor instance reset successfully",
    });
  } catch (error) {
    console.error("Failed to reset MetricsMonitor:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to reset MetricsMonitor instance",
      },
      { status: 500 }
    );
  }
}

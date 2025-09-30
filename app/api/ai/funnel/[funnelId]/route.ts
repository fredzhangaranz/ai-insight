import { NextResponse } from "next/server";
import { deleteFunnelCascade } from "@/lib/services/funnel-storage.service";

export async function DELETE(
  _request: Request,
  { params }: { params: { funnelId: string } }
) {
  const id = Number(params.funnelId);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ message: "Invalid funnel id" }, { status: 400 });
  }

  try {
    await deleteFunnelCascade(id);
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error("Failed to delete funnel", error);
    return NextResponse.json(
      { message: "Failed to delete funnel" },
      { status: 500 }
    );
  }
}

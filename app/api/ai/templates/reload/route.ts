import { NextRequest, NextResponse } from "next/server";

import { invalidateTemplateCache } from "@/lib/services/template.service";

export async function POST(_req: NextRequest) {
  invalidateTemplateCache();
  return NextResponse.json({ message: "Template catalog cache cleared" });
}

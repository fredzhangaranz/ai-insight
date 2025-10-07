import { NextRequest, NextResponse } from "next/server";

import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import { invalidateTemplateCache } from "@/lib/services/template.service";

export async function POST(_req: NextRequest) {
  if (!isTemplateSystemEnabled()) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }

  invalidateTemplateCache();
  return NextResponse.json({ message: "Template catalog cache cleared" });
}

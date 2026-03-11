import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/auth-middleware";

/**
 * GET /api/admin/ai-config/lmstudio-models?baseUrl=http://localhost:1234
 *
 * Fetches the list of loaded models from an LM Studio server (OpenAI-compatible /v1/models).
 * Used by the admin UI to populate the model dropdown when configuring LM Studio.
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const baseUrl = req.nextUrl.searchParams.get("baseUrl")?.trim();
    if (!baseUrl) {
      return NextResponse.json(
        { error: "baseUrl query parameter is required" },
        { status: 400 }
      );
    }

    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid baseUrl" },
        { status: 400 }
      );
    }

    // Only allow http/localhost for security (LM Studio is local)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return NextResponse.json(
        { error: "baseUrl must be http or https" },
        { status: 400 }
      );
    }

    const modelsUrl = `${baseUrl.replace(/\/$/, "")}/v1/models`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(modelsUrl, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: "LM Studio request failed",
          status: response.status,
          detail: text.slice(0, 200),
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const list = data?.data;
    const modelIds = Array.isArray(list)
      ? list.map((m: { id?: string }) => m?.id).filter(Boolean)
      : [];

    return NextResponse.json({ modelIds });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request to LM Studio timed out" },
        { status: 504 }
      );
    }
    console.error("[lmstudio-models] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch models from LM Studio" },
      { status: 500 }
    );
  }
}

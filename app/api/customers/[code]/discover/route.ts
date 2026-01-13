import { NextRequest, NextResponse } from "next/server";

import {
  createErrorResponse,
  withErrorHandling,
} from "@/app/api/error-handler";
import { requireAdmin } from "@/lib/middleware/auth-middleware";
import {
  getDiscoveryHistory,
  runFullDiscovery,
  runFullDiscoveryWithProgress,
} from "@/lib/services/discovery-orchestrator.service";

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { code: string } }) => {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const history = await getDiscoveryHistory(params.code, 5);
    return NextResponse.json({ runs: history });
  }
);

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { code: string } }) => {
    const authResult = await requireAdmin(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Parse request body for discovery options
    const body = await req.json().catch(() => ({}));
    const { stages, stream: clientStream } = body;

    // Check if client wants streaming updates (for progress indication)
    const wantStream =
      clientStream === true || req.headers.get("x-stream-progress") === "true";

    if (wantStream) {
      // Return streaming response with progress events
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const sendEvent = (type: string, data: any) => {
              controller.enqueue(
                new TextEncoder().encode(JSON.stringify({ type, data }) + "\n")
              );
            };

            const result = await runFullDiscoveryWithProgress(
              { customerCode: params.code, stages },
              sendEvent
            );
            sendEvent("complete", result);
            controller.close();
          } catch (error: any) {
            const message =
              error instanceof Error
                ? error.message
                : "Discovery failed unexpectedly";
            controller.enqueue(
              new TextEncoder().encode(
                JSON.stringify({
                  type: "error",
                  data: {
                    status: "failed",
                    error: message,
                  },
                }) + "\n"
              )
            );
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // Fallback: Non-streaming response for backward compatibility
    try {
      const result = await runFullDiscovery({
        customerCode: params.code,
        stages,
      });
      const statusCode = result.status === "succeeded" ? 200 : 500;
      return NextResponse.json(result, { status: statusCode });
    } catch (error: any) {
      const message =
        error instanceof Error
          ? error.message
          : "Discovery failed unexpectedly";
      if (message.toLowerCase().includes("not found")) {
        return createErrorResponse.notFound(message);
      }

      throw error;
    }
  }
);

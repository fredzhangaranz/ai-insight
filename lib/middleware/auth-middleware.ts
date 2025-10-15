import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/auth-options";
import { getAuthConfig } from "@/lib/auth/auth-config";

const authConfig = getAuthConfig();

type RequireAuthSuccess = {
  session: Awaited<ReturnType<typeof getServerSession>>;
  user: NonNullable<Awaited<ReturnType<typeof getServerSession>>["user"]>;
};

export async function requireAuth(
  req: NextRequest
): Promise<RequireAuthSuccess | NextResponse> {
  if (!authConfig.isEnabled) {
    // Auth disabled: return a faux user for convenience (no session required)
    return {
      session: {
        user: {
          id: "0",
          username: "anonymous",
          role: "admin",
          mustChangePassword: false,
        },
      } as any,
      user: {
        id: "0",
        username: "anonymous",
        role: "admin",
        mustChangePassword: false,
      },
    };
  }

  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "You must be logged in" },
      { status: 401 }
    );
  }

  return { session, user: session.user };
}

export async function requireAdmin(
  req: NextRequest
): Promise<RequireAuthSuccess | NextResponse> {
  const authResult = await requireAuth(req);

  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user } = authResult;

  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Forbidden", message: "Admin access required" },
      { status: 403 }
    );
  }

  return authResult;
}

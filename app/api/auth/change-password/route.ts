import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth/auth-options";
import { UserService } from "@/lib/services/user-service";

const ERROR_INVALID_BODY = "Request body must include oldPassword, newPassword, and confirmPassword.";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized", message: "You must be logged in to change your password." },
      { status: 401 }
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "InvalidRequest", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const { oldPassword, newPassword, confirmPassword } =
    (parsedBody as Record<string, string | undefined>) ?? {};

  if (!oldPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { error: "InvalidRequest", message: ERROR_INVALID_BODY },
      { status: 400 }
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "InvalidRequest", message: "New password and confirmation must match." },
      { status: 400 }
    );
  }

  const userId = Number.parseInt(session.user.id, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json(
      { error: "InvalidSession", message: "Authenticated user id is invalid." },
      { status: 400 }
    );
  }

  try {
    await UserService.changePassword(userId, oldPassword, newPassword);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "InvalidPassword") {
        return NextResponse.json(
          { error: "InvalidCredentials", message: "Old password is incorrect." },
          { status: 400 }
        );
      }
      if (err.message === "UserNotFound") {
        return NextResponse.json(
          { error: "NotFound", message: "User account not found." },
          { status: 404 }
        );
      }
    }

    console.error("Failed to change password", err);
    return NextResponse.json(
      { error: "ServerError", message: "Unable to change password right now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}

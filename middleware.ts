import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { withAuth } from "next-auth/middleware";

import { getAuthConfig } from "@/lib/auth/auth-config";

const authConfig = getAuthConfig();

function handleWhenDisabled(req: NextRequest) {
  if (!authConfig.isEnabled) {
    // When auth is disabled, allow all requests through untouched.
    return NextResponse.next();
  }

  // Special case: allow public assets and login when enabled (handled in matcher)
  return NextResponse.next();
}

export default withAuth(
  function middleware(req) {
    if (!authConfig.isEnabled) {
      return handleWhenDisabled(req);
    }

    const token = req.nextauth?.token;

    // Admin routes require admin role
    if (req.nextUrl.pathname.startsWith("/admin")) {
      if (token?.role !== "admin") {
        return NextResponse.rewrite(new URL("/unauthorized", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => {
        if (!authConfig.isEnabled) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|api/auth).*)"],
};

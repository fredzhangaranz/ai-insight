"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  loadingFallback?: ReactNode;
}

const DEFAULT_LOADING = (
  <div className="flex h-full w-full items-center justify-center p-6 text-sm text-slate-600">
    Loading...
  </div>
);

export function ProtectedRoute({
  children,
  requireAdmin = false,
  loadingFallback = DEFAULT_LOADING,
}: ProtectedRouteProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      const callback = pathname
        ? `/login?callbackUrl=${encodeURIComponent(pathname)}`
        : "/login";
      router.replace(callback);
      return;
    }

    if (requireAdmin && session.user.role !== "admin") {
      router.replace("/unauthorized");
    }
  }, [session, status, requireAdmin, router, pathname]);

  if (status === "loading") {
    return <>{loadingFallback}</>;
  }

  if (!session) {
    return null;
  }

  if (requireAdmin && session.user.role !== "admin") {
    return null;
  }

  return <>{children}</>;
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function MustChangePasswordBanner() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session?.user?.mustChangePassword) {
    return null;
  }

  return (
    <Alert
      variant="destructive"
      className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
    >
      <AlertDescription>
        You must change your password before continuing to use InsightGen.
      </AlertDescription>
      <Button asChild variant="secondary" size="sm">
        <Link href="/profile">Change password</Link>
      </Button>
    </Alert>
  );
}

"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";

function ProfileContent() {
  const { data: session } = useSession();
  const router = useRouter();

  const user = session?.user;

  const lastLogin = useMemo(() => {
    if (!user?.lastLoginAt) return "Never";
    try {
      return new Date(user.lastLoginAt).toLocaleString();
    } catch (error) {
      return user.lastLoginAt;
    }
  }, [user?.lastLoginAt]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>View your account details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-500">Username</p>
            <p className="text-sm font-medium text-slate-900">
              {user?.username}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Full name</p>
            <p className="text-sm font-medium text-slate-900">
              {user?.fullName || "Not set"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Email</p>
            <p className="text-sm font-medium text-slate-900">{user?.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Role</p>
            <Badge variant={user?.role === "admin" ? "default" : "secondary"}>
              {user?.role === "admin" ? "Admin" : "Standard user"}
            </Badge>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Last login</p>
            <p className="text-sm font-medium text-slate-900">{lastLogin}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.mustChangePassword && (
            <Alert className="mb-4" variant="destructive">
              <AlertDescription>
                You must change your password before continuing to use
                InsightGen.
              </AlertDescription>
            </Alert>
          )}
          <ChangePasswordForm onSuccess={() => router.refresh()} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}

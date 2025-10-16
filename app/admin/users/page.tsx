"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  PlusIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";

import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";

import {
  CreateUserDialog,
  CreateUserPayload,
} from "@/components/admin/CreateUserDialog";
import {
  EditUserDialog,
  EditUserPayload,
} from "@/components/admin/EditUserDialog";
import { ResetPasswordDialog } from "@/components/admin/ResetPasswordDialog";
import {
  UserAuditLogDialog,
  UserAuditEntry,
} from "@/components/admin/UserAuditLogDialog";

interface AdminUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: "standard_user" | "admin";
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

async function apiRequest<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body?.message || body?.error || message;
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function UsersPageContent() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);
  const [isAuditOpen, setAuditOpen] = useState(false);

  const [activeUser, setActiveUser] = useState<AdminUser | null>(null);
  const [auditEntries, setAuditEntries] = useState<UserAuditEntry[]>([]);
  const [isAuditLoading, setAuditLoading] = useState(false);

  const [isSubmitting, setSubmitting] = useState(false);

  const refreshUsers = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await apiRequest<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (error: any) {
      setLoadError(error?.message || "Unable to load users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUsers();
  }, []);

  const activeCount = useMemo(
    () => users.filter((user) => user.isActive).length,
    [users]
  );

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users]
  );

  const handleCreateUser = async (payload: CreateUserPayload) => {
    setSubmitting(true);
    try {
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({
        title: "User created",
        description: `${payload.username} can now sign in.`,
      });
      await refreshUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (updates: EditUserPayload, user: AdminUser) => {
    setSubmitting(true);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      toast({
        title: "User updated",
        description: `${user.username} profile updated.`,
      });
      await refreshUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateUser = async (user: AdminUser) => {
    setSubmitting(true);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "DELETE",
      });
      toast({
        title: "User deactivated",
        description: `${user.username} can no longer sign in.`,
      });
      await refreshUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (password: string, user: AdminUser) => {
    setSubmitting(true);
    try {
      const data = await apiRequest<{
        userId: number;
        temporaryPassword: string;
      }>(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      toast({
        title: "Password reset",
        description: `Temporary password: ${data.temporaryPassword}`,
      });
      await refreshUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const loadAuditLog = useCallback(
    async (user: AdminUser) => {
      setAuditLoading(true);
      try {
        const data = await apiRequest<{ entries: UserAuditEntry[] }>(
          `/api/admin/users/${user.id}/audit-log`
        );
        setAuditEntries(data.entries);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Unable to load audit log",
          description: error?.message,
        });
      } finally {
        setAuditLoading(false);
      }
    },
    [toast]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>User management</CardTitle>
            <CardDescription>
              Administer InsightGen accounts, reset passwords, and audit
              activity.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={refreshUsers}
              disabled={isLoading}
            >
              <ArrowPathIcon className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" /> Create user
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm text-slate-600">
            <span>{users.length} total users</span>
            <span>{activeCount} active</span>
            <span>{adminCount} admins</span>
          </div>
        </CardContent>
      </Card>

      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className={!user.isActive ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      <div className="font-medium">{user.username}</div>
                      {user.mustChangePassword && (
                        <Badge className="mt-1" variant="outline">
                          Must change password
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{user.fullName}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.role === "admin" ? "default" : "secondary"
                        }
                      >
                        {user.role === "admin" ? "Admin" : "User"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.lastLoginAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <EllipsisVerticalIcon className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(user);
                              setEditOpen(true);
                            }}
                          >
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(user);
                              setResetOpen(true);
                            }}
                          >
                            Reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setActiveUser(user);
                              setAuditOpen(true);
                              setAuditEntries([]);
                              loadAuditLog(user);
                            }}
                          >
                            View audit log
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!user.isActive}
                            onClick={() => handleDeactivateUser(user)}
                          >
                            Deactivate user
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {users.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-600">
                No users yet. Create your first user to get started.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <CreateUserDialog
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreate={handleCreateUser}
        isSubmitting={isSubmitting}
      />

      <EditUserDialog
        open={isEditOpen}
        onOpenChange={setEditOpen}
        initialValues={
          activeUser
            ? {
                fullName: activeUser.fullName,
                email: activeUser.email,
                role: activeUser.role,
              }
            : null
        }
        onSave={(payload) =>
          activeUser ? handleEditUser(payload, activeUser) : Promise.resolve()
        }
        isSubmitting={isSubmitting}
      />

      <ResetPasswordDialog
        open={isResetOpen}
        onOpenChange={setResetOpen}
        onReset={(password) =>
          activeUser
            ? handleResetPassword(password, activeUser)
            : Promise.resolve()
        }
        isSubmitting={isSubmitting}
      />

      <UserAuditLogDialog
        open={isAuditOpen}
        onOpenChange={setAuditOpen}
        userDisplayName={activeUser?.username}
        entries={auditEntries}
        isLoading={isAuditLoading}
        onRefresh={activeUser ? () => loadAuditLog(activeUser) : undefined}
      />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <ProtectedRoute requireAdmin>
      <UsersPageContent />
    </ProtectedRoute>
  );
}

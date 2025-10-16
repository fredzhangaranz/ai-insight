"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface CreateUserPayload {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: "standard_user" | "admin";
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: CreateUserPayload) => Promise<void>;
  isSubmitting?: boolean;
}

const DEFAULT_STATE: CreateUserPayload = {
  username: "",
  email: "",
  fullName: "",
  password: "",
  role: "standard_user",
};

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreate,
  isSubmitting = false,
}: CreateUserDialogProps) {
  const [form, setForm] = useState<CreateUserPayload>(DEFAULT_STATE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_STATE);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onCreate(form);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Unable to create user. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Provision a new InsightGen account. The user will be required to change their password on first login.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="create-username">Username</Label>
            <Input
              id="create-username"
              value={form.username}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, username: event.target.value }))
              }
              minLength={3}
              required
              placeholder="your.username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-fullName">Full name</Label>
            <Input
              id="create-fullName"
              value={form.fullName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, fullName: event.target.value }))
              }
              required
              placeholder="First Last"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-password">Temporary password</Label>
            <Input
              id="create-password"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={form.role}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, role: value as CreateUserPayload["role"] }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard_user">Standard user</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

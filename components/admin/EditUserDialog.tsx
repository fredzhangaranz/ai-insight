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

export interface EditUserPayload {
  fullName: string;
  email: string;
  role: "standard_user" | "admin";
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues: EditUserPayload | null;
  onSave: (updates: EditUserPayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function EditUserDialog({
  open,
  onOpenChange,
  initialValues,
  onSave,
  isSubmitting = false,
}: EditUserDialogProps) {
  const [form, setForm] = useState<EditUserPayload | null>(initialValues);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialValues);
      setError(null);
    }
  }, [open, initialValues]);

  if (!form) return null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await onSave(form);
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Unable to update user. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update profile details or adjust role.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-fullName">Full name</Label>
            <Input
              id="edit-fullName"
              value={form.fullName}
              onChange={(event) =>
                setForm((prev) =>
                  prev ? { ...prev, fullName: event.target.value } : prev
                )
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((prev) =>
                  prev ? { ...prev, email: event.target.value } : prev
                )
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select
              value={form.role}
              onValueChange={(value) =>
                setForm((prev) =>
                  prev ? { ...prev, role: value as EditUserPayload["role"] } : prev
                )
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
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

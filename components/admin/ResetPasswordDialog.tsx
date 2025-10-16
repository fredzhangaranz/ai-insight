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
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReset: (password: string) => Promise<void>;
  isSubmitting?: boolean;
}

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

function generatePassword(length = 12) {
  if (typeof window === "undefined" || !window.crypto) {
    return Math.random().toString(36).slice(2, 2 + length);
  }
  const array = new Uint32Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array, (value) => CHARSET[value % CHARSET.length]).join("");
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  onReset,
  isSubmitting = false,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState(generatePassword());
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword(generatePassword());
      setError(null);
      setRevealed(false);
      setCompleted(false);
    }
  }, [open]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Temporary password must be at least 8 characters.");
      return;
    }

    try {
      await onReset(password);
      setRevealed(true);
      setCompleted(true);
    } catch (err: any) {
      setError(err?.message || "Unable to reset password. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Generate a temporary password for the user. Share it securely and remind them to change it after login.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="reset-password">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="reset-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={revealed ? "text" : "password"}
                minLength={8}
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPassword(generatePassword());
                  setCompleted(false);
                  setRevealed(false);
                }}
              >
                Regenerate
              </Button>
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setRevealed((prev) => !prev)}
            >
              {revealed ? "Hide" : "Show"} password
            </Button>
          </div>

          {completed && (
            <Alert>
              <AlertDescription>
                Password reset. Share the temporary password with the user and remind them to change it after signing in.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Resetting..." : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

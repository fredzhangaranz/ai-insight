"use client";

import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export interface UserAuditEntry {
  id: number;
  userId: number;
  action: string;
  performedBy: number | null;
  performedAt: string;
  details: Record<string, unknown> | null;
}

interface UserAuditLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userDisplayName?: string;
  entries: UserAuditEntry[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch (error) {
    return value;
  }
}

export function UserAuditLogDialog({
  open,
  onOpenChange,
  userDisplayName,
  entries,
  isLoading = false,
  onRefresh,
}: UserAuditLogDialogProps) {
  useEffect(() => {
    if (open && onRefresh) {
      onRefresh();
    }
  }, [open]); // Only depend on 'open', not 'onRefresh' to avoid infinite loops

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
          <DialogDescription>
            Recent actions for {userDisplayName || "selected user"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-6 text-sm text-slate-600">
              Loading audit entries...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-slate-600">
              No audit events recorded.
            </div>
          ) : (
            <ScrollArea className="max-h-80 rounded border border-slate-200">
              <ul className="divide-y divide-slate-200">
                {entries.map((entry) => (
                  <li key={entry.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {entry.action.replace(/_/g, " ")}
                        </Badge>
                        <span className="text-slate-600">
                          {formatTimestamp(entry.performedAt)}
                        </span>
                      </div>
                      {entry.performedBy !== null && (
                        <span className="text-xs text-slate-500">
                          by user #{entry.performedBy}
                        </span>
                      )}
                    </div>
                    {entry.details && (
                      <pre className="mt-3 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-600">
                        {JSON.stringify(entry.details, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

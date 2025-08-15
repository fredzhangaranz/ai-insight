"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface SqlDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  originalSql: string;
  modifiedSql: string;
  warnings?: string[];
  fieldsApplied?: string[];
  joinSummary?: string;
}

export function SqlDiffModal({
  isOpen,
  onClose,
  onConfirm,
  originalSql,
  modifiedSql,
  warnings = [],
  fieldsApplied = [],
  joinSummary,
}: SqlDiffModalProps) {
  const hasChanges = originalSql !== modifiedSql;
  const hasWarnings = warnings.length > 0;
  const hasEnrichment = fieldsApplied.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasWarnings ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            SQL Changes Review
          </DialogTitle>
          <DialogDescription>
            Review the changes made to your SQL query before applying them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Enrichment Summary */}
          {hasEnrichment && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">
                Enrichment Applied
              </h4>
              <div className="flex flex-wrap gap-2 mb-2">
                {fieldsApplied.map((field) => (
                  <Badge
                    key={field}
                    variant="secondary"
                    className="bg-blue-100 text-blue-800"
                  >
                    {field}
                  </Badge>
                ))}
              </div>
              {joinSummary && (
                <div className="text-sm text-blue-700">
                  <strong>Join Path:</strong> {joinSummary}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Safety Modifications Applied
              </h4>
              <ul className="text-sm text-yellow-800 space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* SQL Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Original SQL */}
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <XCircle className="h-4 w-4 text-gray-500" />
                Original SQL
              </h4>
              <div className="bg-gray-50 border rounded-lg p-3">
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                  {originalSql}
                </pre>
              </div>
            </div>

            {/* Modified SQL */}
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Modified SQL
              </h4>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <pre className="text-sm text-green-800 whitespace-pre-wrap font-mono">
                  {modifiedSql}
                </pre>
              </div>
            </div>
          </div>

          {/* No Changes Message */}
          {!hasChanges && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-gray-700">
                No changes were made to the SQL query.
              </p>
            </div>
          )}
        </div>

        <Separator />

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!hasChanges}
            className={hasWarnings ? "bg-yellow-600 hover:bg-yellow-700" : ""}
          >
            {hasWarnings ? "Apply Changes (with warnings)" : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

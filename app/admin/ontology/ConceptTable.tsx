"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QueueListIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

import { OntologyConcept } from "./types";

type ConceptTableProps = {
  concepts: OntologyConcept[];
  selectedIds: Set<string>;
  onToggleSelect: (conceptId: string, selected: boolean) => void;
  onSelectAll: (selectAll: boolean) => void;
  onEdit: (concept: OntologyConcept) => void;
  onToggleDeprecated: (concept: OntologyConcept) => void;
  isMutatingId?: string | null;
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function MetadataBadge({ metadata }: { metadata: Record<string, unknown> }) {
  const keys = Object.keys(metadata ?? {});
  if (!keys.length) {
    return <Badge variant="outline">No metadata</Badge>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-help">
            Metadata · {keys.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AliasesBadge({ aliases }: { aliases: string[] }) {
  if (!aliases || aliases.length === 0) {
    return <Badge variant="outline">No aliases</Badge>;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="cursor-help">
            Aliases · {aliases.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <ul className="list-disc space-y-1 pl-4 text-xs">
            {aliases.map((alias) => (
              <li key={alias}>{alias}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({ deprecated }: { deprecated: boolean }) {
  if (deprecated) {
    return (
      <Badge variant="destructive" className="bg-red-50 text-red-700">
        Deprecated
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-green-50 text-green-700">
      Active
    </Badge>
  );
}

export function ConceptTable({
  concepts,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEdit,
  onToggleDeprecated,
  isMutatingId = null,
}: ConceptTableProps) {
  const allIds = concepts.map((concept) => concept.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
  const partiallySelected =
    !allSelected && allIds.some((id) => selectedIds.has(id));

  if (!concepts.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-200 py-16 text-center">
        <QueueListIcon className="mb-3 h-12 w-12 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">
          No concepts match the current filters.
        </p>
        <p className="text-xs text-slate-500">
          Try adjusting your search or concept type filter.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => onSelectAll(Boolean(checked))}
                aria-label="Select all concepts"
                className={cn({ "opacity-60": partiallySelected })}
              />
            </TableHead>
            <TableHead>Concept</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Aliases</TableHead>
            <TableHead>Metadata</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {concepts.map((concept) => {
            const isSelected = selectedIds.has(concept.id);
            const actionLoading = isMutatingId === concept.id;

            return (
              <TableRow
                key={concept.id}
                className={cn({
                  "bg-slate-50": isSelected,
                  "opacity-70": actionLoading,
                })}
              >
                <TableCell className="align-top">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) =>
                      onToggleSelect(concept.id, Boolean(checked))
                    }
                    aria-label={`Select ${concept.conceptName}`}
                  />
                </TableCell>
                <TableCell className="space-y-1 align-top">
                  <div className="font-medium text-slate-900">
                    {concept.conceptName}
                  </div>
                  <div className="text-xs text-slate-500">
                    Canonical: {concept.canonicalName}
                  </div>
                  {concept.updatedBy && (
                    <div className="text-xs text-slate-500">
                      Updated by {concept.updatedBy}
                    </div>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline">{concept.conceptType}</Badge>
                </TableCell>
                <TableCell className="align-top">
                  <AliasesBadge aliases={concept.aliases} />
                </TableCell>
                <TableCell className="align-top">
                  <MetadataBadge metadata={concept.metadata} />
                </TableCell>
                <TableCell className="align-top">
                  <StatusBadge deprecated={concept.isDeprecated} />
                </TableCell>
                <TableCell className="align-top text-sm text-slate-500">
                  <div>{formatDate(concept.updatedAt)}</div>
                  <div className="text-xs">
                    Created {formatDate(concept.createdAt)}
                  </div>
                </TableCell>
                <TableCell className="flex items-start justify-end gap-2 align-top">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(concept)}
                    disabled={actionLoading}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={concept.isDeprecated ? "secondary" : "destructive"}
                    size="sm"
                    onClick={() => onToggleDeprecated(concept)}
                    disabled={actionLoading}
                  >
                    {concept.isDeprecated ? "Restore" : "Deprecate"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

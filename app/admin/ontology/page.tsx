"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

import { ProtectedRoute } from "@/lib/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { ConceptFormDialog } from "./ConceptFormDialog";
import { ConceptTable } from "./ConceptTable";
import { buildQueryParams } from "./helpers";
import {
  ConceptFormSubmitPayload,
  OntologyConcept,
  OntologyFilters,
} from "./types";

type OntologyListResponse = {
  concepts: OntologyConcept[];
  total?: number;
};

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
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

function downloadTextFile(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const DEFAULT_FILTERS: OntologyFilters = {
  search: "",
  conceptType: null,
  includeDeprecated: false,
};

function OntologyPageContent() {
  const { toast } = useToast();

  const [filters, setFilters] = useState<OntologyFilters>(DEFAULT_FILTERS);
  const [draftSearch, setDraftSearch] = useState("");
  const [concepts, setConcepts] = useState<OntologyConcept[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    mode: "create" | "edit";
    concept: OntologyConcept | null;
  }>({ open: false, mode: "create", concept: null });
  const [isDialogSubmitting, setDialogSubmitting] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setDraftSearch(filters.search);
  }, [filters.search]);

  const loadConcepts = useCallback(async (activeFilters: OntologyFilters) => {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await apiRequest<OntologyListResponse>(
        `/api/admin/ontology/concepts${buildQueryParams(activeFilters)}`
      );
      const conceptsList = response?.concepts ?? [];
      setConcepts(conceptsList);
      setSelectedIds(
        (prev) =>
          new Set(
            Array.from(prev).filter((id) =>
              conceptsList.some((concept) => concept.id === id)
            )
          )
      );
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load ontology concepts.";
      setError(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadConcepts(filters);
  }, [filters, loadConcepts]);

  const conceptTypes = useMemo(() => {
    return Array.from(
      new Set(
        concepts
          .map((concept) => concept.conceptType)
          .filter((type): type is string => Boolean(type && type.length))
      )
    ).sort();
  }, [concepts]);

  const summary = useMemo(() => {
    const total = concepts.length;
    const deprecated = concepts.filter(
      (concept) => concept.isDeprecated
    ).length;
    const active = total - deprecated;
    return { total, deprecated, active };
  }, [concepts]);

  const hasSelection = selectedIds.size > 0;

  const handleSearch = () => {
    setFilters((prev) => ({
      ...prev,
      search: draftSearch.trim(),
    }));
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleOpenCreate = () => {
    setDialogState({ open: true, mode: "create", concept: null });
  };

  const handleEditConcept = (concept: OntologyConcept) => {
    setDialogState({ open: true, mode: "edit", concept });
  };

  const handleDialogClose = (open: boolean) => {
    setDialogState((state) => ({
      ...state,
      open,
      ...(open ? {} : { concept: null }),
    }));
  };

  const handleConceptSave = async (payload: ConceptFormSubmitPayload) => {
    setDialogSubmitting(true);
    try {
      if (dialogState.mode === "edit" && payload.id) {
        await apiRequest(`/api/admin/ontology/concepts/${payload.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast({
          title: "Concept updated",
          description: `${payload.conceptName} saved successfully.`,
        });
      } else {
        await apiRequest("/api/admin/ontology/concepts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({
          title: "Concept created",
          description: `${payload.conceptName} added to ontology.`,
        });
      }
      await loadConcepts(filters);
    } catch (error) {
      throw error;
    } finally {
      setDialogSubmitting(false);
    }
  };

  const handleToggleDeprecated = async (concept: OntologyConcept) => {
    setMutatingId(concept.id);
    try {
      await apiRequest(`/api/admin/ontology/concepts/${concept.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDeprecated: !concept.isDeprecated }),
      });
      toast({
        title: concept.isDeprecated ? "Concept restored" : "Concept deprecated",
        description: `${concept.conceptName} is now ${
          concept.isDeprecated ? "active" : "deprecated"
        }.`,
      });
      await loadConcepts(filters);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update concept status.";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setMutatingId(null);
    }
  };

  const handleSelectAll = (selectAll: boolean) => {
    if (selectAll) {
      setSelectedIds(new Set(concepts.map((concept) => concept.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelect = (conceptId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(conceptId);
      } else {
        next.delete(conceptId);
      }
      return next;
    });
  };

  const handleBulkDeprecate = async () => {
    if (!selectedIds.size) {
      return;
    }

    setIsBulkProcessing(true);
    try {
      await apiRequest("/api/admin/ontology/concepts/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "deprecate",
          conceptIds: Array.from(selectedIds),
        }),
      });
      toast({
        title: "Concepts deprecated",
        description: `${selectedIds.size} concepts marked deprecated.`,
      });
      setSelectedIds(new Set());
      await loadConcepts(filters);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to deprecate selected concepts.";
      toast({
        title: "Bulk action failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const exportYaml = useCallback(
    async (conceptIds?: string[]) => {
      const params = new URLSearchParams();
      if (filters.search.trim().length) {
        params.set("search", filters.search.trim());
      }
      if (filters.conceptType) {
        params.set("conceptType", filters.conceptType);
      }
      if (filters.includeDeprecated) {
        params.set("includeDeprecated", "true");
      }
      if (conceptIds && conceptIds.length) {
        params.set("ids", conceptIds.join(","));
      }
      params.set("format", "yaml");

      const response = await fetch(
        `/api/admin/ontology/export?${params.toString()}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        let message = response.statusText;
        try {
          const body = await response.json();
          message = body?.message || body?.error || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      return response.text();
    },
    [filters]
  );

  const handleExportFiltered = async () => {
    setIsExporting(true);
    try {
      const yaml = await exportYaml();
      downloadTextFile(yaml, "clinical-ontology-export.yaml");
      toast({
        title: "Export ready",
        description: "Filtered concepts exported as YAML.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportSelected = async () => {
    if (!selectedIds.size) return;
    setIsExporting(true);
    try {
      const yaml = await exportYaml(Array.from(selectedIds));
      downloadTextFile(yaml, "clinical-ontology-selected.yaml");
      toast({
        title: "Export ready",
        description: "Selected concepts exported as YAML.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const showLoadingState = isLoading && !concepts.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Clinical Ontology
          </h1>
          <p className="text-sm text-slate-500">
            Manage canonical concepts, aliases, and metadata used across
            customer contexts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => loadConcepts(filters)}
            disabled={isRefreshing}
          >
            <ArrowPathIcon
              className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleExportFiltered}
            disabled={isExporting}
          >
            <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
            Export YAML
          </Button>
          <Button onClick={handleOpenCreate}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add concept
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Total concepts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">
              {summary.total}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">
              {summary.active}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">
              Deprecated
            </CardTitle>
            <CardDescription>Concepts hidden from suggestions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">
              {summary.deprecated}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search concepts or aliases…"
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSearch();
                  }
                }}
                className="pl-9"
              />
            </div>
            <Button variant="secondary" onClick={handleSearch}>
              Apply
            </Button>
            <Button variant="ghost" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={filters.conceptType ?? "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  conceptType: value === "all" ? null : value,
                }))
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {conceptTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                id="deprecated-toggle"
                checked={filters.includeDeprecated}
                onCheckedChange={(checked) =>
                  setFilters((prev) => ({
                    ...prev,
                    includeDeprecated: checked,
                  }))
                }
              />
              <label
                htmlFor="deprecated-toggle"
                className="text-sm text-slate-600"
              >
                Show deprecated
              </label>
            </div>
          </div>
        </div>
      </div>

      {hasSelection && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
          <div className="font-medium text-amber-800">
            {selectedIds.size} concept{selectedIds.size === 1 ? "" : "s"}{" "}
            selected
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDeprecate}
              disabled={isBulkProcessing}
            >
              Deprecate selected
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportSelected}
              disabled={isExporting}
            >
              Export selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showLoadingState ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <ConceptTable
          concepts={concepts}
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onEdit={handleEditConcept}
          onToggleDeprecated={handleToggleDeprecated}
          isMutatingId={mutatingId}
        />
      )}

      <ConceptFormDialog
        open={dialogState.open}
        mode={dialogState.mode}
        conceptTypes={conceptTypes}
        initialConcept={dialogState.concept}
        isSubmitting={isDialogSubmitting}
        onOpenChange={handleDialogClose}
        onSubmit={handleConceptSave}
      />
    </div>
  );
}

export default function OntologyAdminPage() {
  return (
    <ProtectedRoute requireAdmin>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <OntologyPageContent />
      </div>
    </ProtectedRoute>
  );
}

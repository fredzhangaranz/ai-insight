"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MagnifyingGlassIcon, ArrowPathIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  BrowseEntity,
  BrowseFilter,
  BrowseColumn,
} from "@/lib/services/data-gen/browse.service";

export interface BrowseSelection {
  entity: BrowseEntity;
  mode: "insert" | "update" | "assessment";
  selectedIds: string[];
  count?: number;
}

interface DataBrowserStepProps {
  customerId: string;
  onProceed: (selection: BrowseSelection) => void;
}

const ENTITY_LABELS: Record<BrowseEntity, string> = {
  patient: "Patients",
  wound: "Wounds",
  assessment: "Assessments",
};

const DISPLAY_COLUMNS: Record<BrowseEntity, { key: string; label: string }[]> = {
  patient: [
    { key: "name", label: "Name" },
    { key: "gender", label: "Gender" },
    { key: "dateOfBirth", label: "DOB" },
    { key: "accessCode", label: "accessCode" },
  ],
  wound: [
    { key: "location", label: "Location" },
    { key: "baselineDate", label: "Baseline" },
    { key: "patientFk", label: "Patient ID" },
  ],
  assessment: [
    { key: "formName", label: "Form" },
    { key: "assessmentDate", label: "Date" },
    { key: "patientFk", label: "Patient ID" },
  ],
};

export function DataBrowserStep({ customerId, onProceed }: DataBrowserStepProps) {
  const [entity, setEntity] = useState<BrowseEntity>("patient");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; generated: number; missingGender?: number } | null>(null);
  const [columns, setColumns] = useState<BrowseColumn[] | null>(null);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        customerId,
        entity,
        page: String(page),
        pageSize: String(pageSize),
        filter,
      });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/data-gen/browse?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? null);
      setColumns(data.columns ?? null);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
      setStats(null);
      setColumns(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, entity, page, pageSize, filter, search]);

  useEffect(() => {
    if (customerId) fetchData();
    else {
      setRows([]);
      setTotal(0);
      setStats(null);
      setColumns(null);
    }
  }, [customerId, fetchData]);

  const columnKeys = columns ? [...columns.map((c) => c.key)].sort().join(",") : "";
  useEffect(() => {
    if (columns && columns.length > 0) {
      setVisibleColumnKeys(new Set(columns.map((c) => c.key)));
    }
  }, [columnKeys]);

  const handleEntityChange = (e: BrowseEntity) => {
    setEntity(e);
    setPage(1);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => String(r.id ?? ""))));
    }
  };

  const handleCreateNew = () => {
    onProceed({
      entity,
      mode: "insert",
      selectedIds: [],
      count: 20,
    });
  };

  const handleUpdatePatients = () => {
    if (entity !== "patient") return;
    onProceed({
      entity,
      mode: "update",
      selectedIds: Array.from(selectedIds),
    });
  };

  const handleGenerateAssessments = () => {
    if (entity === "assessment") return;
    onProceed({
      entity,
      mode: "assessment",
      selectedIds: Array.from(selectedIds),
    });
  };

  const totalPages = Math.ceil(total / pageSize) || 1;
  const canUpdatePatients = entity === "patient" && selectedIds.size > 0;
  const canGenerateAssessments =
    (entity === "patient" || entity === "wound") && selectedIds.size > 0;

  const allDisplayCols =
    entity === "patient" && columns && columns.length > 0
      ? columns
      : DISPLAY_COLUMNS[entity];

  const showColumnFilter = allDisplayCols.length > 4;
  const filteredCols = allDisplayCols.filter((c) => visibleColumnKeys.has(c.key));
  const displayCols =
    showColumnFilter && filteredCols.length > 0 ? filteredCols : allDisplayCols;

  const setColumnVisible = (key: string, visible: boolean) => {
    setVisibleColumnKeys((prev) => {
      const next = new Set(prev);
      if (visible) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllColumns = () => setVisibleColumnKeys(new Set(allDisplayCols.map((c) => c.key)));
  const selectNoColumns = () => setVisibleColumnKeys(new Set());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 1: Browse & Select</CardTitle>
        <CardDescription>
          View existing data, then create new records or generate assessments for selected rows
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!customerId && (
          <Alert>
            <AlertDescription>Select a customer above to browse and generate data.</AlertDescription>
          </Alert>
        )}
        <Tabs value={entity} onValueChange={(v) => handleEntityChange(v as BrowseEntity)}>
          <TabsList>
            <TabsTrigger value="patient">Patients</TabsTrigger>
            <TabsTrigger value="wound">Wounds</TabsTrigger>
            <TabsTrigger value="assessment">Assessments</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                onKeyDown={(e) => e.key === "Enter" && fetchData()}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as BrowseFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="generated">Generated (IG)</SelectItem>
                <SelectItem value="incomplete">Incomplete</SelectItem>
              </SelectContent>
            </Select>
            {showColumnFilter && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Squares2X2Icon className="h-4 w-4" />
                    Columns ({displayCols.length}/{allDisplayCols.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end">
                  <div className="flex items-center justify-between border-b px-3 py-2">
                    <span className="text-sm font-medium">Show columns</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllColumns}>
                        All
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectNoColumns}>
                        None
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    {allDisplayCols.map(({ key, label }) => {
                      const isVisible = visibleColumnKeys.has(key);
                      return (
                        <div
                          key={key}
                          role="button"
                          tabIndex={0}
                          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                          onClick={() => setColumnVisible(key, !isVisible)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setColumnVisible(key, !isVisible);
                            }
                          }}
                        >
                          <Checkbox checked={isVisible} tabIndex={-1} />
                          <span className="truncate">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {stats && entity === "patient" && (
            <div className="text-sm text-muted-foreground">
              Total: {stats.total} • Generated (IG): {stats.generated}
              {stats.missingGender != null && stats.missingGender > 0 && (
                <> • Missing gender: {stats.missingGender} ({Math.round((stats.missingGender / stats.total) * 100)}%)</>
              )}
            </div>
          )}

          <TabsContent value={entity} className="mt-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={rows.length > 0 && selectedIds.size === rows.length}
                        onCheckedChange={toggleSelectAll}
                        disabled={rows.length === 0}
                      />
                    </TableHead>
                    {displayCols.map(({ key, label }) => (
                      <TableHead key={key}>{label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={displayCols.length + 1} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={displayCols.length + 1} className="text-center py-8 text-muted-foreground">
                        No records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const id = String(row.id ?? "");
                      const fmt = (v: unknown) => {
                        if (v == null) return "—";
                        if (typeof v === "string" && v.match(/^\d{4}-\d{2}-\d{2}/)) {
                          return v.slice(0, 10);
                        }
                        return String(v);
                      };
                      return (
                        <TableRow key={id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(id)}
                              onCheckedChange={() => toggleSelect(id)}
                            />
                          </TableCell>
                          {displayCols.map(({ key }) => (
                            <TableCell key={key}>{fmt(row[key])}</TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page} of {totalPages} • Showing {rows.length} of {total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  Next
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <span className="text-sm">
                {selectedIds.size > 0 ? `${selectedIds.size} row(s) selected` : "No rows selected"}
              </span>
              <div className="flex gap-2">
                <Button onClick={handleCreateNew}>
                  + Create New {ENTITY_LABELS[entity]}
                </Button>
                {canUpdatePatients && (
                  <Button
                    variant="secondary"
                    onClick={handleUpdatePatients}
                  >
                    Update Patients
                  </Button>
                )}
                {entity !== "assessment" && (
                  <Button
                    variant="secondary"
                    onClick={handleGenerateAssessments}
                    disabled={!canGenerateAssessments}
                  >
                    Generate Assessments for Selected
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import type { TemplateListItem } from "@/lib/services/template.service";

interface TemplateCatalogClientProps {
  initialTemplates: TemplateListItem[];
  intents: string[];
  tags: string[];
}

interface TableState {
  data: TemplateListItem[];
  isLoading: boolean;
  error?: string;
}

const STATUS_OPTIONS = ["Draft", "Approved", "Deprecated"] as const;

function StatusBadge({ status }: { status?: string }) {
  const normalized = status ?? "Draft";
  const style =
    normalized === "Approved"
      ? "bg-green-100 text-green-800"
      : normalized === "Draft"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-200 text-slate-800";
  return <Badge className={style}>{normalized}</Badge>;
}

function TemplateTable({
  state,
  onViewDetails,
}: {
  state: TableState;
  onViewDetails: (template: TemplateListItem) => void;
}) {
  if (state.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (state.error) {
    return (
      <Card className="border-destructive bg-destructive/10 text-sm text-destructive">
        <CardContent className="py-6">
          Failed to load templates: {state.error}
        </CardContent>
      </Card>
    );
  }

  if (!state.data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p className="text-lg font-medium">No templates match your filters</p>
        <p className="mt-2 max-w-md text-sm">
          Adjust the filters or reset them to see all catalog entries.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Intent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Success Rate</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {state.data.map((tpl) => (
          <TableRow key={tpl.templateId ?? tpl.name}>
            <TableCell className="font-medium">
              <div className="flex flex-col">
                <span>{tpl.name}</span>
                {tpl.description ? (
                  <span className="text-xs text-muted-foreground">
                    {tpl.description}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell>{tpl.intent ?? "—"}</TableCell>
            <TableCell>
              <StatusBadge status={tpl.status} />
            </TableCell>
            <TableCell>
              {typeof tpl.successRate === "number"
                ? `${Math.round(tpl.successRate * 100)}%`
                : "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewDetails(tpl)}
              >
                View details
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

interface TemplateDetailDialogProps {
  template: TemplateListItem | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onPublish: (templateId: number) => Promise<void>;
  onDeprecate: (templateId: number) => Promise<void>;
  actionLoading: boolean;
}

function TemplateDetailDialog({
  template,
  open,
  onOpenChange,
  onPublish,
  onDeprecate,
  actionLoading,
}: TemplateDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden p-0">
        {template ? (
          <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_280px]">
            <ScrollArea className="border-r p-6">
              <DialogHeader className="space-y-1">
                <DialogTitle className="flex items-center gap-3 text-xl">
                  {template.name}
                  <StatusBadge status={template.status} />
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Intent: {template.intent ?? "unknown"}
                </p>
              </DialogHeader>

              <div className="mt-6 space-y-4 text-sm">
                {template.description ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      Description
                    </h3>
                    <p className="mt-1 leading-relaxed">
                      {template.description}
                    </p>
                  </section>
                ) : null}

                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    SQL Pattern
                  </h3>
                  <pre className="mt-2 overflow-auto rounded bg-muted p-4 text-xs">
                    {template.sqlPattern}
                  </pre>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Placeholders
                  </h3>
                  {template.placeholdersSpec?.slots?.length ? (
                    <div className="mt-2 overflow-hidden rounded border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Semantic</TableHead>
                            <TableHead>Required</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {template.placeholdersSpec.slots.map((slot) => (
                            <TableRow key={slot.name}>
                              <TableCell>{slot.name}</TableCell>
                              <TableCell>{slot.type ?? "—"}</TableCell>
                              <TableCell>{slot.semantic ?? "—"}</TableCell>
                              <TableCell>
                                {slot.required === false ? "Optional" : "Required"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <p className="mt-2 text-muted-foreground">
                      No structured placeholders defined.
                    </p>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Examples
                  </h3>
                  {template.questionExamples?.length ? (
                    <ul className="mt-2 list-disc space-y-2 pl-6">
                      {template.questionExamples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-muted-foreground">None provided.</p>
                  )}
                </section>
              </div>
            </ScrollArea>

            <aside className="space-y-6 p-6 text-sm">
              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Quick Stats
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <StatCard label="Status" value={template.status ?? "Draft"} />
                  <StatCard
                    label="Success rate"
                    value={
                      typeof template.successRate === "number"
                        ? `${Math.round(template.successRate * 100)}%`
                        : "—"
                    }
                  />
                  <StatCard
                    label="Successes"
                    value={template.successCount ?? 0}
                  />
                  <StatCard
                    label="Total runs"
                    value={template.usageCount ?? 0}
                  />
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Keywords
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {template.keywords?.length ? (
                    template.keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Tags
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {template.tags?.length ? (
                    template.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </div>
              </section>
            </aside>

            <footer className="border-t bg-muted/30 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Version {template.version ?? 1}</span>
                  <span>Template ID {template.templateId ?? "—"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {template.status === "Draft" && template.templateId ? (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/templates/${template.templateId}/edit`}>
                          Edit Draft
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => onPublish(template.templateId!)}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Publishing…" : "Publish"}
                      </Button>
                    </>
                  ) : null}
                  {template.status === "Approved" && template.templateId ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDeprecate(template.templateId!)}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Updating…" : "Deprecate"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </footer>
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">
            No template selected.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function TemplateCatalogClient({
  initialTemplates,
  intents,
  tags,
}: TemplateCatalogClientProps) {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [intentFilter, setIntentFilter] = useState<string | undefined>();
  const [tagFilter, setTagFilter] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [availableIntents, setAvailableIntents] = useState<string[]>(intents);
  const [availableTags, setAvailableTags] = useState<string[]>(tags);
  const [state, setState] = useState<TableState>({
    data: initialTemplates,
    isLoading: false,
  });
  const [actionLoading, setActionLoading] = useState(false);

  const didMountRef = useRef(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateListItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();

  const selectedFilters = useMemo(
    () => ({ status: statusFilter, intent: intentFilter, tag: tagFilter }),
    [statusFilter, intentFilter, tagFilter]
  );

  const mergeFilterOptions = (data: TemplateListItem[]) => {
    const intentSet = new Set(availableIntents);
    const tagSet = new Set(availableTags);
    data.forEach((tpl) => {
      if (tpl.intent) intentSet.add(tpl.intent);
      tpl.tags?.forEach((tag) => tagSet.add(tag));
    });
    setAvailableIntents(Array.from(intentSet).sort((a, b) => a.localeCompare(b)));
    setAvailableTags(Array.from(tagSet).sort((a, b) => a.localeCompare(b)));
  };

  const handleApplyFilters = async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: undefined }));
    const params = new URLSearchParams();
    if (statusFilter) params.append("status", statusFilter);
    if (intentFilter) params.append("intent", intentFilter);
    if (tagFilter) params.append("tags", tagFilter);
    if (searchTerm.trim()) params.append("q", searchTerm.trim());

    try {
      const response = await fetch(`/api/ai/templates?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`${response.status}`);
      }
      const payload = await response.json();
      const data: TemplateListItem[] = payload.data ?? [];
      setState({ data, isLoading: false });
      mergeFilterOptions(data);
    } catch (error: any) {
      setState({
        data: [],
        isLoading: false,
        error: error?.message ?? "unknown",
      });
    }
  };

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    handleApplyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilters]);

  const handleReset = () => {
    setStatusFilter(undefined);
    setIntentFilter(undefined);
    setTagFilter(undefined);
    setSearchTerm("");
    setState({ data: initialTemplates, isLoading: false });
    mergeFilterOptions(initialTemplates);
  };

  const showReset =
    statusFilter || intentFilter || tagFilter || searchTerm.trim().length > 0;

  const handlePublish = async (templateId: number) => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/ai/templates/${templateId}/publish`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Publish failed");
      }
      toast({
        title: "Template published",
        description: payload?.data?.name ?? "Draft promoted",
      });
      await handleApplyFilters();
    } catch (error: any) {
      toast({
        title: "Failed to publish",
        description: error?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeprecate = async (templateId: number) => {
    setActionLoading(true);
    try {
      const response = await fetch(`/api/ai/templates/${templateId}/deprecate`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Deprecate failed");
      }
      toast({
        title: "Template deprecated",
        description: payload?.data?.name ?? "Template hidden",
      });
      await handleApplyFilters();
    } catch (error: any) {
      toast({
        title: "Failed to deprecate",
        description: error?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base font-medium">Catalog</CardTitle>
        <Button asChild>
          <Link href="/templates/new">New Template</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="flex flex-wrap gap-3">
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(value) =>
              setStatusFilter(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={intentFilter ?? "all"}
            onValueChange={(value) =>
              setIntentFilter(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All intents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All intents</SelectItem>
              {availableIntents.map((intent) => (
                <SelectItem key={intent} value={intent}>
                  {intent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={tagFilter ?? "all"}
            onValueChange={(value) =>
              setTagFilter(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {availableTags.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-1 min-w-[220px] gap-2">
            <Input
              placeholder="Search by name or keyword"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleApplyFilters();
                }
              }}
            />
            <Button onClick={handleApplyFilters} disabled={state.isLoading}>
              Apply
            </Button>
          </div>

          {showReset ? (
            <Button
              variant="ghost"
              className="text-sm"
              onClick={handleReset}
              disabled={state.isLoading}
            >
              Reset
            </Button>
          ) : null}
        </div>

        <TemplateTable
          state={state}
          onViewDetails={(template) => {
            setSelectedTemplate(template);
            setDetailOpen(true);
          }}
        />
      </CardContent>

      <TemplateDetailDialog
        template={selectedTemplate}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setSelectedTemplate(null);
          }
        }}
        onPublish={handlePublish}
        onDeprecate={handleDeprecate}
        actionLoading={actionLoading}
      />
    </Card>
  );
}

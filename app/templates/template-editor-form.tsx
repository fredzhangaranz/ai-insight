"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TemplateListItem } from "@/lib/services/template.service";
import {
  INTENT_METADATA,
  type IntentMetadata,
} from "@/lib/config/intent-metadata";

const SLOT_TYPES = [
  "guid",
  "int",
  "string",
  "date",
  "boolean",
  "float",
  "decimal",
] as const;

type PlaceholderSlotDraft = {
  id: string;
  name: string;
  type: string;
  semantic: string;
  required: boolean;
};

type TabKey = "basic" | "sql" | "placeholders" | "examples" | "preview";

interface TemplateEditorFormProps {
  intents: string[];
  template?: TemplateListItem;
  mode?: "create" | "edit";
}

interface DraftState {
  name: string;
  intent: string;
  description: string;
  sqlPattern: string;
  placeholders: PlaceholderSlotDraft[];
  keywords: string;
  tags: string;
  examples: string;
}

interface ApiResponse {
  data?: TemplateListItem;
  warnings?: string[];
  message?: string;
  errors?: Array<{ code: string; message: string }>;
}

const DEFAULT_DRAFT: DraftState = {
  name: "",
  intent: "aggregation_by_category",
  description: "",
  sqlPattern: "SELECT ...",
  placeholders: [],
  keywords: "",
  tags: "",
  examples: "",
};

function toDraft(template?: TemplateListItem): DraftState {
  if (!template) return DEFAULT_DRAFT;
  return {
    name: template.name ?? "",
    intent: template.intent ?? DEFAULT_DRAFT.intent,
    description: template.description ?? "",
    sqlPattern: template.sqlPattern ?? "",
    placeholders:
      template.placeholdersSpec?.slots?.map((slot) => ({
        id: crypto.randomUUID(),
        name: slot.name ?? "",
        type: slot.type ?? "string",
        semantic: slot.semantic ?? "",
        required: slot.required !== false,
      })) ?? [],
    keywords: (template.keywords ?? []).join(", "),
    tags: (template.tags ?? []).join(", "),
    examples: (template.questionExamples ?? []).join("\n"),
  };
}

export default function TemplateEditorForm({
  intents,
  template,
  mode = "create",
}: TemplateEditorFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [state, setState] = useState<DraftState>(toDraft(template));
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (mode === "edit") {
      setState(toDraft(template));
    }
  }, [template, mode]);

  const placeholderSpec = useMemo(() => {
    if (!state.placeholders.length) return null;
    return {
      slots: state.placeholders.map((slot) => ({
        name: slot.name.trim(),
        type: slot.type || undefined,
        semantic: slot.semantic || undefined,
        required: slot.required !== false,
      })),
    };
  }, [state.placeholders]);

  const examplesPreview = useMemo(
    () =>
      state.examples
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [state.examples]
  );

  const keywordsPreview = useMemo(
    () =>
      state.keywords
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean),
    [state.keywords]
  );

  const tagsPreview = useMemo(
    () =>
      state.tags
        .split(",")
        .map((word) => word.trim())
        .filter(Boolean),
    [state.tags]
  );

  const canSubmit =
    state.name.trim().length > 0 && state.sqlPattern.trim().length > 0;

  const handleAddPlaceholder = () => {
    setState((prev) => ({
      ...prev,
      placeholders: [
        ...prev.placeholders,
        {
          id: crypto.randomUUID(),
          name: "placeholderName",
          type: "string",
          semantic: "",
          required: true,
        },
      ],
    }));
  };

  const handlePlaceholderChange = (
    id: string,
    key: keyof PlaceholderSlotDraft,
    value: string | boolean
  ) => {
    setState((prev) => ({
      ...prev,
      placeholders: prev.placeholders.map((slot) =>
        slot.id === id ? { ...slot, [key]: value } : slot
      ),
    }));
  };

  const handleRemovePlaceholder = (id: string) => {
    setState((prev) => ({
      ...prev,
      placeholders: prev.placeholders.filter((slot) => slot.id !== id),
    }));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    setWarnings([]);

    const payload = {
      name: state.name.trim(),
      intent: state.intent.trim(),
      description: state.description.trim() || undefined,
      sqlPattern: state.sqlPattern,
      placeholdersSpec: placeholderSpec,
      keywords: keywordsPreview,
      tags: tagsPreview,
      examples: examplesPreview,
    };

    try {
      const endpoint =
        mode === "edit" && template?.templateId
          ? `/api/ai/templates/${template.templateId}`
          : "/api/ai/templates";
      const method = mode === "edit" ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json: ApiResponse = await response.json();
      if (!response.ok || !json.data) {
        const message = json.message || `Request failed (${response.status})`;
        const detail = json.errors?.map((err) => err.message).join("\n");
        setError(detail ? `${message}\n${detail}` : message);
        return;
      }

      setWarnings(json.warnings ?? []);
      toast({
        title: mode === "edit" ? "Draft updated" : "Draft saved",
        description: `${json.data.name} is available under Drafts.`,
      });
      router.push("/templates?status=Draft");
    } catch (err) {
      console.error("Template draft request failed", err);
      setError(
        mode === "edit"
          ? "Unexpected error while updating template draft."
          : "Unexpected error while creating template draft."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">
          {mode === "edit" ? "Edit Template" : "Create Template"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Follow the steps to {mode === "edit" ? "update" : "define"} a reusable
          SQL template. Drafts stay private until you publish them.
        </p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base font-medium">
            {mode === "edit" ? "Edit Draft" : "Author Template"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as TabKey)}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="sql">SQL Pattern</TabsTrigger>
              <TabsTrigger value="placeholders">Placeholders</TabsTrigger>
              <TabsTrigger value="examples">Examples</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  placeholder="Count Assessments by Time Window"
                  value={state.name}
                  onChange={(event) =>
                    setState((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="template-intent">Query Pattern Intent</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/30 text-[10px] text-muted-foreground hover:bg-muted"
                        >
                          ?
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">What is Intent?</p>
                        <p className="mt-1 text-xs">
                          Intent categorizes the SQL pattern type (aggregation,
                          time series, ranking, etc.) to help match templates to
                          questions. Choose the category that best describes
                          what the query does.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          See{" "}
                          <a
                            href="/docs/template-authoring-guide.md"
                            className="underline"
                            target="_blank"
                          >
                            authoring guide
                          </a>{" "}
                          for details.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Select
                  value={state.intent}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, intent: value }))
                  }
                >
                  <SelectTrigger id="template-intent">
                    <SelectValue>
                      {state.intent && INTENT_METADATA[state.intent] ? (
                        <span className="flex items-center gap-2">
                          <span>{INTENT_METADATA[state.intent].icon}</span>
                          <span>{INTENT_METADATA[state.intent].label}</span>
                        </span>
                      ) : (
                        "Select a query pattern"
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {/* Group by category */}
                    {Object.entries(
                      intents.reduce((acc, intentValue) => {
                        const metadata = INTENT_METADATA[intentValue];
                        if (!metadata) return acc;
                        const category = metadata.category;
                        if (!acc[category]) acc[category] = [];
                        acc[category].push(metadata);
                        return acc;
                      }, {} as Record<string, IntentMetadata[]>)
                    ).map(([category, intentList]) => (
                      <div key={category}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          {category}
                        </div>
                        {intentList.map((metadata) => (
                          <SelectItem
                            key={metadata.value}
                            value={metadata.value}
                            className="pl-6"
                          >
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-base">
                                {metadata.icon}
                              </span>
                              <div className="flex-1">
                                <div className="font-medium">
                                  {metadata.label}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {metadata.description}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                {/* Context-aware help text */}
                {state.intent && INTENT_METADATA[state.intent] && (
                  <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs">
                    <p className="font-medium text-blue-900">
                      {INTENT_METADATA[state.intent].icon}{" "}
                      {INTENT_METADATA[state.intent].label}
                    </p>
                    <p className="mt-1 text-blue-800">
                      <span className="font-medium">SQL Pattern:</span>{" "}
                      {INTENT_METADATA[state.intent].sqlHint}
                    </p>
                    <div className="mt-2">
                      <p className="font-medium text-blue-900">
                        Example questions:
                      </p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-blue-800">
                        {INTENT_METADATA[state.intent].examples.map(
                          (example, idx) => (
                            <li key={idx}>{example}</li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Textarea
                  id="template-description"
                  placeholder="Short description of the query outcome"
                  value={state.description}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-keywords">Keywords</Label>
                  <Input
                    id="template-keywords"
                    placeholder="comma separated (count, assessments, time window)"
                    value={state.keywords}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        keywords: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-tags">Tags</Label>
                  <Input
                    id="template-tags"
                    placeholder="comma separated tags"
                    value={state.tags}
                    onChange={(event) =>
                      setState((prev) => ({
                        ...prev,
                        tags: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sql" className="space-y-2">
              <Label htmlFor="template-sql">SQL Pattern</Label>
              <Textarea
                id="template-sql"
                className="min-h-[220px] font-mono"
                value={state.sqlPattern}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    sqlPattern: event.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Use MS SQL Server syntax. Dangerous statements (DROP/ALTER/etc.)
                will be rejected by the validator.
              </p>
            </TabsContent>

            <TabsContent value="placeholders" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Configure placeholders used in the SQL pattern. Names should
                    match tokens inside curly braces:{" "}
                    <code>{"{placeholder}"}</code>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddPlaceholder}
                >
                  Add placeholder
                </Button>
              </div>

              {state.placeholders.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No placeholders defined yet. Click “Add placeholder” to start.
                </p>
              ) : (
                <div className="space-y-3">
                  {state.placeholders.map((slot) => (
                    <div
                      key={slot.id}
                      className="grid gap-3 rounded-md border p-4 md:grid-cols-2"
                    >
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input
                          value={slot.name}
                          onChange={(event) =>
                            handlePlaceholderChange(
                              slot.id,
                              "name",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select
                          value={slot.type}
                          onValueChange={(value) =>
                            handlePlaceholderChange(slot.id, "type", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {SLOT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Semantic (optional)</Label>
                        <Input
                          value={slot.semantic}
                          onChange={(event) =>
                            handlePlaceholderChange(
                              slot.id,
                              "semantic",
                              event.target.value
                            )
                          }
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={slot.required}
                          onCheckedChange={(checked) =>
                            handlePlaceholderChange(
                              slot.id,
                              "required",
                              checked
                            )
                          }
                          id={`placeholder-required-${slot.id}`}
                        />
                        <Label htmlFor={`placeholder-required-${slot.id}`}>
                          Required
                        </Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto text-destructive"
                          onClick={() => handleRemovePlaceholder(slot.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="examples" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template-examples">Example questions</Label>
                <Textarea
                  id="template-examples"
                  placeholder={"One example per line"}
                  value={state.examples}
                  onChange={(event) =>
                    setState((prev) => ({
                      ...prev,
                      examples: event.target.value,
                    }))
                  }
                  className="min-h-[160px]"
                />
                <p className="text-xs text-muted-foreground">
                  These examples help template matching and appear in the admin
                  detail view.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Summary
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border bg-muted/50 p-3 text-sm">
                    <p className="font-medium">Name</p>
                    <p className="text-muted-foreground">{state.name || "—"}</p>
                  </div>
                  <div className="rounded border bg-muted/50 p-3 text-sm">
                    <p className="font-medium">Intent</p>
                    <p className="text-muted-foreground">
                      {state.intent || "—"}
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Placeholders
                </h3>
                {placeholderSpec?.slots?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {placeholderSpec.slots.map((slot) => (
                      <Badge key={slot.name} variant="outline">
                        {slot.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No placeholders defined.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  Examples
                </h3>
                {examplesPreview.length ? (
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {examplesPreview.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No examples provided.
                  </p>
                )}
              </section>
            </TabsContent>
          </Tabs>

          {error ? (
            <p className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {warnings.length ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">Warnings</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/templates")}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting
                ? mode === "edit"
                  ? "Saving…"
                  : "Saving…"
                : mode === "edit"
                ? "Save Changes"
                : "Save Draft"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

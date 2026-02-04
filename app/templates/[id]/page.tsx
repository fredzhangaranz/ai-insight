import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getTemplateById } from "@/lib/services/template.service";
import type { TemplateListItem } from "@/lib/services/template.service";

interface TemplateDetailsPageProps {
  params: { id: string };
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Approved"
      ? "default"
      : status === "Draft"
        ? "secondary"
        : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export default async function TemplateDetailsPage({
  params,
}: TemplateDetailsPageProps) {
  const templateId = Number(params.id);
  if (!Number.isFinite(templateId)) {
    notFound();
  }

  let template: TemplateListItem;
  try {
    template = await getTemplateById(templateId);
  } catch (error) {
    console.error("Failed to load template", error);
    notFound();
  }

  const successRate =
    typeof template.successRate === "number"
      ? `${Math.round(template.successRate * 100)}%`
      : "—";

  return (
    <div className="container py-8 max-w-7xl">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/templates" className="flex items-center gap-2">
            ← Back to Templates
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 max-w-7xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <CardTitle className="text-2xl">{template.name}</CardTitle>
              {template.status && <StatusBadge status={template.status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              Intent: {template.intent ?? "unknown"}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-6 text-sm">
                {template.description ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Description
                    </h3>
                    <p className="leading-relaxed">{template.description}</p>
                  </section>
                ) : null}

                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                    SQL Pattern
                  </h3>
                  <pre className="overflow-auto rounded bg-muted p-4 text-xs whitespace-pre-wrap break-words">
                    {template.sqlPattern}
                  </pre>
                </section>

                {template.placeholdersSpec &&
                Array.isArray(template.placeholdersSpec.slots) &&
                template.placeholdersSpec.slots.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Placeholders
                    </h3>
                    <div className="space-y-2">
                      {template.placeholdersSpec.slots.map((slot, idx) => (
                        <div key={idx} className="rounded border p-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                              {slot.name}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {slot.type}
                            </Badge>
                            {slot.required === false ? (
                              <Badge variant="secondary" className="text-xs">
                                Optional
                              </Badge>
                            ) : (
                              <Badge variant="default" className="text-xs">
                                Required
                              </Badge>
                            )}
                          </div>
                          {slot.description ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {slot.description}
                            </p>
                          ) : null}
                          {slot.semantic ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Semantic: {slot.semantic}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {template.questionExamples &&
                Array.isArray(template.questionExamples) &&
                template.questionExamples.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Examples
                    </h3>
                    <div className="space-y-3">
                      {template.questionExamples.map((example, idx) => (
                        <div key={idx} className="rounded border p-3">
                          <pre className="text-xs whitespace-pre-wrap">
                            {example}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {template.keywords && template.keywords.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Keywords
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {template.keywords.map((keyword, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </section>
                ) : null}

                {template.tags && template.tags.length > 0 ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {template.tags.map((tag, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Statistics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatCard label="Success Rate" value={successRate} />
              <StatCard label="Usage Count" value={template.usageCount ?? 0} />
              <StatCard
                label="Success Count"
                value={template.successCount ?? 0}
              />
              <StatCard label="Version" value={template.version ?? 1} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {template.status === "Draft" && template.templateId ? (
                <div className="space-y-2">
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/templates/${template.templateId}/edit`}>
                      Edit Draft
                    </Link>
                  </Button>
                  <Button className="w-full">Publish Template</Button>
                </div>
              ) : null}
              {template.status === "Approved" && template.templateId ? (
                <Button variant="outline" className="w-full">
                  Deprecate Template
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Template ID:</span>
                <span>{template.templateId ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>Version ID:</span>
                <span>{template.templateVersionId ?? "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

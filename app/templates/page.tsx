import TemplateCatalogClient from "./template-catalog-client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import {
  listTemplates,
  TemplateListItem,
} from "@/lib/services/template.service";

const CANONICAL_INTENTS = [
  "aggregation_by_category",
  "time_series_trend",
  "top_k",
  "latest_per_entity",
  "as_of_state",
  "pivot",
  "unpivot",
  "note_collection",
  "join_analysis",
];

function extractUnique(values: Array<string | undefined>): string[] {
  const set = new Set<string>();
  values.forEach((value) => {
    if (value && value.trim()) set.add(value.trim());
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function extractUniqueTags(templates: TemplateListItem[]): string[] {
  const set = new Set<string>();
  templates.forEach((tpl) => {
    tpl.tags?.forEach((tag) => {
      const trimmed = tag.trim();
      if (trimmed) set.add(trimmed);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default async function TemplatesPage() {
  const featureEnabled = isTemplateSystemEnabled();

  if (!featureEnabled) {
    return (
      <div className="container py-12">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Template Catalog Disabled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The template system is currently disabled. Set
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                AI_TEMPLATES_ENABLED=true
              </code>
              in your environment to access the catalog.
            </p>
            <p>
              After enabling the flag, reload this page to manage templates or
              refer to the implementation plan for rollout steps.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  let templates: TemplateListItem[] = [];
  try {
    templates = await listTemplates({ limit: 50 });
  } catch (error) {
    console.error("Failed to load template catalog:", error);
  }

  const intents = extractUnique([
    ...CANONICAL_INTENTS,
    ...templates.map((tpl) => tpl.intent),
  ]);
  const tags = extractUniqueTags(templates);

  return (
    <div className="container space-y-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Template Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Author SQL templates once, reuse them across the funnel, and keep
          runtime generation predictable. Drafts remain private until you
          publish them.
        </p>
      </header>

      <div className="flex items-center justify-between rounded-md border bg-card p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            Quick Links
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <a href="#section-drafts" className="underline-offset-4 hover:underline">
              View Drafts
            </a>
            <a href="#section-approved" className="underline-offset-4 hover:underline">
              View Approved
            </a>
            <a
              href="/docs/template-authoring-guide"
              className="underline-offset-4 hover:underline"
            >
              Authoring Guide
            </a>
          </div>
        </div>
        <Badge variant="outline">Stage 5 • Draft creation</Badge>
      </div>

      <TemplateCatalogClient
        initialTemplates={templates}
        intents={intents}
        tags={tags}
      />
    </div>
  );
}

import TemplateCatalogClient from "./template-catalog-client";
import QuickLinks from "./quick-links";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

      <QuickLinks />

      <div id="template-catalog">
        <TemplateCatalogClient
          initialTemplates={templates}
          intents={intents}
          tags={tags}
        />
      </div>
    </div>
  );
}

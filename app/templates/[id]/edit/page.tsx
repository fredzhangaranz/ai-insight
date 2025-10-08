import TemplateEditorForm from "../../template-editor-form";

import { Card, CardContent } from "@/components/ui/card";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";
import { getTemplateById } from "@/lib/services/template.service";

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

interface EditTemplatePageProps {
  params: { id: string };
}

export default async function EditTemplatePage({ params }: EditTemplatePageProps) {
  if (!isTemplateSystemEnabled()) {
    return (
      <div className="container py-12">
        <Card className="max-w-2xl">
          <CardContent className="py-10 text-sm text-muted-foreground">
            The template system is disabled. Set
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              AI_TEMPLATES_ENABLED=true
            </code>
            to edit templates.
          </CardContent>
        </Card>
      </div>
    );
  }

  const templateId = Number(params.id);
  if (!Number.isFinite(templateId)) {
    return (
      <div className="container py-12 text-sm text-destructive">
        Invalid template id.
      </div>
    );
  }

  let template;
  try {
    template = await getTemplateById(templateId);
  } catch (error) {
    console.error("Failed to load template", error);
    return (
      <div className="container py-12 text-sm text-destructive">
        Unable to load template.
      </div>
    );
  }

  const intents = Array.from(
    new Set([template.intent ?? "", ...CANONICAL_INTENTS])
  ).filter(Boolean) as string[];

  return (
    <div className="container py-8">
      <TemplateEditorForm intents={intents} template={template} mode="edit" />
    </div>
  );
}

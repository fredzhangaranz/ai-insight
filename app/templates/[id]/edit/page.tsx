import TemplateEditorForm from "../../template-editor-form";

import { Card, CardContent } from "@/components/ui/card";
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

export default async function EditTemplatePage({
  params,
}: EditTemplatePageProps) {
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
    new Set([template.intent ?? "", ...CANONICAL_INTENTS]),
  ).filter(Boolean) as string[];

  return (
    <div className="container py-8">
      <TemplateEditorForm intents={intents} template={template} mode="edit" />
    </div>
  );
}

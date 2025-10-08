import TemplateEditorForm from "../template-editor-form";

import { Card, CardContent } from "@/components/ui/card";
import { isTemplateSystemEnabled } from "@/lib/config/template-flags";

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

export default async function NewTemplatePage() {
  if (!isTemplateSystemEnabled()) {
    return (
      <div className="container py-12">
        <Card className="max-w-2xl">
          <CardContent className="py-10 text-sm text-muted-foreground">
            The template system is disabled. Set
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              AI_TEMPLATES_ENABLED=true
            </code>
            to create templates.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <TemplateEditorForm intents={CANONICAL_INTENTS} />
    </div>
  );
}

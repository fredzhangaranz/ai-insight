import TemplateEditorForm from "../template-editor-form";

import { Card, CardContent } from "@/components/ui/card";

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
  return (
    <div className="container py-8">
      <TemplateEditorForm intents={CANONICAL_INTENTS} />
    </div>
  );
}

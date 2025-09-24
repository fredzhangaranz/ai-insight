import SchemaAnalysisClient from "./SchemaAnalysisClient";

export default function SchemaAnalysisPage() {
  const uiEnabled = process.env.CHART_INSIGHTS_ENABLED === "true";
  const apiEnabled = process.env.CHART_INSIGHTS_API_ENABLED === "true";

  if (!uiEnabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Chart Insights UI is disabled. Set CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }

  if (!apiEnabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Chart Insights API is disabled. Set CHART_INSIGHTS_API_ENABLED=true.
      </div>
    );
  }

  return <SchemaAnalysisClient />;
}

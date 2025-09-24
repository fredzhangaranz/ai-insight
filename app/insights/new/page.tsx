import Link from "next/link";

export default function NewInsightPage() {
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Create Insight</h1>
        <p className="text-sm text-gray-600">
          Choose how you want to generate your insight.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/analysis"
          className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
        >
          <span className="text-sm font-semibold text-slate-900">
            Form-Specific Insight
          </span>
          <span className="mt-2 text-sm text-slate-600">
            Pick an assessment form and tailor AI suggestions to those
            fields.
          </span>
        </Link>
        <Link
          href="/analysis/schema"
          className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:border-blue-500 hover:shadow-md"
        >
          <span className="text-sm font-semibold text-slate-900">
            Database Insight (No Form)
          </span>
          <span className="mt-2 text-sm text-slate-600">
            Explore the rpt schema directly to build insights across all
            data.
          </span>
        </Link>
      </div>
    </div>
  );
}

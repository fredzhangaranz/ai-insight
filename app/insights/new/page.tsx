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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header with Breadcrumb and Page Title */}
        <div className="mb-8">
          <div className="border-b border-slate-200 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <nav className="flex text-sm text-slate-500 mb-2">
                  <Link href="/insights" className="hover:text-slate-700">
                    Insights
                  </Link>
                  <span className="mx-2">/</span>
                  <span className="text-slate-900 font-medium">Create New</span>
                </nav>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  Create Insight
                </h1>
                <p className="text-slate-600 mt-1">
                  Choose how you want to generate your AI-powered insight
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 max-w-4xl">
            <Link
              href="/analysis"
              className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-200 hover:border-blue-500 hover:shadow-lg hover:scale-[1.02]"
            >
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                Form-Specific Insight
              </h3>
              <p className="text-slate-600 flex-grow">
                Pick an assessment form and tailor AI suggestions to those
                specific fields. Perfect for focused analysis of particular
                assessment types.
              </p>
              <div className="mt-4 text-blue-600 text-sm font-medium group-hover:text-blue-700">
                Choose Form →
              </div>
            </Link>
            <Link
              href="/analysis/schema"
              className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-8 shadow-sm transition-all duration-200 hover:border-blue-500 hover:shadow-lg hover:scale-[1.02]"
            >
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                <svg
                  className="w-6 h-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-3">
                Database Insight (No Form)
              </h3>
              <p className="text-slate-600 flex-grow">
                Explore the RPT schema directly to build insights across all
                available data. Ideal for cross-form analysis and comprehensive
                reporting.
              </p>
              <div className="mt-4 text-purple-600 text-sm font-medium group-hover:text-purple-700">
                Explore Database →
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

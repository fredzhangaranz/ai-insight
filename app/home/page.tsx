export const dynamic = "force-dynamic";

async function getOverview() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005";
  const res = await fetch(`${baseUrl}/api/stats/overview`, {
    cache: "no-store",
  });
  if (!res.ok) {
    return { formsActive: 0, insightsTotal: 0 };
  }
  return res.json();
}

export default async function HomePage() {
  if (process.env.CHART_INSIGHTS_ENABLED !== "true") {
    return (
      <div className="text-sm text-gray-600">
        New Home is disabled. Set CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }
  const { formsActive, insightsTotal } = await getOverview();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Home</h1>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Active Forms</div>
          <div className="text-3xl font-bold">{formsActive}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-sm text-gray-500">Saved Insights</div>
          <div className="text-3xl font-bold">{insightsTotal}</div>
        </div>
      </div>
    </div>
  );
}

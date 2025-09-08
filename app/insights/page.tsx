import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const enabled = process.env.CHART_INSIGHTS_ENABLED === "true";
  if (!enabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Insights are disabled. Set CHART_INSIGHTS_ENABLED=true.
      </div>
    );
  }

  const apiEnabled = process.env.CHART_INSIGHTS_API_ENABLED === "true";
  if (!apiEnabled) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Insights API disabled. Set CHART_INSIGHTS_API_ENABLED=true.
      </div>
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3005";
  const res = await fetch(`${baseUrl}/api/insights`, { cache: "no-store" });
  const data = await res.json();
  const items = data.items || [];

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Saved Insights</h1>
      {items.length === 0 ? (
        <div className="text-sm text-gray-600">No insights yet.</div>
      ) : (
        <ul className="divide-y border rounded bg-white">
          {items.map((it: any) => (
            <li
              key={it.id}
              className="p-4 hover:bg-gray-50 flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-gray-500">
                  {it.scope}
                  {it.formId ? ` • ${it.formId}` : ""}
                </div>
              </div>
              <Link
                href={`/insights/${it.id}`}
                className="text-blue-600 text-sm"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

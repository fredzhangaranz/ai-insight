"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCustomer } from "@/lib/context/CustomerContext";
import { CustomerSelector } from "@/app/insights/new/components/CustomerSelector";

interface SavedInsight {
  id: number;
  name: string;
  question?: string;
  scope?: string;
  chartType?: string;
  createdAt?: string;
}

/** Map chartType to display label: Chart, Table, or Text */
function getInsightTypeLabel(chartType?: string | null): string {
  if (!chartType) return "Text";
  switch (chartType.toLowerCase()) {
    case "bar":
    case "line":
    case "pie":
    case "kpi":
      return "Chart";
    case "table":
      return "Table";
    default:
      return "Text";
  }
}

export default function SavedInsightsPage() {
  const {
    selectedCustomerId,
    setSelectedCustomerId,
    loading: customerLoading,
    error: customerError,
  } = useCustomer();
  const [insights, setInsights] = useState<SavedInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerLoading || !selectedCustomerId) return;

    const fetchInsights = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/insights?customerId=${selectedCustomerId}`,
        );
        if (!response.ok) {
          throw new Error("Failed to load saved insights");
        }
        const data = await response.json();
        // API returns { items: [...] } structure
        const insightsList = Array.isArray(data?.items) ? data.items : [];
        setInsights(insightsList);
      } catch (err: any) {
        console.error("Error loading insights:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [selectedCustomerId, customerLoading]);

  if (customerLoading) return <div className="p-6">Loading customers...</div>;
  if (customerError)
    return (
      <div className="p-6 text-sm text-red-600">
        Error loading customers: {customerError}
      </div>
    );
  if (!selectedCustomerId) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-600 mb-4">
          No customer selected. Please select a customer to view saved insights.
        </div>
        <CustomerSelector value="" onChange={setSelectedCustomerId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <Link
            href="/insights/new"
            className="text-gray-600 hover:text-gray-900 mt-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              Saved Insights
            </h1>
            <div className="max-w-md">
              <CustomerSelector
                value={selectedCustomerId}
                onChange={setSelectedCustomerId}
              />
            </div>
          </div>
        </div>
        <Link href="/insights/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Insight
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Loading insights...</p>
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-700">
            Error: {error}
          </CardContent>
        </Card>
      ) : insights.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-600 mb-4">
              No saved insights for this customer
            </p>
            <Link href="/insights/new">
              <Button>Create your first insight</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight) => (
            <Link key={insight.id} href={`/insights/${insight.id}`}>
              <Card className="h-full cursor-pointer transition-all hover:shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">{insight.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {insight.question}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                      {getInsightTypeLabel(insight.chartType)}
                    </span>
                    <p className="text-xs text-gray-500">
                      {insight.createdAt
                        ? new Date(insight.createdAt).toLocaleDateString()
                        : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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

interface SavedInsight {
  id: number;
  name: string;
  question?: string;
  scope?: string;
  createdAt?: string;
}

export default function SavedInsightsPage() {
  const [insights, setInsights] = useState<SavedInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const response = await fetch("/api/insights");
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
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/insights/new"
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">
            Saved Insights
          </h1>
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
            <p className="text-gray-600 mb-4">No saved insights yet</p>
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
                  <p className="text-xs text-gray-500">
                    {insight.createdAt
                      ? new Date(insight.createdAt).toLocaleDateString()
                      : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

interface MetricsData {
  totalQueries: number;
  successfulQueries: number;
  clarificationRequests: number;
  filterMetrics: {
    overrideRate: number;
    validationErrorRate: number;
    autoCorrections: number;
    avgConfidence: number;
    unresolvedWarnings: number;
  };
  performance: {
    avgLatency: number;
    p95Latency: number;
  };
}

export default function QueryMetricsPage() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual API endpoint
      // const response = await fetch('/api/admin/query-metrics');
      // const data = await response.json();

      // Mock data for now
      const mockData: MetricsData = {
        totalQueries: 1250,
        successfulQueries: 1180,
        clarificationRequests: 45,
        filterMetrics: {
          overrideRate: 92.5,
          validationErrorRate: 3.2,
          autoCorrections: 78,
          avgConfidence: 87.3,
          unresolvedWarnings: 23,
        },
        performance: {
          avgLatency: 3200,
          p95Latency: 6800,
        },
      };

      setMetrics(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch metrics");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-slate-600">Loading query metrics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto">
          <Alert variant="destructive">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const successRate = ((metrics.successfulQueries / metrics.totalQueries) * 100).toFixed(1);
  const clarificationRate = ((metrics.clarificationRequests / metrics.totalQueries) * 100).toFixed(1);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Query Performance Metrics
          </h1>
          <p className="text-slate-600">
            Monitor query execution, filter resolution, and system performance
          </p>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Queries
              </CardTitle>
              <ChartBarIcon className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalQueries.toLocaleString()}</div>
              <p className="text-xs text-slate-600">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Success Rate
              </CardTitle>
              <CheckCircleIcon className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{successRate}%</div>
              <p className="text-xs text-slate-600">
                {metrics.successfulQueries.toLocaleString()} successful
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Clarifications
              </CardTitle>
              <FunnelIcon className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{clarificationRate}%</div>
              <p className="text-xs text-slate-600">
                {metrics.clarificationRequests.toLocaleString()} requests
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Avg Latency
              </CardTitle>
              <ClockIcon className="h-4 w-4 text-slate-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(metrics.performance.avgLatency / 1000).toFixed(1)}s</div>
              <p className="text-xs text-slate-600">
                P95: {(metrics.performance.p95Latency / 1000).toFixed(1)}s
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Resolution Metrics */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Filter Value Resolution Metrics</CardTitle>
            <CardDescription>
              Tracks how filter values are resolved and validated against the semantic database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Override Rate */}
              <MetricCard
                title="Override Rate"
                value={`${metrics.filterMetrics.overrideRate.toFixed(1)}%`}
                target=">90%"
                status={metrics.filterMetrics.overrideRate > 90 ? 'success' : 'warning'}
                description="Percentage of filter values replaced with exact database values"
              />

              {/* Validation Error Rate */}
              <MetricCard
                title="Validation Errors"
                value={`${metrics.filterMetrics.validationErrorRate.toFixed(1)}%`}
                target="<5%"
                status={metrics.filterMetrics.validationErrorRate < 5 ? 'success' : 'error'}
                description="Percentage of filters that failed validation after correction"
              />

              {/* Average Confidence */}
              <MetricCard
                title="Avg Confidence"
                value={`${metrics.filterMetrics.avgConfidence.toFixed(1)}%`}
                target=">85%"
                status={metrics.filterMetrics.avgConfidence > 85 ? 'success' : 'warning'}
                description="Average semantic matching confidence for filter values"
              />

              {/* Auto-Corrections */}
              <MetricCard
                title="Auto-Corrections"
                value={metrics.filterMetrics.autoCorrections.toString()}
                target="Low"
                status="info"
                description="Number of filters auto-corrected for case mismatches"
              />

              {/* Unresolved Warnings */}
              <MetricCard
                title="Unresolved Filters"
                value={metrics.filterMetrics.unresolvedWarnings.toString()}
                target="<10%"
                status={
                  (metrics.filterMetrics.unresolvedWarnings / metrics.totalQueries) * 100 < 10
                    ? 'success'
                    : 'warning'
                }
                description="Filters that needed clarification (missing field or value)"
                highlight={true}
              />

              {/* Clarification Rate */}
              <MetricCard
                title="Clarification Rate"
                value={clarificationRate + "%"}
                target="<15%"
                status={parseFloat(clarificationRate) < 15 ? 'success' : 'warning'}
                description="Percentage of queries requiring user clarification"
              />
            </div>
          </CardContent>
        </Card>

        {/* Info Section */}
        <Card>
          <CardHeader>
            <CardTitle>Understanding Filter Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Override Rate (Target: &gt;90%)</h4>
              <p className="text-sm text-slate-600">
                Measures how often the system replaces LLM-generated filter values with exact database values.
                High override rate indicates accurate terminology mapping.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Validation Error Rate (Target: &lt;5%)</h4>
              <p className="text-sm text-slate-600">
                Percentage of filters that fail validation even after auto-correction.
                Low error rate means the semantic index has good coverage.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">NEW</span>
                Unresolved Filters
              </h4>
              <p className="text-sm text-slate-600">
                Filters that couldn't be mapped to a field or value and require clarification from the user.
                These trigger the AI-powered clarification mode with contextual options (e.g., "young patients" → age thresholds).
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Avg Confidence (Target: &gt;85%)</h4>
              <p className="text-sm text-slate-600">
                Average confidence score of semantic matches. Higher confidence means better fuzzy matching and terminology mapping.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  target: string;
  status: 'success' | 'warning' | 'error' | 'info';
  description: string;
  highlight?: boolean;
}

function MetricCard({ title, value, target, status, description, highlight }: MetricCardProps) {
  const statusColors = {
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const statusTextColors = {
    success: 'text-green-700',
    warning: 'text-yellow-700',
    error: 'text-red-700',
    info: 'text-blue-700',
  };

  const statusBadgeColors = {
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className={`p-4 border rounded-lg ${statusColors[status]} ${highlight ? 'ring-2 ring-blue-300' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
        <Badge variant="secondary" className={statusBadgeColors[status]}>
          Target: {target}
        </Badge>
      </div>
      <div className={`text-3xl font-bold mb-1 ${statusTextColors[status]}`}>
        {value}
      </div>
      <p className="text-xs text-slate-600">{description}</p>
    </div>
  );
}

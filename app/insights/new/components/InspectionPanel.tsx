// app/insights/new/components/InspectionPanel.tsx
// Inspection Panel Component for Phase 7C Task 12
// Provides transparency into how the AI arrived at the answer

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, AlertCircle, Database, Code, Lightbulb, MessageSquare } from "lucide-react";
import { InsightResult } from "@/lib/hooks/useInsights";

interface InspectionPanelProps {
  result: InsightResult;
  onChallengeAssumption?: (assumption: string, explanation: string) => void;
}

type TabId = "understanding" | "sql" | "tables" | "context";

export function InspectionPanel({ result, onChallengeAssumption }: InspectionPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("understanding");

  const tabs = [
    { id: "understanding" as TabId, label: "Understanding", icon: Lightbulb },
    { id: "sql" as TabId, label: "SQL", icon: Code },
    { id: "tables" as TabId, label: "Tables/Fields", icon: Database },
    { id: "context" as TabId, label: "Context", icon: MessageSquare },
  ];

  if (!isOpen) {
    return (
      <div className="mt-4">
        <Button
          onClick={() => setIsOpen(true)}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <AlertCircle className="mr-2 h-4 w-4" />
          How I got this
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 border rounded-lg bg-slate-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-white rounded-t-lg">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">How I got this</h3>
        </div>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="sm"
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b bg-white">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-4 bg-white rounded-b-lg">
        {activeTab === "understanding" && (
          <UnderstandingTab result={result} onChallenge={onChallengeAssumption} />
        )}
        {activeTab === "sql" && <SQLTab result={result} />}
        {activeTab === "tables" && <TablesFieldsTab result={result} onChallenge={onChallengeAssumption} />}
        {activeTab === "context" && <ContextTab result={result} />}
      </div>
    </div>
  );
}

function UnderstandingTab({ result, onChallenge }: {
  result: InsightResult;
  onChallenge?: (assumption: string, explanation: string) => void;
}) {
  const intent = result.context?.intent;

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Query Intent</h4>
        {intent ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Type:</span>
              <span className="text-sm px-2 py-1 bg-blue-50 text-blue-700 rounded">
                {intent.type || "general_query"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Scope:</span>
              <span className="text-sm px-2 py-1 bg-green-50 text-green-700 rounded">
                {intent.scope || "general"}
              </span>
            </div>
            {intent.confidence !== undefined && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Confidence:</span>
                <div className="flex-1 max-w-xs">
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        intent.confidence >= 0.8 ? "bg-green-500" :
                        intent.confidence >= 0.6 ? "bg-yellow-500" :
                        "bg-red-500"
                      }`}
                      style={{ width: `${intent.confidence * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm text-slate-600">
                  {Math.round(intent.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No intent information available</p>
        )}
      </div>

      {/* Metrics */}
      {intent?.metrics && intent.metrics.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Metrics Identified</h4>
          <div className="flex flex-wrap gap-2">
            {intent.metrics.map((metric: string, i: number) => (
              <span key={i} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded">
                {metric}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      {intent?.filters && intent.filters.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Filters Applied</h4>
          <div className="space-y-2">
            {intent.filters.map((filter: any, i: number) => (
              <div key={i} className="text-sm bg-orange-50 border border-orange-200 rounded p-2">
                <span className="font-medium">{filter.concept || filter.field}:</span>{" "}
                {filter.value || filter.condition}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time Range */}
      {intent?.timeRange && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Time Range</h4>
          <div className="text-sm bg-indigo-50 border border-indigo-200 rounded p-2">
            Last {intent.timeRange.value} {intent.timeRange.unit}
          </div>
        </div>
      )}

      {/* Field Assumptions */}
      {result.assumptions && result.assumptions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Field Assumptions
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({result.assumptions.length} assumptions made)
            </span>
          </h4>
          <div className="space-y-2">
            {result.assumptions.map((assumption, i) => (
              <AssumptionCard
                key={i}
                assumption={assumption}
                onChallenge={onChallenge}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssumptionCard({
  assumption,
  onChallenge
}: {
  assumption: any;
  onChallenge?: (assumption: string, explanation: string) => void;
}) {
  const confidenceColor =
    assumption.confidence >= 0.8 ? "green" :
    assumption.confidence >= 0.6 ? "yellow" :
    assumption.confidence >= 0.4 ? "orange" :
    "red";

  return (
    <div className={`border rounded p-3 bg-${confidenceColor}-50 border-${confidenceColor}-200`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-1">
          <p className="text-xs font-medium text-slate-600">{assumption.intent}</p>
          <div className="text-sm">
            <span className="text-slate-500">Assumed:</span>{" "}
            <span className="font-mono text-slate-700">{assumption.assumed}</span>
          </div>
          {assumption.actual ? (
            <div className="text-sm">
              <span className="text-slate-500">Used:</span>{" "}
              <span className="font-mono text-green-700 font-semibold">{assumption.actual}</span>
            </div>
          ) : (
            <div className="text-sm text-red-700">
              ⚠️ No matching field found in schema
            </div>
          )}
          <div className="text-xs text-slate-500">
            Confidence: {Math.round(assumption.confidence * 100)}%
          </div>
        </div>

        {onChallenge && (
          <Button
            onClick={() => onChallenge(
              assumption.assumed,
              `I used "${assumption.actual || assumption.assumed}" for ${assumption.intent}`
            )}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            Challenge
          </Button>
        )}
      </div>
    </div>
  );
}

function SQLTab({ result }: { result: InsightResult }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(result.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">Generated SQL Query</h4>
        <Button onClick={handleCopy} variant="outline" size="sm">
          {copied ? "Copied!" : "Copy SQL"}
        </Button>
      </div>

      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code>{result.sql}</code>
      </pre>

      {result.mode && (
        <div className="text-sm text-slate-600">
          <span className="font-medium">Generation Mode:</span>{" "}
          <span className="px-2 py-1 bg-slate-100 rounded">
            {result.mode === "template" ? "Template-based" :
             result.mode === "direct" ? "Direct Semantic" :
             "Auto-Funnel"}
          </span>
        </div>
      )}
    </div>
  );
}

function TablesFieldsTab({ result, onChallenge }: {
  result: InsightResult;
  onChallenge?: (assumption: string, explanation: string) => void;
}) {
  const forms = result.context?.forms || [];
  const fields = result.context?.fields || [];
  const joinPaths = result.context?.joinPaths || [];

  return (
    <div className="space-y-4">
      {/* Forms/Tables Used */}
      {forms.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Tables Used</h4>
          <div className="flex flex-wrap gap-2">
            {forms.map((form: string, i: number) => (
              <span key={i} className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded border border-blue-200">
                {form}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Fields Used */}
      {fields.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Fields Used</h4>
          <div className="grid grid-cols-2 gap-2">
            {fields.map((field: string, i: number) => (
              <div key={i} className="text-sm px-3 py-1 bg-green-50 text-green-700 rounded border border-green-200 font-mono">
                {field}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Paths */}
      {joinPaths.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Join Paths</h4>
          <div className="space-y-2">
            {joinPaths.map((path: string, i: number) => (
              <div key={i} className="text-sm px-3 py-2 bg-purple-50 text-purple-700 rounded border border-purple-200 font-mono">
                {path}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field Assumptions in Tables/Fields context */}
      {result.assumptions && result.assumptions.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Field Mapping Decisions
          </h4>
          <div className="text-xs text-slate-600 mb-2">
            These are the field names I chose from the actual database schema:
          </div>
          <div className="space-y-2">
            {result.assumptions.map((assumption, i) => (
              <div key={i} className="text-sm bg-slate-50 border rounded p-2">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="text-slate-600">{assumption.intent}:</span>{" "}
                    {assumption.actual ? (
                      <>
                        <span className="line-through text-slate-400">{assumption.assumed}</span>
                        {" → "}
                        <span className="font-mono font-semibold text-green-700">{assumption.actual}</span>
                      </>
                    ) : (
                      <span className="font-mono text-red-700">
                        ❌ {assumption.assumed} (not found)
                      </span>
                    )}
                  </div>
                  {onChallenge && (
                    <Button
                      onClick={() => onChallenge(
                        assumption.assumed,
                        `I used "${assumption.actual || assumption.assumed}" for ${assumption.intent}`
                      )}
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                    >
                      Challenge
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {forms.length === 0 && fields.length === 0 && joinPaths.length === 0 && (
        <p className="text-sm text-slate-500">No table/field information available</p>
      )}
    </div>
  );
}

function ContextTab({ result }: { result: InsightResult }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Full Semantic Context</h4>
        <p className="text-xs text-slate-600 mb-2">
          This is the complete context bundle used to generate the SQL query.
        </p>
      </div>

      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-xs max-h-96">
        <code>{JSON.stringify(result.context, null, 2)}</code>
      </pre>

      {/* Complexity Info */}
      {result.complexityScore !== undefined && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Complexity Analysis</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Score:</span>
              <span className="text-sm px-2 py-1 bg-slate-100 rounded">
                {result.complexityScore}/10
              </span>
            </div>
            {result.executionStrategy && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Strategy:</span>
                <span className="text-sm px-2 py-1 bg-slate-100 rounded">
                  {result.executionStrategy}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

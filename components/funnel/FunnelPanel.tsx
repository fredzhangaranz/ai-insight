import React, { useState } from "react";
import type { SubQuestion } from "@/lib/types/funnel";

interface FunnelPanelProps {
  subQuestion: SubQuestion;
  assessmentFormDefinition?: any;
  onEditQuestion?: (questionId: string, newText: string) => void;
  onEditSql?: (
    questionId: string,
    newSql: string,
    metadata?: {
      explanation?: string;
      validationNotes?: string;
      matchedTemplate?: string;
    }
  ) => void;
  onExecuteQuery?: (questionId: string) => void;
  selectedModelId: string;
}

export const FunnelPanel: React.FC<FunnelPanelProps> = ({
  subQuestion,
  assessmentFormDefinition,
  onEditQuestion,
  onEditSql,
  onExecuteQuery,
  selectedModelId,
}) => {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [isEditingSql, setIsEditingSql] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState(subQuestion.text);
  const [editedSql, setEditedSql] = useState(subQuestion.sqlQuery || "");
  const [resultViewMode, setResultViewMode] = useState<"json" | "table">(
    "json"
  );
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [isSavingSql, setIsSavingSql] = useState(false);
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [expandedSections, setExpandedSections] = useState<{
    explanation: boolean;
    validationNotes: boolean;
    template: boolean;
  }>({
    explanation: false,
    validationNotes: false,
    template: false,
  });

  const handleQuestionSave = async () => {
    if (!editedQuestion.trim()) {
      alert("Question text cannot be empty");
      return;
    }

    setIsSavingQuestion(true);
    try {
      // Update in database cache
      const response = await fetch(
        `/api/ai/funnel/subquestions/${subQuestion.id.replace(
          "sq-",
          ""
        )}/question`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            questionText: editedQuestion.trim(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save question");
      }

      // Update local state
      if (onEditQuestion) {
        onEditQuestion(subQuestion.id, editedQuestion.trim());
      }

      // Clear SQL query and results when question is edited
      if (onEditSql) {
        onEditSql(subQuestion.id, "");
      }

      // Reset result view mode to JSON
      setResultViewMode("json");
      setIsEditingQuestion(false);

      console.log("✅ Question saved successfully");
    } catch (error: any) {
      console.error("Error saving question:", error);
      alert(`Failed to save question: ${error.message}`);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleQuestionCancel = () => {
    setEditedQuestion(subQuestion.text); // Reset to original
    setIsEditingQuestion(false);
  };

  const handleSqlSave = async () => {
    if (!editedSql.trim()) {
      alert("SQL query cannot be empty");
      return;
    }

    setIsSavingSql(true);
    try {
      // Update in database cache
      const response = await fetch(
        `/api/ai/funnel/subquestions/${subQuestion.id.replace("sq-", "")}/sql`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sqlQuery: editedSql.trim(),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save SQL");
      }

      // Update local state
      if (onEditSql) {
        onEditSql(subQuestion.id, editedSql.trim());
      }

      setIsEditingSql(false);

      console.log("✅ SQL saved successfully");
    } catch (error: any) {
      console.error("Error saving SQL:", error);
      alert(`Failed to save SQL: ${error.message}`);
    } finally {
      setIsSavingSql(false);
    }
  };

  const handleSqlCancel = () => {
    setEditedSql(subQuestion.sqlQuery || ""); // Reset to original
    setIsEditingSql(false);
  };

  const handleGenerateSql = async () => {
    if (!subQuestion.text.trim()) {
      alert("Cannot generate SQL for empty question");
      return;
    }

    setIsGeneratingSql(true);
    try {
      console.log("Generating SQL for question:", subQuestion.text);

      const response = await fetch("/api/ai/funnel/generate-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subQuestion: subQuestion.text,
          previousQueries: [], // TODO: Pass previous queries for context
          assessmentFormDefinition: assessmentFormDefinition || {},
          databaseSchemaContext: "", // TODO: Pass actual schema context
          modelId: selectedModelId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate SQL");
      }

      const result = await response.json();
      console.log("SQL generated:", result);

      if (result.error) {
        throw new Error(result.error);
      }

      // Update the SQL query and metadata
      const newSql = result.generatedSql;
      const explanation = result.explanation;
      const validationNotes = result.validationNotes;
      const matchedTemplate = result.matchedQueryTemplate;

      setEditedSql(newSql);

      // Save to database cache
      const saveResponse = await fetch(
        `/api/ai/funnel/subquestions/${subQuestion.id.replace("sq-", "")}/sql`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sqlQuery: newSql,
            sqlExplanation: explanation,
            sqlValidationNotes: validationNotes,
            sqlMatchedTemplate: matchedTemplate,
          }),
        }
      );

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.error || "Failed to save generated SQL");
      }

      // Update local state with all metadata
      if (onEditSql) {
        onEditSql(subQuestion.id, newSql, {
          explanation,
          validationNotes,
          matchedTemplate,
        });
      }

      console.log("✅ SQL generated and saved successfully");
    } catch (error: any) {
      console.error("Error generating SQL:", error);
      alert(`Failed to generate SQL: ${error.message}`);
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!subQuestion.sqlQuery) {
      alert("No SQL query to execute.");
      return;
    }
    setIsExecuting(true);
    setExecutionError(null);
    setQueryResult(null);
    try {
      const response = await fetch("/api/ai/execute-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: subQuestion.sqlQuery }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to execute query");
      }
      const result = await response.json();
      setQueryResult(result.data || []);
      setResultViewMode("table");
    } catch (err: any) {
      setExecutionError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatSql = (sql: string): string => {
    if (!sql) return "";

    // Basic SQL formatting
    let formatted = sql
      // Replace escaped newlines with actual newlines
      .replace(/\\n/g, "\n")
      // Add line breaks after common SQL keywords
      .replace(
        /\b(SELECT|FROM|WHERE|JOIN|LEFT JOIN|INNER JOIN|RIGHT JOIN|GROUP BY|ORDER BY|HAVING|UNION|WITH|AS)\b/gi,
        "\n$1"
      )
      // Add line breaks after commas in SELECT clauses
      .replace(/(,)\s*/g, "$1\n  ")
      // Add line breaks after ON conditions
      .replace(/\b(ON)\b/gi, "\n  $1")
      // Add line breaks after AND/OR
      .replace(/\b(AND|OR)\b/gi, "\n    $1")
      // Clean up multiple newlines
      .replace(/\n\s*\n/g, "\n")
      // Add proper indentation
      .split("\n")
      .map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return "";

        // Determine indentation level
        let indent = 0;
        if (
          trimmed.match(
            /^(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|UNION|WITH)/i
          )
        ) {
          indent = 0;
        } else if (
          trimmed.match(/^(JOIN|LEFT JOIN|INNER JOIN|RIGHT JOIN|ON)/i)
        ) {
          indent = 1;
        } else if (trimmed.match(/^(AND|OR)/i)) {
          indent = 2;
        } else if (trimmed.startsWith(",")) {
          indent = 2;
        } else {
          indent = 1;
        }

        return "  ".repeat(indent) + trimmed;
      })
      .filter((line) => line !== "")
      .join("\n");

    return formatted;
  };

  const renderTableData = (data: any[]) => {
    if (!data || data.length === 0) return null;

    const columns = Object.keys(data[0]);
    const displayData = data.slice(0, 10); // Show max 10 rows

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-100">
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-3 py-2 text-left font-medium text-gray-700 border-b"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.map((row, index) => (
              <tr key={index} className="border-b hover:bg-gray-50">
                {columns.map((column) => (
                  <td key={column} className="px-3 py-2 text-gray-800">
                    {typeof row[column] === "object"
                      ? JSON.stringify(row[column])
                      : String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 10 && (
          <div className="text-xs text-gray-500 mt-2 text-center">
            Showing first 10 of {data.length} rows
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium">
            {subQuestion.order}
          </span>
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(
              subQuestion.status
            )}`}
          >
            {subQuestion.status}
          </span>
        </div>
        {subQuestion.lastExecutionDate && (
          <span className="text-xs text-gray-500">
            {new Date(subQuestion.lastExecutionDate).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Question Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Question</h3>
          {onEditQuestion && (
            <button
              onClick={() => setIsEditingQuestion(!isEditingQuestion)}
              disabled={isSavingQuestion}
              className={`text-xs transition-colors ${
                isSavingQuestion
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-blue-600 hover:text-blue-800"
              }`}
            >
              {isEditingQuestion ? "Cancel" : "Edit"}
            </button>
          )}
        </div>

        {isEditingQuestion ? (
          <div className="space-y-2">
            <textarea
              value={editedQuestion}
              onChange={(e) => setEditedQuestion(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm"
              rows={3}
              disabled={isSavingQuestion}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleQuestionSave}
                disabled={isSavingQuestion}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  isSavingQuestion
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {isSavingQuestion ? (
                  <span className="flex items-center space-x-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                    <span>Saving...</span>
                  </span>
                ) : (
                  "Save"
                )}
              </button>
              <button
                onClick={handleQuestionCancel}
                disabled={isSavingQuestion}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  isSavingQuestion
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-gray-300 text-gray-700 hover:bg-gray-400"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded">
            {subQuestion.text}
          </p>
        )}
      </div>

      {/* SQL Query Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">SQL Query</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleGenerateSql}
              disabled={isGeneratingSql}
              className={`text-xs transition-colors ${
                isGeneratingSql
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-green-600 hover:text-green-800"
              }`}
              title={
                subQuestion.sqlQuery
                  ? "Generate new SQL query based on current question"
                  : "Generate SQL query for this question"
              }
            >
              {isGeneratingSql ? (
                <span className="flex items-center space-x-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b border-green-600"></div>
                  <span>Generating...</span>
                </span>
              ) : (
                `🔄 ${subQuestion.sqlQuery ? "Regenerate" : "Generate"}`
              )}
            </button>
            {onEditSql && (
              <button
                onClick={() => setIsEditingSql(!isEditingSql)}
                disabled={isSavingSql}
                className={`text-xs transition-colors ${
                  isSavingSql
                    ? "text-gray-400 cursor-not-allowed"
                    : "text-blue-600 hover:text-blue-800"
                }`}
              >
                {isEditingSql ? "Cancel" : "Edit"}
              </button>
            )}
            {onExecuteQuery && subQuestion.sqlQuery && (
              <button
                onClick={handleExecuteSql}
                className={`text-green-600 hover:text-green-800 text-xs ${
                  isExecuting ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <span className="flex items-center space-x-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-green-600"></div>
                    <span>Executing...</span>
                  </span>
                ) : (
                  "Execute"
                )}
              </button>
            )}
          </div>
        </div>

        {isEditingSql ? (
          <div className="space-y-2">
            <textarea
              value={editedSql}
              onChange={(e) => setEditedSql(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded text-sm font-mono bg-gray-50"
              rows={8}
              placeholder="Enter SQL query..."
              disabled={isSavingSql}
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSqlSave}
                disabled={isSavingSql}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  isSavingSql
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                {isSavingSql ? (
                  <span className="flex items-center space-x-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                    <span>Saving...</span>
                  </span>
                ) : (
                  "Save"
                )}
              </button>
              <button
                onClick={handleSqlCancel}
                disabled={isSavingSql}
                className={`px-3 py-1 rounded text-xs transition-colors ${
                  isSavingSql
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-gray-300 text-gray-700 hover:bg-gray-400"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="relative">
            <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded overflow-x-auto font-mono leading-relaxed max-h-96">
              {subQuestion.sqlQuery
                ? formatSql(subQuestion.sqlQuery)
                : "No SQL query generated yet"}
            </pre>
            {subQuestion.sqlQuery && (
              <div className="absolute top-2 right-2">
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(subQuestion.sqlQuery || "")
                  }
                  className="text-xs bg-gray-800 text-gray-300 hover:text-white px-2 py-1 rounded opacity-75 hover:opacity-100 transition-opacity"
                  title="Copy SQL to clipboard"
                >
                  📋 Copy
                </button>
              </div>
            )}
          </div>
        )}

        {/* SQL Metadata Section - Only show when SQL exists */}
        {subQuestion.sqlQuery && !isEditingSql && (
          <div className="mt-3 space-y-2">
            {/* Explanation */}
            <div className="border border-gray-200 rounded-md">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    explanation: !prev.explanation,
                  }))
                }
                className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
              >
                <span>📝 Explanation</span>
                <span className="text-gray-400">
                  {expandedSections.explanation ? "▼" : "▶"}
                </span>
              </button>
              {expandedSections.explanation && (
                <div className="px-3 pb-3 text-xs text-gray-600 border-t border-gray-100">
                  {subQuestion.sqlExplanation || "No explanation available"}
                </div>
              )}
            </div>

            {/* Validation Notes */}
            <div className="border border-gray-200 rounded-md">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    validationNotes: !prev.validationNotes,
                  }))
                }
                className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
              >
                <span>🔍 Validation Notes</span>
                <span className="text-gray-400">
                  {expandedSections.validationNotes ? "▼" : "▶"}
                </span>
              </button>
              {expandedSections.validationNotes && (
                <div className="px-3 pb-3 text-xs text-gray-600 border-t border-gray-100">
                  {subQuestion.sqlValidationNotes ||
                    "No validation notes available"}
                </div>
              )}
            </div>

            {/* Matched Template */}
            <div className="border border-gray-200 rounded-md">
              <button
                onClick={() =>
                  setExpandedSections((prev) => ({
                    ...prev,
                    template: !prev.template,
                  }))
                }
                className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
              >
                <span>🏷️ Matched Template</span>
                <span className="text-gray-400">
                  {expandedSections.template ? "▼" : "▶"}
                </span>
              </button>
              {expandedSections.template && (
                <div className="px-3 pb-3 text-xs text-gray-600 border-t border-gray-100">
                  <span className="font-medium">
                    {subQuestion.sqlMatchedTemplate || "None"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Data Results Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Results</h3>
          {queryResult && queryResult.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">View:</span>
              <div className="flex bg-gray-200 rounded-md p-1">
                <button
                  onClick={() => setResultViewMode("json")}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    resultViewMode === "json"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  JSON
                </button>
                <button
                  onClick={() => setResultViewMode("table")}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    resultViewMode === "table"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Table
                </button>
              </div>
            </div>
          )}
        </div>
        {isExecuting && (
          <div className="text-xs text-blue-600 mb-2 flex items-center space-x-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-600"></div>
            <span>Running query...</span>
          </div>
        )}
        {executionError && (
          <div className="text-xs text-red-600 mb-2">{executionError}</div>
        )}
        {queryResult && queryResult.length > 0 ? (
          <div className="bg-gray-50 p-3 rounded max-h-60 overflow-y-auto">
            <div className="text-xs text-gray-600 mb-2">
              {queryResult.length} rows returned
            </div>
            {resultViewMode === "json" ? (
              <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(queryResult.slice(0, 5), null, 2)}
                {queryResult.length > 5 && "\n... (showing first 5 rows)"}
              </pre>
            ) : (
              renderTableData(queryResult)
            )}
          </div>
        ) : !isExecuting && !executionError ? (
          <div className="text-xs text-gray-400 italic">
            No results yet. Click Execute to run the query.
          </div>
        ) : null}
      </div>
    </div>
  );
};

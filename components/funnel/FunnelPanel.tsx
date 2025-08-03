import React, { useState } from "react";
import type { SubQuestion } from "@/lib/types/funnel";

interface FunnelPanelProps {
  subQuestion: SubQuestion;
  onEditQuestion?: (questionId: string, newText: string) => void;
  onEditSql?: (questionId: string, newSql: string) => void;
  onExecuteQuery?: (questionId: string) => void;
}

export const FunnelPanel: React.FC<FunnelPanelProps> = ({
  subQuestion,
  onEditQuestion,
  onEditSql,
  onExecuteQuery,
}) => {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [isEditingSql, setIsEditingSql] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState(subQuestion.text);
  const [editedSql, setEditedSql] = useState(subQuestion.sqlQuery || "");
  const [resultViewMode, setResultViewMode] = useState<"json" | "table">(
    "json"
  );

  const handleQuestionSave = () => {
    if (onEditQuestion) {
      onEditQuestion(subQuestion.id, editedQuestion);
    }
    setIsEditingQuestion(false);
  };

  const handleSqlSave = () => {
    if (onEditSql) {
      onEditSql(subQuestion.id, editedSql);
    }
    setIsEditingSql(false);
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
              className="text-blue-600 hover:text-blue-800 text-xs"
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
            />
            <div className="flex space-x-2">
              <button
                onClick={handleQuestionSave}
                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditedQuestion(subQuestion.text);
                  setIsEditingQuestion(false);
                }}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
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
            {onEditSql && (
              <button
                onClick={() => setIsEditingSql(!isEditingSql)}
                className="text-blue-600 hover:text-blue-800 text-xs"
              >
                {isEditingSql ? "Cancel" : "Edit"}
              </button>
            )}
            {onExecuteQuery && subQuestion.sqlQuery && (
              <button
                onClick={() => onExecuteQuery(subQuestion.id)}
                className="text-green-600 hover:text-green-800 text-xs"
              >
                Execute
              </button>
            )}
          </div>
        </div>

        {isEditingSql ? (
          <div className="space-y-2">
            <textarea
              value={editedSql}
              onChange={(e) => setEditedSql(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded text-sm font-mono"
              rows={4}
              placeholder="Enter SQL query..."
            />
            <div className="flex space-x-2">
              <button
                onClick={handleSqlSave}
                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditedSql(subQuestion.sqlQuery || "");
                  setIsEditingSql(false);
                }}
                className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
            {subQuestion.sqlQuery || "No SQL query generated yet"}
          </pre>
        )}
      </div>

      {/* Data Results Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-700">Results</h3>
          {subQuestion.data && subQuestion.data.length > 0 && (
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

        {subQuestion.data && subQuestion.data.length > 0 ? (
          <div className="bg-gray-50 p-3 rounded max-h-60 overflow-y-auto">
            <div className="text-xs text-gray-600 mb-2">
              {subQuestion.data.length} rows returned
            </div>

            {resultViewMode === "json" ? (
              <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(subQuestion.data.slice(0, 5), null, 2)}
                {subQuestion.data.length > 5 && "\n... (showing first 5 rows)"}
              </pre>
            ) : (
              renderTableData(subQuestion.data)
            )}
          </div>
        ) : (
          <div className="bg-gray-50 p-3 rounded text-xs text-gray-500">
            No data available
          </div>
        )}
      </div>
    </div>
  );
};

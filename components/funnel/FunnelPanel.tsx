import React, { useState, useEffect } from "react";
import type { SubQuestion } from "@/lib/types/funnel";
import { useErrorHandler } from "@/lib/error-handler";
import type { ChartType } from "@/lib/chart-contracts";
import { ChartGenerationModal } from "./ChartGenerationModal";
import {
  SaveInsightDialog,
  type SaveInsightInitial,
} from "@/components/insights/SaveInsightDialog";
import { Button } from "@/components/ui/button";
import { TemplateReviewModal } from "./TemplateReviewModal";
import { TemplateApplyModal } from "./TemplateApplyModal";
import { TemplateSuggestions, type TemplateSuggestion } from "./TemplateSuggestions";
import type { TemplateDraftPayload } from "@/lib/services/template.service";
import type { ValidationResult } from "@/lib/services/template-validator.service";

interface FunnelPanelProps {
  subQuestion: SubQuestion;
  assessmentFormDefinition?: any;
  assessmentFormId?: string;
  patientId?: string | null;
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
  onMarkComplete?: (questionId: string) => void;
  onQueryResult?: (questionId: string, results: any[]) => void;
  initialResults?: any[] | null;
  previousSqlQueries?: string[];
  selectedModelId: string;
}

export const FunnelPanel: React.FC<FunnelPanelProps> = ({
  subQuestion,
  assessmentFormDefinition,
  assessmentFormId,
  patientId,
  onEditQuestion,
  onEditSql,
  onExecuteQuery,
  onMarkComplete,
  onQueryResult,
  initialResults,
  previousSqlQueries = [],
  selectedModelId,
}) => {
  const { handleError, handleSuccess } = useErrorHandler();
  const scope: "form" | "schema" = assessmentFormId ? "form" : "schema";

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
    includeFields: boolean;
  }>({
    explanation: false,
    validationNotes: false,
    template: false,
    includeFields: false,
  });
  const [resultsCleared, setResultsCleared] = useState(false);

  // Manual chart generation modal state
  const [isChartModalOpen, setIsChartModalOpen] = useState(false);
  // Save Insight dialog state
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveInitial, setSaveInitial] = useState<SaveInsightInitial | null>(
    null
  );

  // --- Enrichment (Lean MVP: AI-first Field Inclusion) ---
  const ALLOWED_FIELDS = [
    "patient.firstName",
    "patient.lastName",
    "patient.dateOfBirth",
    "wound.etiology",
  ] as const;
  type AllowedField = (typeof ALLOWED_FIELDS)[number];
  const [desiredFields, setDesiredFields] = useState<AllowedField[]>([]);
  const [fieldInput, setFieldInput] = useState<string>("");
  const MAX_FIELDS = 3;

  const [templatesFeatureAvailable, setTemplatesFeatureAvailable] = useState(true);
  const [isTemplateReviewOpen, setIsTemplateReviewOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraftPayload | null>(
    null
  );
  const [templateValidation, setTemplateValidation] =
    useState<ValidationResult | null>(null);
  const [templateWarnings, setTemplateWarnings] = useState<string[]>([]);
  const [templateModelId, setTemplateModelId] = useState<string | undefined>();
  const [isExtractingTemplate, setIsExtractingTemplate] = useState(false);
  const [templateExtractionError, setTemplateExtractionError] =
    useState<string | null>(null);
  const [isSavingTemplateDraft, setIsSavingTemplateDraft] = useState(false);
  const [templateSuggestions, setTemplateSuggestions] =
    useState<TemplateSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<TemplateSuggestion | null>(null);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [localMatchedTemplate, setLocalMatchedTemplate] = useState<string | null>(
    subQuestion.sqlMatchedTemplate ?? null
  );
  const [lastExecutionSuccessful, setLastExecutionSuccessful] =
    useState<boolean>(false);

  useEffect(() => {
    // Reset all result-related states when navigating to a different sub-question
    setResultsCleared(false);
    setQueryResult(null);
    setExecutionError(null);
    setResultViewMode("json");
    // Reset enrichment per sub-question
    setDesiredFields([]);
    setFieldInput("");
    setTemplateExtractionError(null);
    setTemplateDraft(null);
    setTemplateValidation(null);
    setTemplateWarnings([]);
    setSelectedSuggestion(null);
    setIsApplyModalOpen(false);
    setIsTemplateReviewOpen(false);
    setLocalMatchedTemplate(subQuestion.sqlMatchedTemplate ?? null);
    setLastExecutionSuccessful(false);
  }, [subQuestion.id]);

  // Load initial results when they are provided
  useEffect(() => {
    if (initialResults !== undefined) {
      setQueryResult(initialResults);
      setLastExecutionSuccessful(true);
    }
  }, [initialResults]);

  useEffect(() => {
    setLocalMatchedTemplate(subQuestion.sqlMatchedTemplate ?? null);
  }, [subQuestion.id, subQuestion.sqlMatchedTemplate]);

  useEffect(() => {
    if (!isApplyModalOpen) {
      setSelectedSuggestion(null);
    }
  }, [isApplyModalOpen]);

  useEffect(() => {
    if (!templatesFeatureAvailable) {
      setTemplateSuggestions([]);
      setSuggestionsError(null);
      setSuggestionsLoading(false);
      return;
    }

    const question = subQuestion.text?.trim();
    if (!question || question.length < 5) {
      setTemplateSuggestions([]);
      setSuggestionsError(null);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setSuggestionsLoading(true);
    setSuggestionsError(null);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/ai/templates/suggest", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ question, limit: 3 }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) {
              setTemplatesFeatureAvailable(false);
              setTemplateSuggestions([]);
            }
            return;
          }
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || "Failed to fetch template suggestions"
          );
        }

        const body = await response.json();
        if (!cancelled) {
          setTemplateSuggestions(body.data ?? []);
          setSuggestionsError(null);
        }
      } catch (err: any) {
        if (cancelled || err?.name === "AbortError") return;
        setSuggestionsError(err.message || "Unable to load suggestions");
        setTemplateSuggestions([]);
      } finally {
        if (!cancelled) {
          setSuggestionsLoading(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [subQuestion.id, subQuestion.text, templatesFeatureAvailable]);

  const handleMarkComplete = async () => {
    if (!onMarkComplete) return;

    // Check if SQL query exists before allowing completion
    if (!subQuestion.sqlQuery || subQuestion.sqlQuery.trim() === "") {
      const shouldProceed = window.confirm(
        "This sub-question has no SQL query generated yet. Are you sure you want to mark it as complete?\n\n" +
          "Consider generating and executing a SQL query first to ensure the analysis is thorough."
      );

      if (!shouldProceed) {
        return;
      }
    }

    try {
      // Update status in database
      const response = await fetch(
        `/api/ai/funnel/subquestions/${subQuestion.id.replace(
          "sq-",
          ""
        )}/status`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "completed",
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to mark as complete");
      }

      // Call the parent callback
      onMarkComplete(subQuestion.id);
      handleSuccess("Sub-question marked as complete", "Mark Complete");
      console.log("✅ Sub-question marked as complete");
    } catch (error: any) {
      handleError(error, "Mark Complete");
    }
  };

  const openSaveDialog = (override?: {
    chartType?: ChartType;
    chartMapping?: any;
  }) => {
    if (!subQuestion.sqlQuery) {
      handleError(new Error("No SQL to save"), "Save Insight");
      return;
    }
    const ct: ChartType = override?.chartType || "table";
    const mapping = override?.chartMapping || {};
    if (ct !== "table" && !mapping) {
      handleError(new Error("Missing chart mapping"), "Save Insight");
      return;
    }
    const initial: SaveInsightInitial = {
      name: subQuestion.text.slice(0, 100),
      question: subQuestion.text,
      scope,
      formId: assessmentFormId || null,
      sql: subQuestion.sqlQuery,
      chartType: ct,
      chartMapping: mapping || {},
      chartOptions: undefined,
      tags: [],
    };
    setSaveInitial(initial);
    setIsSaveDialogOpen(true);
  };

  const handleQuestionSave = async () => {
    if (!editedQuestion.trim()) {
      handleError(new Error("Question text cannot be empty"), "Save Question");
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
        throw new Error(errorData.message || "Failed to save question");
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
      setLocalMatchedTemplate(null);
      setLastExecutionSuccessful(false);

      handleSuccess("Question saved successfully", "Save Question");
      console.log("✅ Question saved successfully");
    } catch (error: any) {
      handleError(error, "Save Question");
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
      handleError(new Error("SQL query cannot be empty"), "Save SQL");
      return;
    }

    setIsSavingSql(true);

    // Clear results when SQL is manually edited and saved
    setQueryResult(null);
    setExecutionError(null);
    setResultsCleared(true);
    setLocalMatchedTemplate(null);
    setLastExecutionSuccessful(false);

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
        throw new Error(errorData.message || "Failed to save SQL");
      }

      // Update local state
      if (onEditSql) {
        onEditSql(subQuestion.id, editedSql.trim());
      }

      setIsEditingSql(false);

      handleSuccess("SQL saved successfully", "Save SQL");
      console.log("✅ SQL saved successfully");
    } catch (error: any) {
      handleError(error, "Save SQL");
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
      handleError(
        new Error("Cannot generate SQL for empty question"),
        "Generate SQL"
      );
      return;
    }

    setIsGeneratingSql(true);

    // Clear results when SQL is regenerated
    setQueryResult(null);
    setExecutionError(null);
    setResultsCleared(true);
    setLocalMatchedTemplate(null);
    setLastExecutionSuccessful(false);

    try {
      console.log("Generating SQL for question:", subQuestion.text);

      const response = await fetch("/api/ai/funnel/generate-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subQuestion: subQuestion.text,
          previousQueries: previousSqlQueries,
          assessmentFormDefinition:
            scope === "form" ? assessmentFormDefinition || {} : undefined,
          modelId: selectedModelId,
          // Lean MVP: pass desiredFields (server may ignore until wired)
          desiredFields,
          scope,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate SQL");
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
      setLocalMatchedTemplate(matchedTemplate || null);
      setLastExecutionSuccessful(false);

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
        throw new Error(errorData.message || "Failed to save generated SQL");
      }

      // Update local state with all metadata
      if (onEditSql) {
        onEditSql(subQuestion.id, newSql, {
          explanation,
          validationNotes,
          matchedTemplate,
        });
      }

      // Clear results when SQL is regenerated to ensure fresh data
      if (queryResult) {
        setQueryResult(null);
        setResultsCleared(true);
      }

      handleSuccess("SQL generated and saved successfully", "Generate SQL");
      console.log("✅ SQL generated and saved successfully");
    } catch (error: any) {
      handleError(error, "Generate SQL");
    } finally {
      setIsGeneratingSql(false);
    }
  };

  const handleExecuteSql = async () => {
    if (!subQuestion.sqlQuery) {
      handleError(new Error("No SQL query to execute."), "Execute Query");
      return;
    }
    setIsExecuting(true);
    setExecutionError(null);
    setQueryResult(null);
    setResultsCleared(false); // Reset cleared flag when executing new query
    try {
      // Prepare parameters object
      const params: Record<string, any> = {};
      if (patientId) {
        params.patientId = patientId;
      }

      const response = await fetch("/api/ai/execute-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: subQuestion.sqlQuery,
          params: Object.keys(params).length > 0 ? params : undefined,
          subQuestionId: subQuestion.id.replace("sq-", ""),
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to execute query");
      }
      const result = await response.json();
      setQueryResult(result.data || []);
      setResultViewMode("table");
      if (onQueryResult) {
        onQueryResult(subQuestion.id, result.data || []);
      }
      setLastExecutionSuccessful(true);
      handleSuccess("Query executed successfully", "Execute Query");
    } catch (err: any) {
      setExecutionError(err.message);
      handleError(err, "Execute Query");
      setLastExecutionSuccessful(false);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleOpenTemplateReview = async () => {
    if (!subQuestion.sqlQuery) {
      handleError(
        new Error("Generate and execute SQL before saving a template."),
        "Save as Template"
      );
      return;
    }

    if (!templatesFeatureAvailable) {
      setTemplateExtractionError("Template system is disabled.");
      return;
    }

    setIsExtractingTemplate(true);
    setTemplateExtractionError(null);

    try {
      const response = await fetch("/api/ai/templates/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questionText: subQuestion.text,
          sqlQuery: subQuestion.sqlQuery,
          modelId: selectedModelId,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          setTemplatesFeatureAvailable(false);
          setTemplateExtractionError("Template system is disabled.");
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to extract template draft"
        );
      }

      const result = await response.json();
      setTemplateDraft(result.data ?? null);
      setTemplateValidation(result.validation ?? null);
      setTemplateWarnings(result.warnings ?? []);
      setTemplateModelId(result.modelId ?? undefined);
      setIsTemplateReviewOpen(true);
      setTemplatesFeatureAvailable(true);
    } catch (error: any) {
      const message = error?.message || "Failed to extract template draft";
      setTemplateExtractionError(message);
      handleError(error, "Save as Template");
    } finally {
      setIsExtractingTemplate(false);
    }
  };

  const handleSaveTemplateDraft = async (payload: TemplateDraftPayload) => {
    setIsSavingTemplateDraft(true);
    try {
      const response = await fetch("/api/ai/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || "Failed to save template draft"
        );
      }

      const result = await response.json();
      handleSuccess("Template draft saved", "Save Template");
      setTemplateWarnings(result.warnings ?? []);
      setTemplateDraft(payload);
      setIsTemplateReviewOpen(false);
    } catch (error: any) {
      handleError(error, "Save Template");
    } finally {
      setIsSavingTemplateDraft(false);
    }
  };

  const handleOpenApplyTemplate = (suggestion: TemplateSuggestion) => {
    setSelectedSuggestion(suggestion);
    setIsApplyModalOpen(true);
  };

  const handleApplyTemplate = async (
    filledSql: string,
    metadata: { matchedTemplate: string }
  ) => {
    setIsApplyingTemplate(true);
    try {
      const response = await fetch(
        `/api/ai/funnel/subquestions/${subQuestion.id.replace("sq-", "")}/sql`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sqlQuery: filledSql,
            sqlMatchedTemplate: metadata.matchedTemplate,
            sqlExplanation: `Template applied: ${metadata.matchedTemplate}`,
            sqlValidationNotes: null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to apply template");
      }

      if (onEditSql) {
        onEditSql(subQuestion.id, filledSql, {
          matchedTemplate: metadata.matchedTemplate,
        });
      }

      setEditedSql(filledSql);
      setLocalMatchedTemplate(metadata.matchedTemplate);
      setIsApplyModalOpen(false);
      setLastExecutionSuccessful(false);
      setQueryResult(null);
      setResultsCleared(true);
      setExpandedSections((prev) => ({ ...prev, template: true }));
      handleSuccess(
        `Template ${metadata.matchedTemplate} applied`,
        "Apply Template"
      );
    } catch (error: any) {
      handleError(error, "Apply Template");
    } finally {
      setIsApplyingTemplate(false);
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
          {onMarkComplete && subQuestion.status !== "completed" && (
            <button
              onClick={handleMarkComplete}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-yellow-500 text-white hover:bg-yellow-600"
              }`}
              title={
                subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                  ? "Mark this sub-question as complete"
                  : "Mark as complete (no SQL query generated yet)"
              }
            >
              ✓{" "}
              {subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                ? "Mark Sub-Question Complete"
                : "Mark Complete (No SQL)"}
            </button>
          )}
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

      {/* SQL Query Section - Improved Layout */}
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
                  : desiredFields.length > 0
                  ? "text-orange-600 hover:text-orange-800 font-medium"
                  : "text-green-600 hover:text-green-800"
              }`}
              title={
                desiredFields.length > 0
                  ? `Generate new SQL query with ${desiredFields.length} additional field(s)`
                  : subQuestion.sqlQuery
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
                <span className="flex items-center space-x-1">
                  <span>🔄</span>
                  <span>
                    {desiredFields.length > 0
                      ? `Regenerate (${desiredFields.length} fields)`
                      : subQuestion.sqlQuery
                      ? "Regenerate"
                      : "Generate"}
                  </span>
                </span>
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
                className="px-3 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-50"
                disabled={isExecuting}
              >
                {isExecuting ? (
                  <span className="flex items-center space-x-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
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
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* SQL Query - Takes up 60% of the space (3/5 columns) */}
            <div className="lg:col-span-3">
              <div className="relative">
                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto font-mono leading-relaxed max-h-48">
                  {subQuestion.sqlQuery
                    ? formatSql(subQuestion.sqlQuery)
                    : "No SQL query generated yet"}
                </pre>
                {subQuestion.sqlQuery && (
                  <div className="absolute top-2 right-2">
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          subQuestion.sqlQuery || ""
                        )
                      }
                      className="text-xs bg-gray-800 text-gray-300 hover:text-white px-2 py-1 rounded opacity-75 hover:opacity-100 transition-opacity"
                      title="Copy SQL to clipboard"
                    >
                      📋 Copy
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* SQL Metadata - Takes up 40% of the space (2/5 columns), side by side */}
            {subQuestion.sqlQuery && (
              <div className="lg:col-span-2 space-y-2">
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

                {/* Matched Template & Suggestions */}
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
                    <span>🏷️ Matched Template & Suggestions</span>
                    <span className="text-gray-400">
                      {expandedSections.template ? "▼" : "▶"}
                    </span>
                  </button>
                  {expandedSections.template && (
                    <div className="space-y-3 border-t border-gray-100 px-3 pb-3 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Current match:</span>{" "}
                        {localMatchedTemplate || "None"}
                      </div>
                      {templatesFeatureAvailable ? (
                        <TemplateSuggestions
                          suggestions={templateSuggestions}
                          loading={suggestionsLoading}
                          error={suggestionsError}
                          onApply={handleOpenApplyTemplate}
                        />
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          Template system disabled.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* Enrichment: AI-first Field Inclusion (Lean MVP) */}
        {templatesFeatureAvailable && (
          <div className="mt-3 rounded border border-dashed border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Promote this SQL to a reusable template</p>
                <p className="text-[11px] text-blue-800">
                  Execute the query, then review the AI-drafted template before saving.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleOpenTemplateReview}
                disabled={
                  !lastExecutionSuccessful || isExtractingTemplate || isExecuting
                }
              >
                {isExtractingTemplate ? "Preparing..." : "Save as Template"}
              </Button>
            </div>
            {!lastExecutionSuccessful && (
              <p className="mt-2 text-[11px] text-blue-700">
                Run the query to enable template capture.
              </p>
            )}
            {templateExtractionError && (
              <p className="mt-2 text-[11px] text-red-600">
                {templateExtractionError}
              </p>
            )}
          </div>
        )}

        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="border border-gray-200 rounded-md">
            <button
              onClick={() =>
                setExpandedSections((prev) => ({
                  ...prev,
                  includeFields: !prev.includeFields,
                }))
              }
              className="w-full px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between"
            >
              <span>Include Fields (AI)</span>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-gray-500">
                  Single-hop only • Max {MAX_FIELDS}
                </span>
                <span className="text-gray-400">
                  {expandedSections.includeFields ? "▼" : "▶"}
                </span>
              </div>
            </button>
            {expandedSections.includeFields && (
              <div className="px-3 pb-3 space-y-3">
                {/* Workflow Status Indicator */}
                {desiredFields.length > 0 && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center space-x-2">
                      <div className="text-yellow-600">⚠️</div>
                      <div className="text-xs text-yellow-800">
                        <strong>Next Steps:</strong> After adding fields, you
                        need to:
                        <ol className="list-decimal ml-4 mt-1 space-y-1">
                          <li>
                            Click "🔄 Regenerate" to create new SQL with these
                            fields
                          </li>
                          <li>Click "Execute" to run the updated query</li>
                          <li>View results with the new fields</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chips */}
                <div className="flex flex-wrap gap-2">
                  {desiredFields.map((f) => (
                    <span
                      key={f}
                      className="text-[11px] bg-blue-100 text-blue-800 px-2 py-1 rounded-full flex items-center gap-1"
                    >
                      {f}
                      <button
                        className="text-blue-700 hover:text-blue-900"
                        onClick={() => {
                          setDesiredFields((prev) =>
                            prev.filter((x) => x !== f)
                          );
                          // Clear results when fields are removed to indicate they need regeneration
                          if (queryResult) {
                            setQueryResult(null);
                            setResultsCleared(true);
                          }
                        }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {desiredFields.length === 0 && (
                    <span className="text-[11px] text-gray-400">
                      No extra fields selected
                    </span>
                  )}
                </div>

                {/* Input + Add */}
                <div className="flex items-center gap-2">
                  <input
                    value={fieldInput}
                    onChange={(e) => setFieldInput(e.target.value)}
                    placeholder="e.g., patient.firstName"
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                  />
                  <button
                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    disabled={desiredFields.length >= MAX_FIELDS}
                    onClick={() => {
                      const candidate = fieldInput.trim();
                      if (!candidate) return;
                      if (!ALLOWED_FIELDS.includes(candidate as AllowedField)) {
                        handleError(
                          new Error(
                            `Field not allowed. Try: ${ALLOWED_FIELDS.join(
                              ", "
                            )}`
                          ),
                          "Add Field"
                        );
                        return;
                      }
                      if (desiredFields.includes(candidate as AllowedField)) {
                        handleError(
                          new Error("Field already added"),
                          "Add Field"
                        );
                        return;
                      }
                      if (desiredFields.length >= MAX_FIELDS) {
                        handleError(
                          new Error(`You can add up to ${MAX_FIELDS} fields`),
                          "Add Field"
                        );
                        return;
                      }
                      setDesiredFields((prev) => [
                        ...prev,
                        candidate as AllowedField,
                      ]);
                      setFieldInput("");
                      // Clear results when fields are added to indicate they need regeneration
                      if (queryResult) {
                        setQueryResult(null);
                        setResultsCleared(true);
                      }
                    }}
                  >
                    Add
                  </button>
                </div>

                {/* Quick picks */}
                <div className="flex flex-wrap gap-2">
                  {ALLOWED_FIELDS.map((f) => (
                    <button
                      key={f}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                        desiredFields.includes(f)
                          ? "bg-blue-100 text-blue-800 border-blue-300"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                      onClick={() => {
                        if (desiredFields.includes(f)) return;
                        if (desiredFields.length >= MAX_FIELDS) {
                          handleError(
                            new Error(`You can add up to ${MAX_FIELDS} fields`),
                            "Add Field"
                          );
                          return;
                        }
                        setDesiredFields((prev) => [...prev, f]);
                        // Clear results when fields are added to indicate they need regeneration
                        if (queryResult) {
                          setQueryResult(null);
                          setResultsCleared(true);
                        }
                      }}
                      title="Quick add"
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {/* Join path preview (read-only) */}
                <div className="bg-gray-50 border border-gray-200 rounded p-2 text-[11px] text-gray-700">
                  <div className="font-semibold mb-1">Join Path (Preview)</div>
                  {desiredFields.length === 0 ? (
                    <div className="text-gray-400">No joins required</div>
                  ) : (
                    <ul className="list-disc ml-4 space-y-1">
                      {desiredFields.some((f) => f.startsWith("patient.")) && (
                        <li>
                          Assessment INNER JOIN rpt.Patient P ON
                          Assessment.patientFk = P.id
                        </li>
                      )}
                      {desiredFields.some((f) => f.startsWith("wound.")) && (
                        <li>
                          Assessment INNER JOIN rpt.Wound W ON
                          Assessment.woundFk = W.id
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data Results Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Results</h3>
            <div className="flex items-center space-x-2">
              {typeof window !== "undefined" &&
                process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true" &&
                subQuestion.sqlQuery && (
                  <button
                    onClick={() => openSaveDialog()}
                    className="px-2.5 py-1 text-xs bg-green-600 text-white rounded"
                    title="Save this sub-question as a reusable insight"
                  >
                    Save Insight
                  </button>
                )}
              {queryResult && queryResult.length > 0 && (
                <>
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
                </>
              )}
            </div>
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
              {/* Results Status Indicator */}
              {desiredFields.length > 0 && (
                <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                  <div className="flex items-center space-x-1">
                    <span>🔄</span>
                    <span>
                      <strong>Results may be outdated.</strong> You've added
                      fields but haven't regenerated SQL yet. Click "🔄
                      Regenerate" to include the new fields in your results.
                    </span>
                  </div>
                </div>
              )}

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
              {resultsCleared
                ? "Results cleared due to SQL changes. Click Execute to run the updated query."
                : subQuestion.sqlQuery
                ? "No results yet. Click Execute to run the query."
                : "No SQL query generated yet. Generate SQL first, then execute to see results."}
            </div>
          ) : null}

          {/* Chart Generation Section */}
          {queryResult && queryResult.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">
                  Chart Visualization
                </h3>
                <div className="flex items-center space-x-2">
                  {/* Manual Chart Generation */}
                  <button
                    onClick={() => setIsChartModalOpen(true)}
                    className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 flex items-center space-x-1"
                    title="Manually create a chart by selecting type and mapping fields"
                  >
                    <span>📊</span>
                    <span>Create Chart</span>
                  </button>
                </div>
              </div>

              {/* Manual Chart Instructions */}
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                <strong>Chart Options:</strong>
                <ul className="mt-1 space-y-1">
                  <li>
                    • <strong>Manual Chart:</strong> Select chart type and map
                    fields yourself
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Manual Chart Generation Modal */}
          <ChartGenerationModal
            isOpen={isChartModalOpen}
            onClose={() => setIsChartModalOpen(false)}
            queryResults={queryResult || []}
            subQuestion={subQuestion.text}
            sql={subQuestion.sqlQuery || undefined}
            assessmentFormId={assessmentFormId}
            canSave={
              typeof window !== "undefined" &&
              process.env.NEXT_PUBLIC_CHART_INSIGHTS_ENABLED === "true"
            }
            onRequestSave={(payload) => {
              openSaveDialog({
                chartType: payload.chartType as ChartType,
                chartMapping: payload.chartMapping,
              });
            }}
          />

          {/* Mark as Complete button below Results */}
          {onMarkComplete && subQuestion.status !== "completed" && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={handleMarkComplete}
                className={`w-full px-4 py-2 text-sm rounded transition-colors flex items-center justify-center space-x-2 ${
                  subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                    ? "bg-green-500 text-white hover:bg-green-600"
                    : "bg-yellow-500 text-white hover:bg-yellow-600"
                }`}
                title={
                  subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                    ? "Mark this sub-question as complete"
                    : "Mark as complete (no SQL query generated yet)"
                }
              >
                <span>✓</span>
                <span>
                  {subQuestion.sqlQuery && subQuestion.sqlQuery.trim() !== ""
                    ? "Mark as Complete"
                    : "Mark Complete (No SQL)"}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
      <TemplateReviewModal
        open={isTemplateReviewOpen}
        onOpenChange={setIsTemplateReviewOpen}
        draft={templateDraft}
        initialValidation={templateValidation}
        initialWarnings={templateWarnings}
        generatingModelId={templateModelId}
        isSaving={isSavingTemplateDraft}
        onSaveDraft={handleSaveTemplateDraft}
      />
      <TemplateApplyModal
        open={isApplyModalOpen}
        onOpenChange={setIsApplyModalOpen}
        template={selectedSuggestion?.template ?? null}
        isApplying={isApplyingTemplate}
        onApply={handleApplyTemplate}
      />
      {isSaveDialogOpen && saveInitial && (
        <SaveInsightDialog
          open={isSaveDialogOpen}
          onClose={() => setIsSaveDialogOpen(false)}
          initial={saveInitial}
          onSaved={() => handleSuccess("Insight saved", "Save Insight")}
        />
      )}
    </div>
  );
};

import React, { useState, useEffect } from "react";
import { FunnelPanel } from "./FunnelPanel";
import type { SubQuestion } from "@/lib/types/funnel";
import { useAIModel } from "@/lib/context/AIModelContext";
import { ModelSelector } from "./ModelSelector";

interface FunnelContainerProps {
  originalQuestion?: string;
  subQuestions?: SubQuestion[];
  assessmentFormDefinition?: any;
  assessmentFormId?: string;
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
}

export const FunnelContainer: React.FC<FunnelContainerProps> = ({
  originalQuestion = "What is the effectiveness of treatments across different wound etiologies over the past year?",
  subQuestions = [],
  assessmentFormDefinition,
  assessmentFormId,
  onEditQuestion,
  onEditSql,
  onExecuteQuery,
  onMarkComplete,
}) => {
  const { selectedModelId } = useAIModel();
  const [currentSubQuestions, setCurrentSubQuestions] =
    useState<SubQuestion[]>(subQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [subQuestionError, setSubQuestionError] = useState<string | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  // Update currentSubQuestions when subQuestions prop changes
  useEffect(() => {
    if (subQuestions && subQuestions.length > 0) {
      console.log("Updating currentSubQuestions from props:", subQuestions);
      setCurrentSubQuestions(subQuestions);
      setCurrentIndex(0);
    }
  }, [subQuestions]);

  // Reset state when component is remounted (key changes)
  useEffect(() => {
    console.log("FunnelContainer mounted/reset");
    setCurrentSubQuestions(subQuestions || []);
    setCurrentIndex(0);
    setSubQuestionError(null);
    setIsLoadingCache(false);
  }, []);

  // Store results per sub-question ID for persistent results across navigation
  const [subQuestionResults, setSubQuestionResults] = useState<
    Record<string, any[]>
  >({});

  // Debug logging for state changes
  useEffect(() => {
    console.log("currentSubQuestions state changed:", currentSubQuestions);
  }, [currentSubQuestions]);

  // Load cached sub-questions on component mount
  useEffect(() => {
    const loadCachedSubQuestions = async () => {
      console.log("loadCachedSubQuestions called with:", {
        originalQuestion,
        assessmentFormId,
        assessmentFormDefinition: !!assessmentFormDefinition,
        selectedModelId,
      });

      if (!originalQuestion || !assessmentFormId) {
        console.log("Missing required parameters:", {
          originalQuestion,
          assessmentFormId,
        });
        if (!assessmentFormId) {
          setSubQuestionError(
            "Assessment form ID is missing. Please go back and select a form."
          );
        }
        return;
      }

      setIsLoadingCache(true);
      setSubQuestionError(null);

      try {
        console.log("Checking for cached sub-questions...");

        const response = await fetch("/api/ai/funnel/generate-subquestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            originalQuestion,
            formDefinition: assessmentFormDefinition || {},
            databaseSchemaContext: "",
            assessmentFormVersionFk: assessmentFormId,
            modelId: selectedModelId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const result = await response.json();

        if (result.subQuestions && result.subQuestions.length > 0) {
          if (result.wasCached) {
            console.log("✅ Found cached sub-questions, loading them...");
            console.log(
              `✅ Loaded ${result.subQuestions.length} cached sub-questions`
            );
          } else {
            console.log("✅ Generated new sub-questions, loading them...");
            console.log(
              `✅ Generated ${result.subQuestions.length} new sub-questions`
            );
          }

          // The caching service now returns the correct SubQuestion format
          setCurrentSubQuestions(result.subQuestions);
          setCurrentIndex(0);
        } else {
          console.log(
            "ℹ️ No sub-questions found or generated, showing empty state"
          );
          // Clear any existing subquestions when no cache is found
          setCurrentSubQuestions([]);
        }
      } catch (error: any) {
        console.error("Error loading cached sub-questions:", error);
        // Don't show error for cache loading - just log it
        // The user can still click "Generate" to create new ones
        // Clear any existing subquestions on error
        setCurrentSubQuestions([]);
      } finally {
        setIsLoadingCache(false);
      }
    };

    loadCachedSubQuestions();
  }, [
    originalQuestion,
    assessmentFormId,
    assessmentFormDefinition,
    selectedModelId,
  ]);

  const handleEditQuestion = (questionId: string, newText: string) => {
    setCurrentSubQuestions((prev) =>
      prev.map((sq) =>
        sq.id === questionId
          ? {
              ...sq,
              text: newText,
              sqlQuery: "", // Clear SQL query when question is edited
              data: [], // Clear data when question is edited
              status: "pending" as const, // Reset status to pending
              lastExecutionDate: undefined, // Clear execution date
            }
          : sq
      )
    );
    onEditQuestion?.(questionId, newText);
  };

  const handleEditSql = (
    questionId: string,
    newSql: string,
    metadata?: {
      explanation?: string;
      validationNotes?: string;
      matchedTemplate?: string;
    }
  ) => {
    setCurrentSubQuestions((prev) =>
      prev.map((sq) =>
        sq.id === questionId
          ? {
              ...sq,
              sqlQuery: newSql,
              sqlExplanation: metadata?.explanation,
              sqlValidationNotes: metadata?.validationNotes,
              sqlMatchedTemplate: metadata?.matchedTemplate,
              data: [], // Clear data when SQL is edited
              status: "pending" as const, // Reset status to pending
              lastExecutionDate: undefined, // Clear execution date
            }
          : sq
      )
    );
    onEditSql?.(questionId, newSql, metadata);
  };

  const handleGenerateSubQuestions = async () => {
    console.log("Button clicked! Starting sub-question regeneration...");
    console.log("assessmentFormId:", assessmentFormId);
    console.log("originalQuestion:", originalQuestion);
    setSubQuestionError(null);

    try {
      console.log("Regenerating sub-questions for:", originalQuestion);

      if (!assessmentFormId) {
        throw new Error(
          "Assessment form ID is required but not provided. Please go back and select a form."
        );
      }

      const requestBody = {
        originalQuestion,
        formDefinition: assessmentFormDefinition || {},
        databaseSchemaContext: "", // TODO: Pass actual schema context
        assessmentFormVersionFk: assessmentFormId,
        modelId: selectedModelId,
      };

      console.log("Request body:", requestBody);

      const response = await fetch("/api/ai/funnel/generate-subquestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const result = await response.json();
      console.log("Sub-questions regenerated:", result);

      // Check if we got an error response
      if (result.error) {
        throw new Error(result.error);
      }

      // The caching service now returns the correct SubQuestion format
      console.log("Setting regenerated sub-questions:", result.subQuestions);
      setCurrentSubQuestions(result.subQuestions);
      setCurrentIndex(0); // Reset to first question
      console.log("Sub-questions regenerated and set:", result.subQuestions);
    } catch (error: any) {
      console.error("Failed to regenerate sub-questions:", error);
      let errorMessage = "Failed to regenerate sub-questions";

      if (error.message) {
        if (error.message.includes("AI returned invalid JSON format")) {
          errorMessage =
            "AI service configuration issue. Please check API key and model settings.";
        } else if (
          error.message.includes("Anthropic API key is not configured")
        ) {
          errorMessage =
            "AI API key not configured. Please set up your Anthropic API key.";
        } else {
          errorMessage = error.message;
        }
      }

      setSubQuestionError(errorMessage);
    }
  };

  const handleExecuteQuery = (questionId: string) => {
    // Mock execution - in real implementation, this would call the API
    setCurrentSubQuestions((prev) =>
      prev.map((sq) =>
        sq.id === questionId
          ? {
              ...sq,
              status: "running" as const,
              lastExecutionDate: new Date(),
            }
          : sq
      )
    );

    // Simulate execution delay
    setTimeout(() => {
      setCurrentSubQuestions((prev) =>
        prev.map((sq) =>
          sq.id === questionId
            ? {
                ...sq,
                status: "completed" as const,
                data: [
                  { treatmentType: "Dressing A", avgHealingTime: 15.2 },
                  { treatmentType: "Dressing B", avgHealingTime: 12.8 },
                  { treatmentType: "Dressing C", avgHealingTime: 18.5 },
                ],
              }
            : sq
        )
      );
    }, 2000);

    onExecuteQuery?.(questionId);
  };

  const handleMarkComplete = (questionId: string) => {
    setCurrentSubQuestions((prev) =>
      prev.map((sq) =>
        sq.id === questionId
          ? {
              ...sq,
              status: "completed" as const,
              lastExecutionDate: new Date(),
            }
          : sq
      )
    );
    onMarkComplete?.(questionId);
  };

  const handleQueryResult = (questionId: string, results: any[]) => {
    setSubQuestionResults((prev) => ({
      ...prev,
      [questionId]: results,
    }));
  };

  const goToNext = () => {
    // Only allow navigation to next if current question is completed
    if (
      currentIndex < currentSubQuestions.length - 1 &&
      currentQuestion?.status === "completed"
    ) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goToPrevious = () => {
    // Always allow going back to review previous questions
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const canNavigateToStep = (stepIndex: number) => {
    // Can always go back to previous steps
    if (stepIndex < currentIndex) return true;

    // Can only go forward if all previous steps are completed
    if (stepIndex > currentIndex) {
      return currentSubQuestions
        .slice(0, stepIndex)
        .every((q) => q.status === "completed");
    }

    return true; // Current step
  };

  const currentQuestion =
    currentSubQuestions.length > 0 ? currentSubQuestions[currentIndex] : null;

  // Collect the SQL from all previous completed steps to provide context for the current step.
  const previousSqlQueries = currentSubQuestions
    .slice(0, currentIndex)
    .map((sq) => sq.sqlQuery || "")
    .filter((sql) => sql.trim() !== "");

  const getStatusColor = (status: SubQuestion["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200";
      case "running":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: SubQuestion["status"]) => {
    switch (status) {
      case "completed":
        return "✓";
      case "running":
        return "⟳";
      case "failed":
        return "✗";
      default:
        return "○";
    }
  };

  console.log(
    "FunnelContainer rendering with currentSubQuestions:",
    currentSubQuestions.length
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Top Section - Original Question */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold text-gray-900">
              Query Funnel
            </h2>
            <ModelSelector />
          </div>
          <p className="text-gray-600 text-sm bg-blue-50 p-3 rounded border-l-4 border-blue-400 mb-4">
            <strong>Original Question:</strong> {originalQuestion}
          </p>
          <div className="flex flex-col items-center space-y-2">
            {isLoadingCache ? (
              <div className="px-6 py-3 rounded-lg bg-blue-100 text-blue-700 text-sm font-medium">
                <span className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  <span>Loading sub-questions...</span>
                </span>
              </div>
            ) : currentSubQuestions.length > 0 ? (
              <button
                onClick={handleGenerateSubQuestions}
                className="px-6 py-3 rounded-lg transition-colors text-sm font-medium shadow-sm bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700"
                title="Regenerate sub-questions to break down the original question"
              >
                <span>🔄 Regenerate Sub-Questions</span>
              </button>
            ) : (
              <div className="px-6 py-3 rounded-lg bg-gray-100 text-gray-600 text-sm font-medium">
                <span className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                  <span>Generating sub-questions...</span>
                </span>
              </div>
            )}

            {subQuestionError && (
              <div className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded border border-red-200 max-w-md text-center">
                ❌ {subQuestionError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle Section - Sub-Questions Overview */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-md font-medium text-gray-700">
              Sub-Questions Overview
            </h3>
            <div className="text-sm text-gray-500">
              {isLoadingCache ? (
                "Loading..."
              ) : currentSubQuestions.length > 0 ? (
                <>
                  {
                    currentSubQuestions.filter(
                      (sq) => sq.status === "completed"
                    ).length
                  }{" "}
                  / {currentSubQuestions.length} completed
                </>
              ) : (
                "No sub-questions yet"
              )}
            </div>
          </div>

          {/* Scrollable sub-questions container */}
          <div className="overflow-x-auto">
            {isLoadingCache ? (
              <div className="flex items-center justify-center min-h-[120px]">
                <div className="text-center text-gray-500">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm font-medium">
                    Loading sub-questions...
                  </p>
                </div>
              </div>
            ) : currentSubQuestions.length > 0 ? (
              <div className="flex space-x-4 pb-2 min-h-[120px]">
                {currentSubQuestions.map((question, index) => (
                  <div
                    key={question.id}
                    onClick={() =>
                      canNavigateToStep(index) && setCurrentIndex(index)
                    }
                    className={`flex-shrink-0 w-80 h-full p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      index === currentIndex
                        ? "border-blue-500 bg-blue-50 shadow-md"
                        : canNavigateToStep(index)
                        ? "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                        : "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                    }`}
                  >
                    <div className="h-full flex flex-col">
                      {/* Header with step number and status */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                              index === currentIndex
                                ? "bg-blue-500 text-white"
                                : question.status === "completed"
                                ? "bg-green-500 text-white"
                                : "bg-gray-300 text-gray-600"
                            }`}
                          >
                            {question.order}
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(
                              question.status
                            )}`}
                          >
                            {getStatusIcon(question.status)} {question.status}
                          </span>
                        </div>
                        {index === currentIndex && (
                          <div className="text-blue-600 text-sm font-medium">
                            Current
                          </div>
                        )}
                      </div>

                      {/* Question text */}
                      <div className="flex-1">
                        <p className="text-sm text-gray-700 line-clamp-4">
                          {question.text}
                        </p>
                      </div>

                      {/* Footer with execution info */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="text-xs text-gray-500">
                          {question.lastExecutionDate ? (
                            <>
                              Last executed:{" "}
                              {question.lastExecutionDate.toLocaleTimeString()}
                            </>
                          ) : (
                            <>Not executed yet</>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center min-h-[120px]">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-sm font-medium">
                    No sub-questions available
                  </p>
                  <p className="text-xs">
                    Sub-questions will be generated automatically
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Current Sub-Question Panel */}
      <div className="flex-1 p-4 bg-white">
        <div className="h-full flex flex-col">
          {/* Navigation Controls */}
          <div className="flex justify-center mb-4 space-x-4">
            <button
              onClick={goToPrevious}
              disabled={currentIndex === 0}
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                currentIndex === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>Previous</span>
            </button>

            {/* Step Indicators */}
            <div className="flex items-center space-x-2">
              {currentSubQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() =>
                    canNavigateToStep(index) && setCurrentIndex(index)
                  }
                  disabled={!canNavigateToStep(index)}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index === currentIndex
                      ? "bg-blue-600"
                      : question.status === "completed"
                      ? "bg-green-500"
                      : canNavigateToStep(index)
                      ? "bg-gray-400 hover:bg-gray-500"
                      : "bg-gray-200 cursor-not-allowed"
                  }`}
                  title={`Step ${index + 1}: ${
                    question.status === "completed"
                      ? "Completed"
                      : canNavigateToStep(index)
                      ? "Available"
                      : "Locked - Complete previous steps first"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={goToNext}
              disabled={
                currentIndex === currentSubQuestions.length - 1 ||
                currentQuestion?.status !== "completed"
              }
              className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                currentIndex === currentSubQuestions.length - 1 ||
                currentQuestion?.status !== "completed"
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
            >
              <span>Next</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* Current Sub-Question Panel */}
          <div className="flex-1">
            {isLoadingCache ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-lg font-medium mb-2">
                    Loading Sub-Questions
                  </p>
                  <p className="text-sm">
                    Please wait while we load or generate your sub-questions...
                  </p>
                </div>
              </div>
            ) : currentSubQuestions.length > 0 && currentQuestion ? (
              <FunnelPanel
                subQuestion={currentQuestion}
                assessmentFormDefinition={assessmentFormDefinition}
                onEditQuestion={handleEditQuestion}
                onEditSql={handleEditSql}
                onExecuteQuery={handleExecuteQuery}
                onMarkComplete={handleMarkComplete}
                onQueryResult={handleQueryResult}
                initialResults={subQuestionResults[currentQuestion.id] || null}
                previousSqlQueries={previousSqlQueries}
                selectedModelId={selectedModelId}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-4">📋</div>
                  <p className="text-lg font-medium mb-2">Ready to Start</p>
                  <p className="text-sm mb-4">
                    Sub-questions will be generated automatically
                  </p>
                  <div className="text-xs text-gray-400">
                    <p>1. Sub-questions are being generated automatically</p>
                    <p>2. Review and edit the generated sub-questions</p>
                    <p>3. Generate SQL queries for each step</p>
                    <p>4. Execute queries and view results</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

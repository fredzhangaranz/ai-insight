"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowPathIcon,
  BeakerIcon,
  CpuChipIcon,
  DocumentDuplicateIcon,
  SparklesIcon,
  TrashIcon,
  UserIcon,
} from "@/components/heroicons";
import { ChartComponent, type ChartDataType } from "./charts/chart-component";
import { LoadingDots } from "./loading-dots";
import { CodeBlock } from "./code-block";
import { DataTable } from "./data-table";
import { FormFieldDisplay } from "./form-field-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PatientSelectionDialog } from "./patient-selection-dialog";
import FunnelTestPage from "../funnel-test/page";
import ReactMarkdown from "react-markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChartType, TableData } from "@/lib/chart-contracts";
import { shapeDataForChart } from "@/lib/data-shaper";
import { ModelSelector } from "@/components/funnel/ModelSelector";
import { useAIModel } from "@/lib/context/AIModelContext";

// --- TYPE DEFINITIONS ---
type FormField = { fieldtype: string; options: string[] };
type AssessmentFormDefinition = { [key: string]: FormField };
type InsightQuestion = {
  text: string;
  type: "single-patient" | "all-patient";
  isCustom?: boolean;
  originalQuestionId?: string | null;
  id?: number;
};
type InsightCategory = { category: string; questions: InsightQuestion[] };
type InsightsResponse = { insights: InsightCategory[] };

interface AnalysisPageProps {
  assessmentFormId: string; // Version-specific ID
  assessmentTypeId: string; // Type ID for patient listing
  assessmentFormName: string;
  onBack: () => void;
}

type AnalysisState =
  | "loading"
  | "initial"
  | "insights"
  | "generatingSql" // Loading after question selected
  | "sqlGenerated" // SQL + Explanation are shown
  | "fetchingData" // Loading after "Fetch Data" clicked
  | "results" // Final chart is shown
  | "funnel" // New funnel workflow state
  | "error";

export default function AnalysisPage({
  assessmentFormId,
  assessmentTypeId,
  assessmentFormName,
  onBack,
}: AnalysisPageProps) {
  const { hasConfiguredModels } = useAIModel();

  const [state, setState] = useState<AnalysisState>("loading");
  const [definition, setDefinition] = useState<AssessmentFormDefinition | null>(
    null
  );
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // State for the patient selection dialog
  const [isPatientDialogOpen, setIsPatientDialogOpen] = useState(false);
  const [currentQuestion, setCurrentQuestion] =
    useState<InsightQuestion | null>(null);
  const [currentPatientId, setCurrentPatientId] = useState<string | null>(null);

  // State for the multi-step result flow
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null); // For API 2.3
  const [recommendedChartType, setRecommendedChartType] = useState<
    string | null
  >(null);
  // Use the ChartDataType from ChartComponentProps
  const [chartData, setChartData] = useState<ChartDataType | null>(null);
  const [tableData, setTableData] = useState<TableData["rows"] | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<ChartType>("bar");
  const [availableMappings, setAvailableMappings] = useState<
    Record<string, any>
  >({});

  // State for custom questions
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showAddQuestionForm, setShowAddQuestionForm] = useState<string | null>(
    null
  );
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<
    "single-patient" | "all-patient"
  >("all-patient");
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  // State for editing questions
  const [editingQuestion, setEditingQuestion] = useState<{
    id: number;
    text: string;
    type: "single-patient" | "all-patient";
    originalQuestionId?: string | null;
    isAIQuestion?: boolean;
    category?: string;
  } | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editQuestionType, setEditQuestionType] = useState<
    "single-patient" | "all-patient"
  >("all-patient");
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);

  // State for deleting questions
  const [deletingQuestion, setDeletingQuestion] = useState<{
    id: number;
    text: string;
    isAIQuestion: boolean;
  } | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  // Handle chart type changes
  const handleChartTypeChange = (value: ChartType) => {
    console.log("Changing chart type to:", value);
    setSelectedChartType(value);

    // If we have raw data, reshape it for the new chart type
    if (tableData && availableMappings[value]) {
      try {
        const shapedData = shapeDataForChart(
          tableData,
          {
            chartType: value,
            mapping: availableMappings[value],
          },
          value
        );
        setChartData(shapedData);
      } catch (err: any) {
        console.error("Failed to reshape data:", err);
        setErrorMessage(
          `Failed to display data as ${value} chart: ${err.message}`
        );
      }
    }
  };

  const fetchData = async (regenerate = false) => {
    setState("loading");
    setErrorMessage(null);
    try {
      const defPromise = fetch(
        `/api/assessment-forms/${assessmentFormId}/definition`
      );
      const insightsUrl = `/api/assessment-forms/${assessmentFormId}/insights${
        regenerate ? "?regenerate=true" : ""
      }`;
      const insightsPromise = fetch(insightsUrl);
      const [defResponse, insightsResponse] = await Promise.all([
        defPromise,
        insightsPromise,
      ]);

      if (!defResponse.ok) throw new Error("Failed to fetch form definition.");
      setDefinition(await defResponse.json());

      if (insightsResponse.status === 204) {
        setInsights(null);
        setState("initial");
      } else if (insightsResponse.ok) {
        setInsights(await insightsResponse.json());
        setState("insights");
      } else {
        const errorData = await insightsResponse.json();
        throw new Error(errorData.message || "Failed to get insights.");
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    }
  };

  useEffect(() => {
    fetchData(false);
  }, [assessmentFormId]);

  const handleQuestionSelect = (question: InsightQuestion) => {
    console.log("Question selected:", question);
    console.log("assessmentFormId:", assessmentFormId);
    setCurrentQuestion(question);
    setCurrentPatientId(null); // Reset patient ID on new question

    if (question.type === "single-patient") {
      // For patient-specific questions, show patient selection dialog
      setIsPatientDialogOpen(true);
    } else {
      // For non-patient questions, go directly to funnel workflow
      setState("funnel");
    }
  };

  const handlePatientSelectedAndExecute = (patientId: string) => {
    setIsPatientDialogOpen(false);
    setCurrentPatientId(patientId); // Store for potential re-runs or display
    // Navigate to funnel workflow instead of executing query directly
    setState("funnel");
  };

  // --- NEW HANDLERS FOR MULTI-STEP FLOW ---
  const handleGenerateSqlAndExplanation = async (
    question: InsightQuestion,
    patientId?: string | null,
    regenerate = false
  ) => {
    setState("generatingSql");
    setErrorMessage(null);
    if (!definition) {
      setErrorMessage("Form definition is not loaded. Cannot generate query.");
      setState("error");
      return;
    }

    try {
      const requestBody: {
        assessmentFormId: string;
        assessmentFormDefinition: AssessmentFormDefinition;
        question: string;
        patientId?: string;
        regenerate: boolean;
      } = {
        assessmentFormId,
        assessmentFormDefinition: definition,
        question: question.text,
        regenerate,
      };

      if (patientId) {
        requestBody.patientId = patientId;
      }

      const response = await fetch("/api/ai/generate-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to generate analysis plan."
        );
      }

      const data = await response.json();
      setGeneratedSql(data.generatedSql);
      setExplanation(data.explanation);
      setRecommendedChartType(data.recommendedChartType);
      setAvailableMappings(data.availableMappings);

      // Set the initial chart type to the AI's recommendation
      if (
        data.recommendedChartType &&
        data.availableMappings[data.recommendedChartType]
      ) {
        setSelectedChartType(data.recommendedChartType);
      }

      setState("sqlGenerated");
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    }
  };

  const executeQuery = async (patientId?: string) => {
    if (!generatedSql) {
      setErrorMessage("No SQL query has been generated to execute.");
      setState("error");
      return;
    }

    setState("fetchingData");
    setErrorMessage(null);

    try {
      // Execute the query
      const response = await fetch("/api/ai/execute-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: generatedSql,
          params: patientId ? { patientId } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to execute query.");
      }

      const { data } = await response.json(); // Extract data from response

      // Shape the data according to the selected chart type and available mappings
      if (selectedChartType === "table") {
        // For table type, use raw data directly
        setTableData(data);
        setChartData(data);
      } else {
        // For other chart types, use the data shaper
        const mapping = availableMappings[selectedChartType];
        if (!mapping) {
          throw new Error(
            `No mapping available for chart type: ${selectedChartType}`
          );
        }

        const shapedData = shapeDataForChart(
          data, // Use extracted data
          {
            chartType: selectedChartType,
            mapping: mapping,
          },
          selectedChartType
        );

        setChartData(shapedData);
        // Also set table data for raw data view
        setTableData(data);
      }

      setState("results");
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    }
  };

  const handleFetchChartData = () => {
    if (currentQuestion?.type === "single-patient") {
      setIsPatientDialogOpen(true);
    } else {
      executeQuery();
    }
  };

  const handleResetToInsights = () => {
    setState("insights");
    setCurrentQuestion(null);
    setCurrentPatientId(null);
    setGeneratedSql(null);
    setExplanation(null);
    setChartData(null);
    setTableData(null);
    setRecommendedChartType(null);
  };

  // Handle custom question functionality
  const handleAddQuestionClick = (category: string) => {
    setShowAddQuestionForm(category);
    setNewQuestionText("");
    setNewQuestionType("all-patient");
  };

  const handleCancelAddQuestion = () => {
    setShowAddQuestionForm(null);
    setNewQuestionText("");
    setNewQuestionType("all-patient");
  };

  const handleSaveCustomQuestion = async (category: string) => {
    if (!newQuestionText.trim()) {
      return;
    }

    setIsAddingQuestion(true);
    try {
      const response = await fetch(
        `/api/assessment-forms/${assessmentFormId}/custom-questions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category,
            questionText: newQuestionText.trim(),
            questionType: newQuestionType,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to add custom question.");
      }

      // Refresh insights to include the new custom question (without regenerating AI insights)
      await fetchData(false);

      // Reset form
      setShowAddQuestionForm(null);
      setNewQuestionText("");
      setNewQuestionType("all-patient");
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    } finally {
      setIsAddingQuestion(false);
    }
  };

  // Handle editing questions
  const handleEditQuestionClick = (
    question: InsightQuestion,
    questionIndex: number,
    category: string
  ) => {
    // For AI questions, we'll create a new custom question entry
    // For custom questions, we'll update the existing entry
    // isCustom is optional, so we need to check if it's explicitly true
    const isAIQuestion = question.isCustom !== true;

    console.log("Editing question:", {
      text: question.text,
      isCustom: question.isCustom,
      id: question.id,
      type: question.type,
      originalQuestionId: question.originalQuestionId,
      isAIQuestion: isAIQuestion,
    });

    setEditingQuestion({
      id: question.id || 0, // 0 for AI questions that don't have DB ID yet
      text: question.text,
      type: question.type,
      originalQuestionId: isAIQuestion
        ? `ai-question-${questionIndex}`
        : question.originalQuestionId,
      isAIQuestion, // Track if this is an AI question being edited
      category, // Store the category for AI questions
    });
    setEditQuestionText(question.text);
    setEditQuestionType(question.type);
  };

  const handleCancelEditQuestion = () => {
    setEditingQuestion(null);
    setEditQuestionText("");
    setEditQuestionType("all-patient");
  };

  const handleSaveEditQuestion = async () => {
    if (!editingQuestion || !editQuestionText.trim()) {
      return;
    }

    console.log("Saving edited question:", {
      id: editingQuestion.id,
      isAIQuestion: editingQuestion.isAIQuestion,
      text: editQuestionText.trim(),
      type: editQuestionType,
    });

    setIsEditingQuestion(true);
    try {
      let response;

      // Double-check the logic: if we have a valid ID and it's not an AI question, update existing
      if (
        editingQuestion.isAIQuestion ||
        !editingQuestion.id ||
        editingQuestion.id === 0
      ) {
        console.log(
          "Creating new custom question (AI question or no valid ID)"
        );
        // For AI questions, create a new custom question entry
        response = await fetch(
          `/api/assessment-forms/${assessmentFormId}/custom-questions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              category: editingQuestion.category || "",
              questionText: editQuestionText.trim(),
              questionType: editQuestionType,
              originalQuestionId: editingQuestion.originalQuestionId,
            }),
          }
        );
      } else {
        console.log(
          "Updating existing custom question with ID:",
          editingQuestion.id
        );
        // For custom questions, update the existing entry
        response = await fetch(
          `/api/assessment-forms/${assessmentFormId}/custom-questions/${editingQuestion.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              questionText: editQuestionText.trim(),
              questionType: editQuestionType,
            }),
          }
        );
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save edited question.");
      }

      // Refresh insights to include the edited question
      // The cache was updated with the new custom question, so we can load from cache
      await fetchData(false);

      // Reset edit state
      setEditingQuestion(null);
      setEditQuestionText("");
      setEditQuestionType("all-patient");
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    } finally {
      setIsEditingQuestion(false);
    }
  };

  // Handle deleting questions
  const handleDeleteQuestionClick = (
    question: InsightQuestion,
    questionIndex: number,
    category: string
  ) => {
    // For AI questions, we can't delete them from the database, but we can hide them from the UI
    // For custom questions, we can delete them from the database
    const isAIQuestion = question.isCustom !== true;

    setDeletingQuestion({
      id: question.id || 0,
      text: question.text,
      isAIQuestion,
    });
  };

  const handleCancelDeleteQuestion = () => {
    setDeletingQuestion(null);
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!deletingQuestion) {
      return;
    }

    setIsDeletingQuestion(true);
    try {
      if (deletingQuestion.isAIQuestion) {
        // For AI questions, we can't delete them from the database
        // Instead, we'll create a custom question that marks this AI question as "deleted"
        // This is a workaround since we can't modify the AI-generated insights directly
        console.log("AI questions cannot be deleted from the database");
        // For now, we'll just show a message that AI questions can't be deleted
        setErrorMessage(
          "AI-generated questions cannot be deleted. You can edit them to create custom versions."
        );
        setState("error");
      } else {
        // For custom questions, delete from database
        const response = await fetch(
          `/api/assessment-forms/${assessmentFormId}/custom-questions/${deletingQuestion.id}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to delete question.");
        }

        // Refresh insights to reflect the deleted question
        await fetchData(false);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setState("error");
    } finally {
      setIsDeletingQuestion(false);
      setDeletingQuestion(null);
    }
  };

  const renderLoadingState = (title: string, subtitle: string) => (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-8 text-center">
        <LoadingDots />
        <h3 className="text-xl font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-slate-600">{subtitle}</p>
      </CardContent>
    </Card>
  );

  const renderRightPanelContent = () => {
    switch (state) {
      case "loading":
        return renderLoadingState(
          "Fetching Analysis Data...",
          "Please wait while we load the form definition and insights."
        );
      case "generatingSql":
        return renderLoadingState(
          "Generating SQL...",
          "The AI is analyzing your question and preparing a query plan."
        );
      case "fetchingData":
        return renderLoadingState(
          "Fetching Data...",
          "Executing the SQL query and retrieving the results from the database."
        );
      case "initial":
        return (
          <div className="space-y-6">
            {/* Model Selector */}
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">
                  AI Model Selection
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Choose which AI model to use for generating insights
                </p>
              </CardHeader>
              <CardContent>
                <ModelSelector />
              </CardContent>
            </Card>

            {/* No Insights Card */}
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-8 text-center">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <SparklesIcon className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">
                    No Insights Found
                  </h3>
                  <p className="text-slate-600">
                    Click to generate AI-powered insights for this form.
                  </p>
                </div>
                <Button
                  onClick={() => fetchData(true)}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!hasConfiguredModels}
                >
                  <SparklesIcon className="w-5 h-5 mr-2" />
                  {hasConfiguredModels
                    ? "Analyze with AI"
                    : "Configure AI Models First"}
                </Button>
                {!hasConfiguredModels && (
                  <p className="text-sm text-red-600 mt-2">
                    No AI models are configured. Please configure at least one
                    model in the admin panel.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        );
      case "insights":
        return (
          insights && (
            <div className="space-y-6">
              {/* Model Selector */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">
                    AI Model Selection
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    Choose which AI model to use for generating insights
                  </p>
                </CardHeader>
                <CardContent>
                  <ModelSelector />
                </CardContent>
              </Card>

              {/* Insights Card */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle className="text-xl text-slate-900">
                        AI-Generated Insights
                      </CardTitle>
                      <p className="text-slate-600 text-sm">
                        Select a question to explore your data
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchData(true)}
                      disabled={!hasConfiguredModels}
                    >
                      <ArrowPathIcon className="w-4 h-4 mr-2" />
                      Regenerate
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion
                    type="single"
                    collapsible
                    className="space-y-2"
                    value={expandedCategory || undefined}
                    onValueChange={setExpandedCategory}
                  >
                    {insights.insights.map((cat, index) => (
                      <AccordionItem
                        key={index}
                        value={cat.category}
                        className="border border-slate-200 rounded-lg px-4"
                      >
                        <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                          {cat.category}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          {cat.questions.map((question, qIndex) => (
                            <div
                              key={qIndex}
                              className="p-3 rounded-lg bg-slate-50 hover:bg-blue-50 flex items-center justify-between"
                            >
                              <div
                                className="flex-1 cursor-pointer"
                                onClick={() => handleQuestionSelect(question)}
                              >
                                <p className="text-slate-700 hover:text-blue-700 font-medium">
                                  {question.text}
                                </p>
                              </div>
                              <div className="flex items-center space-x-2 ml-4">
                                {question.type === "single-patient" && (
                                  <UserIcon className="w-5 h-5 text-slate-400" />
                                )}
                                {/* Custom/Modified question indicator */}
                                {question.isCustom && (
                                  <div className="flex items-center space-x-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                                    <SparklesIcon className="w-3 h-3" />
                                    <span>
                                      {question.originalQuestionId
                                        ? "Modified"
                                        : "Custom"}
                                    </span>
                                  </div>
                                )}
                                {/* Edit button - for all questions */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditQuestionClick(
                                      question,
                                      qIndex,
                                      cat.category
                                    );
                                  }}
                                  className="text-slate-400 hover:text-slate-600"
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
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </Button>
                                {/* Delete button - for all questions */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteQuestionClick(
                                      question,
                                      qIndex,
                                      cat.category
                                    );
                                  }}
                                  className="text-red-400 hover:text-red-600"
                                  title={
                                    question.isCustom
                                      ? "Delete custom question"
                                      : "AI questions cannot be deleted"
                                  }
                                >
                                  <TrashIcon className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}

                          {/* Add your own question button */}
                          <div className="pt-2 border-t border-slate-200">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleAddQuestionClick(cat.category)
                              }
                              className="w-full text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300 bg-blue-50 hover:bg-blue-100"
                            >
                              <SparklesIcon className="w-4 h-4 mr-2" />
                              Add your own question
                            </Button>
                          </div>

                          {/* Add question form */}
                          {showAddQuestionForm === cat.category && (
                            <div className="mt-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="space-y-3">
                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Your Question
                                  </label>
                                  <textarea
                                    value={newQuestionText}
                                    onChange={(e) =>
                                      setNewQuestionText(e.target.value)
                                    }
                                    placeholder="Enter your custom question..."
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    rows={3}
                                  />
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Question Type
                                  </label>
                                  <select
                                    value={newQuestionType}
                                    onChange={(e) =>
                                      setNewQuestionType(
                                        e.target.value as
                                          | "single-patient"
                                          | "all-patient"
                                      )
                                    }
                                    className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  >
                                    <option value="all-patient">
                                      All Patients
                                    </option>
                                    <option value="single-patient">
                                      Single Patient
                                    </option>
                                  </select>
                                </div>

                                <div className="flex space-x-2">
                                  <Button
                                    onClick={() =>
                                      handleSaveCustomQuestion(cat.category)
                                    }
                                    disabled={
                                      !newQuestionText.trim() ||
                                      isAddingQuestion
                                    }
                                    size="sm"
                                    className="bg-blue-600 hover:bg-blue-700 text-white"
                                  >
                                    {isAddingQuestion
                                      ? "Saving..."
                                      : "Save Question"}
                                  </Button>
                                  <Button
                                    onClick={handleCancelAddQuestion}
                                    variant="outline"
                                    size="sm"
                                    disabled={isAddingQuestion}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>

                  {/* Edit question form */}
                  {editingQuestion && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">
                          Edit Question
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Question Text
                            </label>
                            <textarea
                              value={editQuestionText}
                              onChange={(e) =>
                                setEditQuestionText(e.target.value)
                              }
                              className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              rows={3}
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Question Type
                            </label>
                            <select
                              value={editQuestionType}
                              onChange={(e) =>
                                setEditQuestionType(
                                  e.target.value as
                                    | "single-patient"
                                    | "all-patient"
                                )
                              }
                              className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="all-patient">All Patients</option>
                              <option value="single-patient">
                                Single Patient
                              </option>
                            </select>
                          </div>

                          <div className="flex space-x-2 pt-4">
                            <Button
                              onClick={handleSaveEditQuestion}
                              disabled={
                                !editQuestionText.trim() || isEditingQuestion
                              }
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                              {isEditingQuestion ? "Saving..." : "Save Changes"}
                            </Button>
                            <Button
                              onClick={handleCancelEditQuestion}
                              variant="outline"
                              disabled={isEditingQuestion}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Delete question confirmation modal */}
                  {deletingQuestion && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold mb-4">
                          {deletingQuestion.isAIQuestion
                            ? "Cannot Delete AI Question"
                            : "Delete Question"}
                        </h3>
                        <div className="space-y-4">
                          {deletingQuestion.isAIQuestion ? (
                            <div>
                              <p className="text-slate-600 mb-4">
                                AI-generated questions cannot be deleted from
                                the database. However, you can:
                              </p>
                              <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                                <li>
                                  Edit the question to create a custom version
                                </li>
                                <li>
                                  Regenerate all insights to get different AI
                                  questions
                                </li>
                              </ul>
                            </div>
                          ) : (
                            <div>
                              <p className="text-slate-600 mb-4">
                                Are you sure you want to delete this custom
                                question?
                              </p>
                              <p className="text-sm font-medium text-slate-700 bg-slate-50 p-3 rounded">
                                &ldquo;{deletingQuestion.text}&rdquo;
                              </p>
                              <p className="text-xs text-slate-500 mt-2">
                                This action cannot be undone.
                              </p>
                            </div>
                          )}

                          <div className="flex space-x-2 pt-4">
                            {!deletingQuestion.isAIQuestion && (
                              <Button
                                onClick={handleConfirmDeleteQuestion}
                                disabled={isDeletingQuestion}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                {isDeletingQuestion
                                  ? "Deleting..."
                                  : "Delete Question"}
                              </Button>
                            )}
                            <Button
                              onClick={handleCancelDeleteQuestion}
                              variant="outline"
                              disabled={isDeletingQuestion}
                            >
                              {deletingQuestion.isAIQuestion
                                ? "Close"
                                : "Cancel"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        );
      case "sqlGenerated":
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-start space-x-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <BeakerIcon className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <CardTitle className="text-xl text-slate-900">
                    AI Query Plan
                  </CardTitle>
                  <p className="text-slate-600 text-sm">
                    The AI has generated a plan to answer your question. Review
                    the explanation and SQL before fetching the data.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="prose prose-slate max-w-none prose-h3:mb-2 prose-h3:mt-4 prose-p:my-1">
                  {explanation && <ReactMarkdown>{explanation}</ReactMarkdown>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-sky-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CpuChipIcon className="w-7 h-7 text-sky-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900">
                      Generated SQL
                    </CardTitle>
                    <p className="text-slate-600 text-sm">
                      This query will be executed against the database.
                    </p>
                  </div>
                </div>
                {generatedSql && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(generatedSql)}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                    Copy SQL
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {generatedSql && <CodeBlock code={generatedSql} />}
              </CardContent>
            </Card>

            <div className="flex justify-between items-center pt-4">
              <Button variant="ghost" onClick={handleResetToInsights}>
                ← Ask a different question
              </Button>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    currentQuestion &&
                    handleGenerateSqlAndExplanation(
                      currentQuestion,
                      currentPatientId,
                      true
                    )
                  }
                >
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Regenerate Plan
                </Button>
                <Button
                  size="lg"
                  onClick={handleFetchChartData}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Fetch Data & Generate Chart
                </Button>
              </div>
            </div>
          </div>
        );
      case "error":
        return (
          <Alert variant="destructive">
            <AlertTitle>An Error Occurred</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        );
      default:
        return null;
    }
  };

  // If we're in funnel state, render the funnel page as full page
  if (state === "funnel") {
    return (
      <FunnelTestPage
        onBack={() => setState("insights")}
        originalQuestion={currentQuestion?.text || ""}
        assessmentFormDefinition={definition}
        assessmentFormId={assessmentFormId}
        patientId={currentPatientId}
      />
    );
  }

  return (
    <>
      {currentQuestion && (
        <PatientSelectionDialog
          isOpen={isPatientDialogOpen}
          onClose={() => setIsPatientDialogOpen(false)}
          assessmentFormId={assessmentFormId}
          assessmentTypeId={assessmentTypeId}
          onPatientSelect={handlePatientSelectedAndExecute}
          question={currentQuestion.text}
        />
      )}
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-[1920px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header with Breadcrumb and Page Title */}
          <div className="mb-8">
            <Button
              variant="ghost"
              onClick={onBack}
              className="mb-4 text-slate-600 hover:text-slate-900"
            >
              ← Back to Forms
            </Button>
            <div className="border-b border-slate-200 pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <nav className="flex text-sm text-slate-500 mb-2">
                    <span>Analysis</span>
                    <span className="mx-2">/</span>
                    <span className="text-slate-900 font-medium">
                      {assessmentFormName}
                    </span>
                  </nav>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
                    {state === "results" && currentQuestion
                      ? currentQuestion.text
                      : `${assessmentFormName} Analysis`}
                  </h1>
                  <p className="text-slate-600 mt-1">
                    {state === "results"
                      ? `Analysis results based on ${assessmentFormName} data`
                      : "Generate AI-powered insights from your clinical data"}
                  </p>
                </div>
                <div className="mt-4 sm:mt-0">
                  <div className="text-sm text-slate-500">
                    Form ID:{" "}
                    <span className="font-mono text-xs">
                      {assessmentFormId}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {state === "results" ? (
            // This block will now be the final step of your new flow
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* The final chart, rendered with real data */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-xl text-slate-900">
                    Data Visualization
                  </CardTitle>
                  <Select
                    value={selectedChartType}
                    onValueChange={handleChartTypeChange}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Select chart type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(availableMappings).map((type) => (
                        <SelectItem key={type} value={type as ChartType}>
                          {type.charAt(0).toUpperCase() + type.slice(1)} Chart
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  {chartData ? (
                    <div className="h-[300px] sm:h-[400px] lg:h-[450px]">
                      <ChartComponent
                        chartType={selectedChartType}
                        data={chartData}
                        title={currentQuestion?.text}
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[300px] sm:h-[400px] text-slate-500">
                      No data available
                    </div>
                  )}
                </CardContent>
              </Card>
              <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-6">
                {/* The verified SQL query */}
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-lg text-slate-900">
                      Generated SQL
                    </CardTitle>
                    {generatedSql && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          navigator.clipboard.writeText(generatedSql)
                        }
                        className="text-slate-600 hover:text-slate-900"
                      >
                        <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                        Copy SQL
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {generatedSql && <CodeBlock code={generatedSql} />}
                  </CardContent>
                </Card>
                {/* The raw data table */}
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-slate-900">
                      Raw Data
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tableData && <DataTable data={tableData} />}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="flex flex-col xl:grid xl:grid-cols-2 gap-6 xl:gap-8">
              {/* Form Definition Panel - Full width on mobile/tablet, left side on desktop */}
              <div className="order-2 xl:order-1">
                <Card className="border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg xl:text-xl text-slate-900 flex items-center">
                      <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                      Form Definition
                    </CardTitle>
                    <p className="text-sm text-slate-600">
                      Available fields in {assessmentFormName}
                    </p>
                  </CardHeader>
                  <CardContent>
                    {definition ? (
                      <div className="space-y-3 max-h-[28rem] xl:max-h-[32rem] overflow-y-auto">
                        {Object.entries(definition).map(
                          ([fieldName, fieldData]) => (
                            <FormFieldDisplay
                              key={fieldName}
                              fieldName={fieldName}
                              fieldType={fieldData.fieldtype}
                              options={fieldData.options}
                            />
                          )
                        )}
                      </div>
                    ) : (
                      <div className="text-center p-6">
                        <LoadingDots />
                        <p className="text-sm text-slate-600 mt-2">
                          Loading form definition...
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Insights Panel - Full width on mobile/tablet, right side on desktop */}
              <div className="order-1 xl:order-2">
                <div className="space-y-6">{renderRightPanelContent()}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

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
  SparklesIcon,
  DocumentDuplicateIcon,
  ArrowPathIcon,
  UserIcon,
} from "@/components/heroicons";
import { ChartComponent } from "./chart-component";
import { LoadingDots } from "./loading-dots";
import { CodeBlock } from "./code-block";
import { DataTable } from "./data-table";
import { FormFieldDisplay } from "./form-field-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PatientSelectionDialog } from "./patient-selection-dialog";

// --- TYPE DEFINITIONS ---
type FormField = { fieldtype: string; options: string[] };
type AssessmentFormDefinition = { [key: string]: FormField };
type InsightQuestion = { text: string; type: "single-patient" | "all-patient" };
type InsightCategory = { category: string; questions: InsightQuestion[] };
type InsightsResponse = { insights: InsightCategory[] };

interface AnalysisPageProps {
  assessmentFormId: string;
  assessmentFormName: string;
  onBack: () => void;
}

type AnalysisState = "loading" | "initial" | "insights" | "results" | "error";

// Mock data for the final results page
const mockChartData = [
  { name: "Diabetic", value: 145, percentage: 35 },
  { name: "Pressure Ulcer: Stage 2", value: 98, percentage: 24 },
];
const mockSqlQuery = `SELECT etiology, COUNT(*) as count FROM wound_assessments GROUP BY etiology;`;
const mockTableData = [
  { etiology: "Diabetic", count: 145 },
  { etiology: "Pressure Ulcer: Stage 2", count: 98 },
];

export default function AnalysisPage({
  assessmentFormId,
  assessmentFormName,
  onBack,
}: AnalysisPageProps) {
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
    setCurrentQuestion(question);
    if (question.type === "single-patient") {
      setIsPatientDialogOpen(true);
    } else {
      // For now, all-patient questions go directly to mock results
      setState("results");
    }
  };

  const handleGenerateChartForPatient = (patientId: string) => {
    console.log(
      "Generating chart for patient:",
      patientId,
      "and question:",
      currentQuestion?.text
    );
    setIsPatientDialogOpen(false);
    // This is where you would call API 2.2 with the patientId
    setState("results");
  };

  const renderRightPanelContent = () => {
    switch (state) {
      case "loading":
        return (
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-8 text-center">
              <LoadingDots />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                Fetching Analysis Data...
              </h3>
            </CardContent>
          </Card>
        );
      case "initial":
        return (
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
              >
                <SparklesIcon className="w-5 h-5 mr-2" />
                Analyze with AI
              </Button>
            </CardContent>
          </Card>
        );
      case "insights":
        return (
          insights && (
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
                  >
                    <ArrowPathIcon className="w-4 h-4 mr-2" />
                    Regenerate
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="space-y-2">
                  {insights.insights.map((cat, index) => (
                    <AccordionItem
                      key={index}
                      value={`item-${index}`}
                      className="border border-slate-200 rounded-lg px-4"
                    >
                      <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                        {cat.category}
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pt-2">
                        {cat.questions.map((question, qIndex) => (
                          <div
                            key={qIndex}
                            onClick={() => handleQuestionSelect(question)}
                            className="p-3 rounded-lg bg-slate-50 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                          >
                            <p className="text-slate-700 hover:text-blue-700 font-medium flex-1">
                              {question.text}
                            </p>
                            {question.type === "single-patient" && (
                              <UserIcon className="w-5 h-5 text-slate-400 ml-4" />
                            )}
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )
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

  return (
    <>
      {currentQuestion && (
        <PatientSelectionDialog
          isOpen={isPatientDialogOpen}
          onClose={() => setIsPatientDialogOpen(false)}
          assessmentFormId={assessmentFormId}
          onPatientSelect={handleGenerateChartForPatient}
          question={currentQuestion.text}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <Button
          variant="ghost"
          onClick={onBack}
          className="mb-6 text-slate-600 hover:text-slate-900"
        >
          ← Back to Forms
        </Button>
        {state === "results" ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                {currentQuestion?.text}
              </h1>
              <p className="text-slate-600">
                Analysis based on {assessmentFormName} data
              </p>
            </div>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">
                  Most Common Wound Etiologies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartComponent data={mockChartData} />
              </CardContent>
            </Card>
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg text-slate-900">
                    Generated SQL
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(mockSqlQuery)}
                    className="text-slate-600 hover:text-slate-900"
                  >
                    <DocumentDuplicateIcon className="w-4 h-4 mr-2" />
                    Copy SQL
                  </Button>
                </CardHeader>
                <CardContent>
                  <CodeBlock code={mockSqlQuery} />
                </CardContent>
              </Card>
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">
                    Raw Data
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable data={mockTableData} />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-8">
            <Card className="border-slate-200 bg-slate-50/50 h-fit">
              <CardHeader>
                <CardTitle className="text-xl text-slate-900">
                  {assessmentFormName} Definition
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Form fields available for analysis
                </p>
              </CardHeader>
              <CardContent>
                {definition ? (
                  <div className="space-y-3 max-h-[32rem] overflow-y-auto">
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
            <div className="space-y-6">{renderRightPanelContent()}</div>
          </div>
        )}
      </div>
    </>
  );
}

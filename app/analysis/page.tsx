"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AnalysisPage from "../components/analysis-page";
import { LoadingDots } from "../components/loading-dots";
import { useLLMConfig } from "@/lib/hooks/use-llm-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SparklesIcon } from "@/components/heroicons";

// Define a type for our assessment form data
type AssessmentForm = {
  assessmentFormId: string; // Version-specific ID
  assessmentTypeId: string; // Type ID for patient listing
  assessmentFormName: string;
  definitionVersion: string;
};

// Define a type for the selected form state
type SelectedForm = {
  id: string;
  typeId: string;
  name: string;
};

export default function AnalysisRoutePage() {
  const router = useRouter();
  const { setupStatus, isSetupLoading, checkSetupStatus } = useLLMConfig();

  const [selectedForm, setSelectedForm] = useState<SelectedForm | null>(null);
  const [forms, setForms] = useState<AssessmentForm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Check setup status on component mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        await checkSetupStatus();
      } catch (error) {
        console.error("Error checking setup status:", error);
      }
    };

    checkSetup();
  }, [checkSetupStatus]);

  // Redirect to setup if required
  useEffect(() => {
    if (setupStatus && setupStatus.isSetupRequired && !isSetupLoading) {
      router.push("/setup");
    }
  }, [setupStatus, isSetupLoading, router]);

  useEffect(() => {
    const fetchAssessmentForms = async () => {
      try {
        const response = await fetch("/api/assessment-forms");
        if (!response.ok) {
          throw new Error("Failed to fetch assessment forms.");
        }
        const data: AssessmentForm[] = await response.json();
        setForms(data);
      } catch (err: any) {
        setError(err.message);
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    // Only fetch forms if setup is not required
    if (setupStatus && !setupStatus.isSetupRequired) {
      fetchAssessmentForms();
    }
  }, [setupStatus]);

  // If a form is selected, render the AnalysisPage with both IDs
  if (selectedForm) {
    return (
      <AnalysisPage
        assessmentFormId={selectedForm.id}
        assessmentTypeId={selectedForm.typeId}
        assessmentFormName={selectedForm.name}
        onBack={() => setSelectedForm(null)}
      />
    );
  }

  // Show loading while checking setup status
  if (isSetupLoading || (setupStatus && setupStatus.isSetupRequired)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">
            {isSetupLoading
              ? "Checking setup status..."
              : "Redirecting to setup..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <div className="mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <SparklesIcon className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Create New Insight
          </h1>
          <p className="text-lg text-slate-600">
            Select an assessment form to create AI-powered insights from your
            clinical data
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600 mt-4">Loading assessment forms...</p>
        </div>
      ) : error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      ) : forms.length === 0 ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <SparklesIcon className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              No Assessment Forms Available
            </h3>
            <p className="text-slate-600">
              There are no assessment forms available for analysis. Please check
              your database connection or contact your administrator.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card
              key={form.assessmentFormId}
              className="border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
              onClick={() =>
                setSelectedForm({
                  id: form.assessmentFormId,
                  typeId: form.assessmentTypeId,
                  name: form.assessmentFormName,
                })
              }
            >
              <CardHeader>
                <CardTitle className="text-lg text-slate-900">
                  {form.assessmentFormName}
                </CardTitle>
                <p className="text-sm text-slate-600">
                  Version {form.definitionVersion}
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    Form ID: {form.assessmentFormId}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

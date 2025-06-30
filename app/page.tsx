"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardDocumentIcon } from "@/components/heroicons";
import AnalysisPage from "./components/analysis-page";
import { LoadingDots } from "./components/loading-dots";

// Define a type for our assessment form data for type safety
// This matches the JSON structure from your API
type AssessmentForm = {
  assessmentFormId: string;
  assessmentFormName: string;
  definitionVersion: string;
};

export default function HomePage() {
  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const [forms, setForms] = useState<AssessmentForm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Use the useEffect hook to fetch data when the component mounts
  useEffect(() => {
    // Define an async function inside the hook to fetch the data
    const fetchAssessmentForms = async () => {
      try {
        // This path correctly calls your API route located at /api/assessment-forms
        const response = await fetch("/api/assessment-forms");
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Failed to fetch data from the server."
          );
        }
        const data: AssessmentForm[] = await response.json();
        setForms(data); // Set the fetched forms into our state
      } catch (err: any) {
        setError(err.message);
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false); // Stop loading regardless of success or error
      }
    };

    fetchAssessmentForms();
  }, []); // The empty dependency array means this effect runs only once

  // If a form is selected, we show the AnalysisPage component
  if (selectedForm) {
    return (
      <AnalysisPage
        formName={selectedForm}
        onBack={() => setSelectedForm(null)}
      />
    );
  }

  // Main render logic for the homepage
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Select an Assessment Form to Analyze
        </h1>
        <p className="text-lg text-slate-600">
          Choose a form to unlock AI-powered insights from your clinical data
        </p>
      </div>

      {/* Conditional rendering based on loading and error states */}
      {isLoading ? (
        <div className="text-center">
          <LoadingDots />
          <p className="text-slate-600">Loading forms from database...</p>
        </div>
      ) : error ? (
        <div className="text-center text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
          <p className="font-bold">An Error Occurred</p>
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Dynamically map over the fetched forms to create the cards */}
          {forms.map((form) => (
            <Card
              key={form.assessmentFormId}
              className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-slate-200 bg-white"
              onClick={() => setSelectedForm(form.assessmentFormName)}
            >
              <CardContent className="p-6">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                      <ClipboardDocumentIcon className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {form.assessmentFormName}
                    </h3>
                    <p className="text-sm text-slate-600">
                      Version:{form.definitionVersion}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

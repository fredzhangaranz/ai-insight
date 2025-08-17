"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FunnelContainer } from "@/components/funnel/FunnelContainer";
import { SparklesIcon } from "@/components/heroicons";
import type { SubQuestion } from "@/lib/types/funnel";

interface FunnelTestPageProps {
  onBack: () => void;
  originalQuestion?: string;
  assessmentFormDefinition?: any;
  assessmentFormId?: string;
  patientId?: string | null;
}

export default function FunnelTestPage({
  onBack,
  originalQuestion: propOriginalQuestion,
  assessmentFormDefinition,
  assessmentFormId,
  patientId,
}: FunnelTestPageProps) {
  const [showFunnel, setShowFunnel] = useState(false);
  const [funnelKey, setFunnelKey] = useState(0);
  const [originalQuestion, setOriginalQuestion] = useState(
    propOriginalQuestion ||
      "What is the effectiveness of treatments across different wound etiologies over the past year?"
  );

  const handleStartFunnel = () => {
    setFunnelKey((prev) => prev + 1);
    setShowFunnel(true);
  };

  const handleBackToSetup = () => {
    setShowFunnel(false);
  };

  const handleEditQuestion = (questionId: string, newText: string) => {
    console.log("Edit question:", questionId, newText);
    // In real implementation, this would call the API to update the question
  };

  const handleEditSql = (questionId: string, newSql: string) => {
    console.log("Edit SQL:", questionId, newSql);
    // In real implementation, this would call the API to update the SQL
  };

  const handleExecuteQuery = (questionId: string) => {
    console.log("Executing query for question:", questionId);
  };

  const handleMarkComplete = (questionId: string) => {
    console.log("Marking question as complete:", questionId);
  };

  if (showFunnel) {
    console.log("FunnelTestPage - showFunnel props:", {
      originalQuestion,
      assessmentFormDefinition: !!assessmentFormDefinition,
      assessmentFormId,
      patientId,
    });

    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <Button
              variant="ghost"
              onClick={handleBackToSetup}
              className="mb-4 text-slate-600 hover:text-slate-900"
            >
              ← Back to Setup
            </Button>
            <h1 className="text-2xl font-semibold text-slate-900 mb-2">
              AI-Powered Query Funnel
            </h1>
            <p className="text-slate-600">
              AI-powered incremental query generation workflow
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Patient Info (if applicable) */}
          {patientId && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-900">
                    Patient-Specific Analysis
                  </p>
                  <p className="text-xs text-green-700">
                    Patient ID: {patientId}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Funnel Container */}
          <FunnelContainer
            key={`funnel-${funnelKey}`}
            originalQuestion={originalQuestion}
            assessmentFormDefinition={assessmentFormDefinition}
            assessmentFormId={assessmentFormId}
            onEditQuestion={handleEditQuestion}
            onEditSql={handleEditSql}
            onExecuteQuery={handleExecuteQuery}
            onMarkComplete={handleMarkComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4 text-slate-600 hover:text-slate-900"
          >
            ← Back to Form Selection
          </Button>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Funnel Workflow Test
          </h1>
          <p className="text-slate-600">
            Test the new AI-powered incremental query generation workflow
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Setup Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <SparklesIcon className="w-5 h-5 mr-2 text-blue-600" />
              Funnel Setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original Question
                </label>
                <textarea
                  value={originalQuestion}
                  onChange={(e) => setOriginalQuestion(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Enter your complex analytical question..."
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-sm font-medium text-blue-900 mb-2">
                  What this will do:
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>
                    • Break down your complex question into simpler
                    sub-questions
                  </li>
                  <li>• Generate SQL queries for each sub-question</li>
                  <li>• Execute queries and display results incrementally</li>
                  <li>• Allow you to edit questions and SQL at each step</li>
                  <li>• Show progress through the analytical funnel</li>
                </ul>
              </div>

              <Button
                onClick={handleStartFunnel}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <SparklesIcon className="w-4 h-4 mr-2" />
                Start Funnel Workflow
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Information Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How it Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    1
                  </div>
                  <div>
                    <strong>Question Breakdown:</strong> AI analyzes your
                    complex question and breaks it into manageable sub-questions
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    2
                  </div>
                  <div>
                    <strong>SQL Generation:</strong> Each sub-question gets its
                    own optimized SQL query
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    3
                  </div>
                  <div>
                    <strong>Incremental Execution:</strong> Queries run
                    step-by-step, building on previous results
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium mr-3 mt-0.5">
                    4
                  </div>
                  <div>
                    <strong>Interactive Control:</strong> Edit questions and SQL
                    at any step for better results
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Benefits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2"></div>
                  <div>
                    <strong>Improved Reliability:</strong> Step-by-step
                    validation reduces errors
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2"></div>
                  <div>
                    <strong>Greater Transparency:</strong> See exactly what each
                    step does
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2"></div>
                  <div>
                    <strong>Easier Debugging:</strong> Identify and fix issues
                    at specific steps
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-3 mt-2"></div>
                  <div>
                    <strong>User Control:</strong> Modify questions and queries
                    as needed
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

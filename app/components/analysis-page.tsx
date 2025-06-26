"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { SparklesIcon, DocumentDuplicateIcon } from "@/components/heroicons"
import { ChartComponent } from "./chart-component"
import { LoadingDots } from "./loading-dots"
import { CodeBlock } from "./code-block"
import { DataTable } from "./data-table"
import { FormFieldDisplay } from "./form-field-display"

interface AnalysisPageProps {
  formName: string
  onBack: () => void
}

type AnalysisState = "initial" | "loading" | "insights" | "results"

// Real form field data from the JSON
const formFieldsData = {
  "At dressing change": { fieldtype: "Integer", options: [] },
  "Clinical Signs of Infection": {
    fieldtype: "MultiSelect",
    options: [
      "Cellulitis",
      "Suppuration",
      "Lymphangitis",
      "Sepsis",
      "Bacteremia",
      "Granulation changes",
      "Exudate increase",
      "Increase/new pain",
      "Impaired/delayed healing",
      "Wound breakdown/new slough",
    ],
  },
  Comments: { fieldtype: "Text", options: [] },
  "Current interventions": {
    fieldtype: "MultiSelect",
    options: ["Pharmacological", "Non-pharmacological", "Dressing/removal technique", "Other"],
  },
  Etiology: {
    fieldtype: "SingleSelect",
    options: [
      "Pressure Ulcer: Stage 1",
      "Pressure Ulcer: Stage 2",
      "Pressure Ulcer: Stage 3",
      "Pressure Ulcer: Stage 4",
      "Pressure Ulcer: Unstageable (dressing/device)",
      "Pressure Ulcer: Unstageable (eschar/slough)",
      "Deep Tissue Injury",
      "Venous Ulcer",
      "Arterial insufficiency",
      "Mixed Venous/Arterial",
      "Diabetic",
      "Neuropathic: Non-diabetic",
      "Surgical: Closed",
      "Surgical: Full thickness",
      "Surgical: Partial thickness",
      "Surgical: Dehiscence",
      "Drainage Device",
      "Trauma: Full thickness",
      "Trauma: Partial thickness",
      "Trauma: Superficial",
      "Skin tear: Category 1",
      "Skin tear: Category 2a",
      "Skin tear: Category 2b",
      "Skin tear: Category 3",
      "Burn: Superficial thickness",
      "Burn: Partial thickness",
      "Burn: Full thickness",
      "Cancerous: Fungating lesion",
      "Cancerous: Ulcerating lesion",
      "Cancerous: Other",
      "Skin graft",
      "Donor site",
      "Pilonidal wound",
    ],
  },
  "Exudate Type": {
    fieldtype: "SingleSelect",
    options: ["Serous", "Serosanguineous", "Sanguineous", "Purulent"],
  },
  "Exudate Volume": {
    fieldtype: "SingleSelect",
    options: ["None", "Low", "Moderate", "High"],
  },
  Frequency: {
    fieldtype: "SingleSelect",
    options: ["Absent", "Intermittent", "Continuous"],
  },
  "Nature of pain": {
    fieldtype: "MultiSelect",
    options: [
      "Throbbing",
      "Shooting",
      "Stabbing",
      "Sharp",
      "Cramping",
      "Gnawing",
      "Hot/burning",
      "Aching",
      "Heavy",
      "Tender",
      "Splitting",
      "Tiring/exhausting",
      "Sickening",
      "Fearful",
      "Cruel/punishing",
      "Other",
    ],
  },
  "Night pain": { fieldtype: "Integer", options: [] },
  "On elevation": { fieldtype: "Integer", options: [] },
  "On walking": { fieldtype: "Integer", options: [] },
  Recurring: { fieldtype: "Boolean", options: [] },
  "Surrounding Skin": {
    fieldtype: "MultiSelect",
    options: [
      "Tissue paper skin",
      "Peri-wound edema",
      "Macerated",
      "Erythema",
      "Inflammation",
      "Pustules",
      "Eczema",
      "Dry/scaly",
      "Healthy",
    ],
  },
  "Treatment Applied": {
    fieldtype: "SingleSelect",
    options: [
      "Simple Bandage",
      "Compression Bandage",
      "Traditional Negative Pressure",
      "Disposable Negative Pressure",
      "Skin Substitute",
      "Other",
    ],
  },
  "Wound Images": { fieldtype: "File", options: [] },
  "Wound Margins": {
    fieldtype: "MultiSelect",
    options: ["Sloping", "Punched out", "Rolled", "Everted", "Undermining", "Sinus", "Inflamed"],
  },
}

const aiInsights = {
  "Wound Progression and Healing Trajectory": [
    "Show wound healing trend over time for individual patients",
    "Compare healing rates across different wound etiologies",
    "Identify patients with delayed healing patterns",
  ],
  "Clinical Patterns and Outcomes": [
    "What are the 5 most common wound etiologies?",
    "Distribution of wound locations across patient population",
    "Average healing time by wound type and severity",
  ],
  "Operational Insights": [
    "Assessment frequency patterns by clinician",
    "Most commonly documented exudate types",
    "Pain level trends during treatment",
  ],
}

const mockChartData = [
  { name: "Diabetic", value: 145, percentage: 35 },
  { name: "Pressure Ulcer: Stage 2", value: 98, percentage: 24 },
  { name: "Venous Ulcer", value: 76, percentage: 18 },
  { name: "Arterial insufficiency", value: 52, percentage: 13 },
  { name: "Surgical: Full thickness", value: 41, percentage: 10 },
]

const mockSqlQuery = `SELECT 
    etiology,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
FROM wound_assessments 
WHERE assessment_date >= DATEADD(year, -1, GETDATE())
GROUP BY etiology
ORDER BY count DESC
LIMIT 5;`

const mockTableData = [
  { etiology: "Diabetic", count: 145, percentage: 35.0 },
  { etiology: "Pressure Ulcer: Stage 2", count: 98, percentage: 24.0 },
  { etiology: "Venous Ulcer", count: 76, percentage: 18.0 },
  { etiology: "Arterial insufficiency", count: 52, percentage: 13.0 },
  { etiology: "Surgical: Full thickness", count: 41, percentage: 10.0 },
]

export default function AnalysisPage({ formName, onBack }: AnalysisPageProps) {
  const [state, setState] = useState<AnalysisState>("initial")
  const [selectedQuestion, setSelectedQuestion] = useState<string>("")

  const handleAnalyze = () => {
    setState("loading")
    setTimeout(() => {
      setState("insights")
    }, 2000)
  }

  const handleQuestionSelect = (question: string) => {
    setSelectedQuestion(question)
    setState("results")
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Back button */}
      <Button variant="ghost" onClick={onBack} className="mb-6 text-slate-600 hover:text-slate-900">
        ← Back to Forms
      </Button>

      {state === "results" ? (
        // State C: Results Dashboard
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">{selectedQuestion}</h1>
            <p className="text-slate-600">Analysis based on {formName} data</p>
          </div>

          {/* Hero Chart */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">Most Common Wound Etiologies</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartComponent data={mockChartData} />
            </CardContent>
          </Card>

          {/* SQL and Data Panels */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg text-slate-900">Generated SQL</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(mockSqlQuery)}
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
                <CardTitle className="text-lg text-slate-900">Raw Data</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={mockTableData} />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        // States A & B: Two-panel layout
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Panel: Form Schema */}
          <Card className="border-slate-200 bg-slate-50/50 h-fit">
            <CardHeader>
              <CardTitle className="text-xl text-slate-900">{formName} Definition</CardTitle>
              <p className="text-sm text-slate-600">Form fields available for analysis</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {Object.entries(formFieldsData).map(([fieldName, fieldData], index) => (
                  <FormFieldDisplay
                    key={index}
                    fieldName={fieldName}
                    fieldType={fieldData.fieldtype}
                    options={fieldData.options}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Right Panel: Dynamic Content */}
          <div className="space-y-6">
            {state === "initial" && (
              <Card className="border-slate-200 bg-white shadow-sm animate-in fade-in duration-300">
                <CardContent className="p-8 text-center">
                  <div className="mb-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <SparklesIcon className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">Ready to Analyze</h3>
                    <p className="text-slate-600">Let AI discover insights from your {formName} data</p>
                  </div>
                  <Button
                    onClick={handleAnalyze}
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 text-lg font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    <SparklesIcon className="w-5 h-5 mr-2" />
                    Analyze with AI
                  </Button>
                </CardContent>
              </Card>
            )}

            {state === "loading" && (
              <Card className="border-slate-200 bg-white shadow-sm animate-in fade-in duration-300">
                <CardContent className="p-8 text-center">
                  <LoadingDots />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">Analyzing Form Structure</h3>
                  <p className="text-slate-600">AI is generating relevant insights for your data...</p>
                </CardContent>
              </Card>
            )}

            {state === "insights" && (
              <Card className="border-slate-200 bg-white shadow-sm animate-in fade-in duration-500">
                <CardHeader>
                  <CardTitle className="text-xl text-slate-900">AI-Generated Insights</CardTitle>
                  <p className="text-slate-600">Select a question to explore your data</p>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible className="space-y-2">
                    {Object.entries(aiInsights).map(([category, questions], index) => (
                      <AccordionItem
                        key={index}
                        value={`item-${index}`}
                        className="border border-slate-200 rounded-lg px-4"
                      >
                        <AccordionTrigger className="text-left font-semibold text-slate-900 hover:no-underline">
                          {category}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          {questions.map((question, qIndex) => (
                            <div
                              key={qIndex}
                              onClick={() => handleQuestionSelect(question)}
                              className="p-3 rounded-lg bg-slate-50 hover:bg-blue-50 cursor-pointer transition-all duration-200 hover:scale-[1.01] border border-transparent hover:border-blue-200"
                            >
                              <p className="text-slate-700 hover:text-blue-700 font-medium">{question}</p>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

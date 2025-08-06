import type { ChartType } from "@/lib/chart-contracts";

// Analysis Plan Types
export interface AIAnalysisPlan {
  explanation: string;
  generatedSql: string;
  recommendedChartType: ChartType;
  availableMappings: {
    [K in ChartType]?: ChartDataMapping;
  };
}

export interface ChartDataMapping {
  category?: string;
  value?: string;
  x?: string;
  y?: string;
  label?: string;
  trend?: {
    direction: string;
    value: string;
  };
  columns?: Array<{
    key: string;
    header: string;
  }>;
}

export interface PromptContext {
  question: string;
  assessmentFormDefinition: any;
  patientId?: string;
}

// Insight Types
export type QuestionType = "single-patient" | "all-patient";

export interface InsightQuestion {
  text: string;
  type: QuestionType;
  isCustom?: boolean; // Optional flag to indicate if this is a user-added custom question
  originalQuestionId?: string | null; // If present, this is a modified AI question
  id?: number; // Database ID for custom questions
}

export interface InsightCategory {
  category: string;
  questions: InsightQuestion[];
}

export interface AIInsightsResponse {
  insights: InsightCategory[];
}

// Monitoring Types
export interface QueryMetrics {
  queryId: string;
  executionTime: number; // in milliseconds
  resultSize: number; // number of rows
  timestamp: Date;
  cached: boolean;
  sql: string;
  parameters?: Record<string, unknown>;
}

export interface AIResponseMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latency: number; // in milliseconds
  success: boolean;
  errorType?: string;
  model: string;
  timestamp: Date;
}

export interface CacheMetrics {
  cacheHits: number;
  cacheMisses: number;
  cacheInvalidations: number;
  averageHitLatency: number;
  timestamp: Date;
}

// Types for funnel-based query generation (POC)

export type SubQuestionStatus = "pending" | "running" | "completed" | "failed";

export interface SubQuestion {
  id: string;
  text: string;
  order: number;
  sqlQuery?: string;
  data?: any[];
  status: SubQuestionStatus;
  lastExecutionDate?: Date;
}

export type QueryFunnelStatus = "active" | "archived";

export interface QueryFunnel {
  id: string;
  assessmentFormVersionFk: string;
  originalQuestion: string;
  subQuestions: SubQuestion[];
  status: QueryFunnelStatus;
  createdDate: Date;
  lastModifiedDate: Date;
}

import type { TypedDomainPipelineRunResult } from "@/lib/services/domain-pipeline/types";

export interface TypedDomainShadowEvent {
  source: "ask" | "conversation_send";
  customerId: string;
  question: string;
  typedStatus: TypedDomainPipelineRunResult["status"];
  typedRoute: string;
  typedValidationStatus: string | null;
  legacyMode: string | null;
  typedMode: string | null;
  sameMode: boolean;
  sameSql: boolean;
  legacyColumnCount: number;
  typedColumnCount: number;
  legacyError: string | null;
  typedError: string | null;
  fallbackReason: string | null;
  recordedAt: string;
}

export interface TypedDomainShadowSnapshot {
  generatedAt: string;
  startedAt: string;
  totalEvents: number;
  handledEvents: number;
  fallbackEvents: number;
  sameModeRatePct: number;
  sameSqlRatePct: number;
  mismatchRatePct: number;
  byRoute: Record<string, number>;
  byValidationStatus: Record<string, number>;
  byFallbackReason: Record<string, number>;
  bySource: Record<string, number>;
  topFallbackQuestions: Array<{
    question: string;
    count: number;
    fallbackReason: string | null;
  }>;
  topMismatchQuestions: Array<{
    question: string;
    count: number;
    typedRoute: string;
  }>;
  recentEvents: TypedDomainShadowEvent[];
}

type QuestionBucket = {
  count: number;
  fallbackReason: string | null;
  typedRoute: string;
};

export class TypedDomainShadowMetricsService {
  private static instance: TypedDomainShadowMetricsService | null = null;

  private readonly startedAt = new Date();
  private readonly recentEvents: TypedDomainShadowEvent[] = [];
  private readonly maxRecentEvents = 50;
  private readonly byRoute: Record<string, number> = {};
  private readonly byValidationStatus: Record<string, number> = {};
  private readonly byFallbackReason: Record<string, number> = {};
  private readonly bySource: Record<string, number> = {};
  private readonly fallbackQuestions = new Map<string, QuestionBucket>();
  private readonly mismatchQuestions = new Map<string, QuestionBucket>();
  private totalEvents = 0;
  private handledEvents = 0;
  private fallbackEvents = 0;
  private sameModeCount = 0;
  private sameSqlCount = 0;
  private mismatchCount = 0;

  static getInstance(): TypedDomainShadowMetricsService {
    if (!TypedDomainShadowMetricsService.instance) {
      TypedDomainShadowMetricsService.instance =
        new TypedDomainShadowMetricsService();
    }
    return TypedDomainShadowMetricsService.instance;
  }

  static resetInstance(): void {
    TypedDomainShadowMetricsService.instance = null;
  }

  record(event: TypedDomainShadowEvent): void {
    this.totalEvents += 1;
    this.byRoute[event.typedRoute] = (this.byRoute[event.typedRoute] || 0) + 1;
    this.bySource[event.source] = (this.bySource[event.source] || 0) + 1;

    if (event.typedValidationStatus) {
      this.byValidationStatus[event.typedValidationStatus] =
        (this.byValidationStatus[event.typedValidationStatus] || 0) + 1;
    }

    if (event.typedStatus === "handled") {
      this.handledEvents += 1;
    } else {
      this.fallbackEvents += 1;
    }

    if (event.sameMode) {
      this.sameModeCount += 1;
    }

    if (event.sameSql) {
      this.sameSqlCount += 1;
    }

    const mismatch = !event.sameMode || !event.sameSql || Boolean(event.typedError);
    if (mismatch) {
      this.mismatchCount += 1;
      this.bumpQuestionBucket(this.mismatchQuestions, event.question, {
        count: 1,
        fallbackReason: event.fallbackReason,
        typedRoute: event.typedRoute,
      });
    }

    if (event.fallbackReason) {
      this.byFallbackReason[event.fallbackReason] =
        (this.byFallbackReason[event.fallbackReason] || 0) + 1;
      this.bumpQuestionBucket(this.fallbackQuestions, event.question, {
        count: 1,
        fallbackReason: event.fallbackReason,
        typedRoute: event.typedRoute,
      });
    }

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.length = this.maxRecentEvents;
    }
  }

  getSnapshot(): TypedDomainShadowSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      startedAt: this.startedAt.toISOString(),
      totalEvents: this.totalEvents,
      handledEvents: this.handledEvents,
      fallbackEvents: this.fallbackEvents,
      sameModeRatePct: percentage(this.sameModeCount, this.totalEvents),
      sameSqlRatePct: percentage(this.sameSqlCount, this.totalEvents),
      mismatchRatePct: percentage(this.mismatchCount, this.totalEvents),
      byRoute: { ...this.byRoute },
      byValidationStatus: { ...this.byValidationStatus },
      byFallbackReason: { ...this.byFallbackReason },
      bySource: { ...this.bySource },
      topFallbackQuestions: mapTopQuestions(this.fallbackQuestions),
      topMismatchQuestions: mapTopQuestions(this.mismatchQuestions).map((item) => ({
        question: item.question,
        count: item.count,
        typedRoute: this.mismatchQuestions.get(item.question)?.typedRoute || "unknown",
      })),
      recentEvents: [...this.recentEvents],
    };
  }

  private bumpQuestionBucket(
    target: Map<string, QuestionBucket>,
    question: string,
    next: QuestionBucket
  ) {
    const current = target.get(question);
    if (!current) {
      target.set(question, next);
      return;
    }

    target.set(question, {
      count: current.count + 1,
      fallbackReason: next.fallbackReason || current.fallbackReason,
      typedRoute: next.typedRoute || current.typedRoute,
    });
  }
}

function percentage(numerator: number, denominator: number): number {
  if (!denominator) {
    return 0;
  }
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function mapTopQuestions(target: Map<string, QuestionBucket>) {
  return Array.from(target.entries())
    .map(([question, value]) => ({
      question,
      count: value.count,
      fallbackReason: value.fallbackReason,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

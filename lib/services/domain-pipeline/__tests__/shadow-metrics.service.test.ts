import { beforeEach, describe, expect, it } from "vitest";
import {
  TypedDomainShadowMetricsService,
  type TypedDomainShadowEvent,
} from "@/lib/services/domain-pipeline/shadow-metrics.service";

describe("TypedDomainShadowMetricsService", () => {
  beforeEach(() => {
    TypedDomainShadowMetricsService.resetInstance();
  });

  it("aggregates handled, fallback, and mismatch counters", () => {
    const service = TypedDomainShadowMetricsService.getInstance();

    const handledEvent: TypedDomainShadowEvent = {
      source: "ask",
      customerId: "cust-1",
      question: "Show me details for John Smith",
      typedStatus: "handled",
      typedRoute: "patient_details",
      typedValidationStatus: "ok",
      legacyMode: "direct",
      typedMode: "direct",
      sameMode: true,
      sameSql: false,
      legacyColumnCount: 3,
      typedColumnCount: 7,
      legacyError: null,
      typedError: null,
      fallbackReason: null,
      recordedAt: new Date().toISOString(),
    };

    const fallbackEvent: TypedDomainShadowEvent = {
      ...handledEvent,
      source: "conversation_send",
      question: "How many diabetic wounds by clinic",
      typedStatus: "fallback",
      typedRoute: "aggregate_reporting",
      typedValidationStatus: null,
      sameMode: false,
      sameSql: false,
      fallbackReason: "route_not_supported_in_phase1",
    };

    service.record(handledEvent);
    service.record(fallbackEvent);

    const snapshot = service.getSnapshot();
    expect(snapshot.totalEvents).toBe(2);
    expect(snapshot.handledEvents).toBe(1);
    expect(snapshot.fallbackEvents).toBe(1);
    expect(snapshot.byRoute.patient_details).toBe(1);
    expect(snapshot.byRoute.aggregate_reporting).toBe(1);
    expect(snapshot.byFallbackReason.route_not_supported_in_phase1).toBe(1);
    expect(snapshot.topFallbackQuestions[0]?.question).toBe(
      "How many diabetic wounds by clinic"
    );
    expect(snapshot.topMismatchQuestions.length).toBe(2);
  });
});

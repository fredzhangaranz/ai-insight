import type {
  AggregatePredicate,
  ClarificationNeed,
  EntityReference,
  IntentClassificationResult,
  IntentFilter,
  SemanticGrain,
  SemanticMeasure,
  SemanticQueryFrame,
  SemanticSubject,
  SemanticScope,
  TimeRange,
} from "./types";

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseTimeRange(value: unknown): TimeRange | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.unit === "string" &&
    ["days", "weeks", "months", "years"].includes(raw.unit) &&
    typeof raw.value === "number"
  ) {
    return {
      unit: raw.unit as TimeRange["unit"],
      value: raw.value,
    };
  }
  return undefined;
}

function parseFilters(value: unknown): IntentFilter[] {
  if (!Array.isArray(value)) return [];
  const filters: IntentFilter[] = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.operator !== "string" ||
      typeof raw.userPhrase !== "string"
    ) {
      return;
    }

    const filter: IntentFilter = {
      operator: raw.operator,
      userPhrase: raw.userPhrase,
      value: null,
    };

    if (typeof raw.field === "string") {
      filter.field = raw.field;
    }

    filters.push(filter);
  });

  return filters;
}

function inferMeasure(questionLower: string, metrics: string[]): SemanticMeasure | null {
  const metricSet = new Set(metrics.map((metric) => metric.toLowerCase()));
  if (
    metricSet.has("wound_count") ||
    /number of wounds|wound count|wounds per patient|wounds by/i.test(questionLower)
  ) {
    return "wound_count";
  }
  if (
    metricSet.has("assessment_count") ||
    metricSet.has("assessments_per_day") ||
    /assessment count|assessments per|>+\s*\d+\s+assessments?|at least\s+\d+\s+assessments?/i.test(
      questionLower
    )
  ) {
    return "assessment_count";
  }
  if (
    metricSet.has("patient_count") ||
    /\bhow many patients\b|\bpatient count\b/i.test(questionLower)
  ) {
    return "patient_count";
  }
  if (metricSet.has("average_healing_rate")) {
    return "average_healing_rate";
  }
  if (metricSet.has("healing_rate")) {
    return "healing_rate";
  }
  return metrics[0] || null;
}

function inferSubject(questionLower: string, measure: SemanticMeasure | null): SemanticSubject | null {
  if (/\blist patients\b|\bpatients with\b|\bpatient\b/.test(questionLower)) {
    return "patient";
  }
  if (measure === "wound_count") {
    return /\bper patient\b|\bby patient\b/.test(questionLower) ? "patient" : "wound";
  }
  if (measure === "assessment_count") {
    return /\blist patients\b|\bpatients with\b/.test(questionLower)
      ? "patient"
      : "assessment";
  }
  if (/\bwounds\b/.test(questionLower)) return "wound";
  if (/\bassessments?\b/.test(questionLower)) return "assessment";
  if (/\bunits?\b|\bclinics?\b/.test(questionLower)) return "unit";
  return null;
}

function inferGroupBy(questionLower: string): string[] {
  const groupBy = new Set<string>();
  if (/\bper patient\b|\bby patient\b|\bgroup(?:ed)? by patient\b/.test(questionLower)) {
    groupBy.add("patient");
  }
  if (/\bper wound\b|\bby wound\b|\bgroup(?:ed)? by wound\b/.test(questionLower)) {
    groupBy.add("wound");
  }
  if (/\bper unit\b|\bby unit\b|\bgroup(?:ed)? by unit\b/.test(questionLower)) {
    groupBy.add("unit");
  }
  if (/\bper clinic\b|\bby clinic\b|\bgroup(?:ed)? by clinic\b/.test(questionLower)) {
    groupBy.add("clinic");
  }
  if (/\bper month\b|\bby month\b|\bmonthly\b/.test(questionLower)) {
    groupBy.add("month");
  }
  if (/\bper week\b|\bby week\b|\bweekly\b/.test(questionLower)) {
    groupBy.add("week");
  }
  if (/\bper day\b|\bby day\b|\bdaily\b/.test(questionLower)) {
    groupBy.add("day");
  }
  return Array.from(groupBy);
}

function inferGrain(groupBy: string[]): SemanticGrain | null {
  if (groupBy.includes("patient")) return "per_patient";
  if (groupBy.includes("wound")) return "per_wound";
  if (groupBy.includes("unit")) return "per_unit";
  if (groupBy.includes("clinic")) return "per_clinic";
  if (groupBy.includes("month")) return "per_month";
  if (groupBy.includes("week")) return "per_week";
  if (groupBy.includes("day")) return "per_day";
  return "total";
}

function inferAggregatePredicates(
  question: string,
  measure: SemanticMeasure | null
): AggregatePredicate[] {
  const predicates: AggregatePredicate[] = [];
  const patterns: Array<{
    regex: RegExp;
    operator: AggregatePredicate["operator"];
  }> = [
    { regex: /(?:with|having|whose total)?\s*>+\s*(\d+)\s+assessments?/i, operator: ">" },
    { regex: /(?:with|having|whose total)?\s*>?=\s*(\d+)\s+assessments?/i, operator: ">=" },
    { regex: /at least\s+(\d+)\s+assessments?/i, operator: ">=" },
    { regex: /fewer than\s+(\d+)\s+assessments?/i, operator: "<" },
    { regex: /less than\s+(\d+)\s+assessments?/i, operator: "<" },
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern.regex);
    if (!match?.[1]) continue;
    predicates.push({
      measure: measure || "assessment_count",
      operator: pattern.operator,
      value: Number(match[1]),
      rawText: match[0],
      confidence: 0.88,
    });
    break;
  }

  return predicates;
}

function inferEntityRefs(question: string, scope: SemanticScope): EntityReference[] {
  if (scope !== "individual_patient") return [];

  const refs: EntityReference[] = [];
  const patterns = [
    /\bpatient\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Za-z][a-zA-Z'-]+)+)\b/i,
    /\bfor\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Za-z][a-zA-Z'-]+)+)\b/i,
    /\bpatient\s*(?:id|number|mrn|domain id)\s*[:#-]?\s*([A-Za-z0-9_-]{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (!match?.[1]) continue;
    refs.push({
      type: "patient",
      text: match[1].trim(),
      confidence: 0.84,
      explicit: true,
    });
    break;
  }

  return refs;
}

function isAggregatePredicate(
  value: AggregatePredicate | null
): value is AggregatePredicate {
  return value !== null;
}

function isEntityReference(
  value: EntityReference | null
): value is EntityReference {
  return value !== null;
}

function buildClarificationNeeds(frame: SemanticQueryFrame): ClarificationNeed[] {
  const needs: ClarificationNeed[] = [];

  if (!frame.measure.value) {
    needs.push({
      slot: "measure",
      reason: "The question does not identify a single measurable outcome.",
      question: "What should I measure for this query?",
      confidence: 0.78,
    });
  }

  if (
    (/\bper\b|\bby\b/i.test(
      `${frame.groupBy.value.join(" ")} ${frame.grain.value || ""}`
    ) || frame.groupBy.value.length > 0) &&
    (!frame.grain.value || frame.grain.value === "unknown")
  ) {
    needs.push({
      slot: "grain",
      reason: "The query implies grouping but the grouping grain is unclear.",
      question: "How should I group the results?",
      confidence: 0.72,
    });
  }

  if (
    frame.scope.value === "individual_patient" &&
    frame.entityRefs.length === 0
  ) {
    needs.push({
      slot: "entityRef",
      reason: "This looks like a single-patient query but no patient reference was identified.",
      question: "Which patient do you want to analyze?",
      confidence: 0.74,
      target: "patient",
    });
  }

  return needs;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return clampConfidence(
    values.reduce((total, value) => total + value, 0) / values.length
  );
}

export function hasStructuralAggregationSignal(question: string): boolean {
  return /\bper\b|\bby\b|>\s*\d+|>=\s*\d+|at least\s+\d+|fewer than\s+\d+|\blatest\b|\bwithout\b|\btop\s+\d+/i.test(
    question
  );
}

export function normalizeSemanticQueryFrame(
  question: string,
  intent: IntentClassificationResult,
  rawFrame?: unknown
): SemanticQueryFrame {
  const questionLower = question.toLowerCase();
  if (rawFrame && typeof rawFrame === "object") {
    const parsed = rawFrame as Record<string, unknown>;
    const scope = (parsed.scope as Record<string, unknown> | undefined) || {};
    const subject =
      (parsed.subject as Record<string, unknown> | undefined) || {};
    const measure =
      (parsed.measure as Record<string, unknown> | undefined) || {};
    const grain = (parsed.grain as Record<string, unknown> | undefined) || {};
    const groupBy =
      (parsed.groupBy as Record<string, unknown> | undefined) || {};
    const presentation =
      (parsed.presentation as Record<string, unknown> | undefined) || {};
    const preferredVisualization =
      (parsed.preferredVisualization as Record<string, unknown> | undefined) ||
      {};
    const entityRefsRaw = Array.isArray(parsed.entityRefs)
      ? parsed.entityRefs
      : [];
    const aggregatePredicatesRaw = Array.isArray(parsed.aggregatePredicates)
      ? parsed.aggregatePredicates
      : [];
    const clarificationNeedsRaw = Array.isArray(parsed.clarificationNeeds)
      ? parsed.clarificationNeeds
      : [];

    const clarificationNeeds: ClarificationNeed[] = [];
    clarificationNeedsRaw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const raw = entry as Record<string, unknown>;
      if (
        typeof raw.slot !== "string" ||
        typeof raw.reason !== "string" ||
        typeof raw.question !== "string"
      ) {
        return;
      }

      const need: ClarificationNeed = {
        slot: raw.slot as ClarificationNeed["slot"],
        reason: raw.reason,
        question: raw.question,
        confidence:
          typeof raw.confidence === "number"
            ? clampConfidence(raw.confidence)
            : 0.7,
      };

      if (typeof raw.target === "string") {
        need.target = raw.target;
      }

      clarificationNeeds.push(need);
    });

    const frame: SemanticQueryFrame = {
      scope: {
        value:
          typeof scope.value === "string"
            ? (scope.value as SemanticScope)
            : intent.scope,
        confidence:
          typeof scope.confidence === "number"
            ? clampConfidence(scope.confidence)
            : clampConfidence(intent.confidence),
        source:
          typeof scope.source === "string"
            ? (scope.source as SemanticQueryFrame["scope"]["source"])
            : "llm",
      },
      subject: {
        value:
          typeof subject.value === "string"
            ? (subject.value as SemanticSubject)
            : inferSubject(questionLower, inferMeasure(questionLower, intent.metrics)),
        confidence:
          typeof subject.confidence === "number"
            ? clampConfidence(subject.confidence)
            : 0.7,
        source:
          typeof subject.source === "string"
            ? (subject.source as SemanticQueryFrame["subject"]["source"])
            : "llm",
      },
      measure: {
        value:
          typeof measure.value === "string"
            ? (measure.value as SemanticMeasure)
            : inferMeasure(questionLower, intent.metrics),
        confidence:
          typeof measure.confidence === "number"
            ? clampConfidence(measure.confidence)
            : 0.76,
        source:
          typeof measure.source === "string"
            ? (measure.source as SemanticQueryFrame["measure"]["source"])
            : "llm",
      },
      grain: {
        value:
          typeof grain.value === "string"
            ? (grain.value as SemanticGrain)
            : inferGrain(normalizeList(groupBy.value)),
        confidence:
          typeof grain.confidence === "number"
            ? clampConfidence(grain.confidence)
            : 0.72,
        source:
          typeof grain.source === "string"
            ? (grain.source as SemanticQueryFrame["grain"]["source"])
            : "llm",
      },
      groupBy: {
        value:
          normalizeList(groupBy.value).length > 0
            ? normalizeList(groupBy.value)
            : inferGroupBy(questionLower),
        confidence:
          typeof groupBy.confidence === "number"
            ? clampConfidence(groupBy.confidence)
            : 0.72,
        source:
          typeof groupBy.source === "string"
            ? (groupBy.source as SemanticQueryFrame["groupBy"]["source"])
            : "llm",
      },
      filters:
        parseFilters(parsed.filters).length > 0
          ? parseFilters(parsed.filters)
          : intent.filters,
      aggregatePredicates: aggregatePredicatesRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const raw = entry as Record<string, unknown>;
          if (
            typeof raw.measure !== "string" ||
            typeof raw.operator !== "string" ||
            typeof raw.value !== "number"
          ) {
            return null;
          }
          return {
            measure: raw.measure,
            operator: raw.operator as AggregatePredicate["operator"],
            value: raw.value,
            rawText:
              typeof raw.rawText === "string" ? raw.rawText : `${raw.measure}`,
            confidence:
              typeof raw.confidence === "number"
                ? clampConfidence(raw.confidence)
                : 0.76,
          } satisfies AggregatePredicate;
        })
        .filter(isAggregatePredicate),
      timeRange: parseTimeRange(parsed.timeRange) || intent.timeRange,
      presentation: {
        value:
          typeof presentation.value === "string"
            ? (presentation.value as "chart" | "table" | "either")
            : intent.presentationIntent || null,
        confidence:
          typeof presentation.confidence === "number"
            ? clampConfidence(presentation.confidence)
            : 0.72,
        source:
          typeof presentation.source === "string"
            ? (presentation.source as SemanticQueryFrame["presentation"]["source"])
            : "llm",
      },
      preferredVisualization: {
        value:
          typeof preferredVisualization.value === "string"
            ? (preferredVisualization.value as
                | "line"
                | "bar"
                | "kpi"
                | "table")
            : intent.preferredVisualization || null,
        confidence:
          typeof preferredVisualization.confidence === "number"
            ? clampConfidence(preferredVisualization.confidence)
            : 0.7,
        source:
          typeof preferredVisualization.source === "string"
            ? (preferredVisualization.source as
                SemanticQueryFrame["preferredVisualization"]["source"])
            : "llm",
      },
      entityRefs: entityRefsRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const raw = entry as Record<string, unknown>;
          if (typeof raw.type !== "string" || typeof raw.text !== "string") {
            return null;
          }
          return {
            type: raw.type as EntityReference["type"],
            text: raw.text,
            confidence:
              typeof raw.confidence === "number"
                ? clampConfidence(raw.confidence)
                : 0.7,
            explicit: raw.explicit !== false,
          } satisfies EntityReference;
        })
        .filter(isEntityReference),
      clarificationNeeds,
      confidence:
        typeof parsed.confidence === "number"
          ? clampConfidence(parsed.confidence)
          : clampConfidence(intent.confidence),
    };

    if (frame.aggregatePredicates.length === 0) {
      frame.aggregatePredicates = inferAggregatePredicates(question, frame.measure.value);
    }
    if (frame.entityRefs.length === 0) {
      frame.entityRefs = inferEntityRefs(question, frame.scope.value || intent.scope);
    }
    if (frame.clarificationNeeds.length === 0) {
      frame.clarificationNeeds = buildClarificationNeeds(frame);
    }
    return frame;
  }

  return deriveSemanticQueryFrame(question, intent);
}

export function deriveSemanticQueryFrame(
  question: string,
  intent: IntentClassificationResult
): SemanticQueryFrame {
  const questionLower = question.toLowerCase();
  const measure = inferMeasure(questionLower, intent.metrics);
  const groupBy = inferGroupBy(questionLower);
  const frame: SemanticQueryFrame = {
    scope: {
      value: intent.scope,
      confidence: clampConfidence(intent.confidence),
      source: "fallback",
    },
    subject: {
      value: inferSubject(questionLower, measure),
      confidence: 0.72,
      source: "heuristic",
    },
    measure: {
      value: measure,
      confidence: 0.78,
      source: "heuristic",
    },
    grain: {
      value: inferGrain(groupBy),
      confidence: groupBy.length > 0 ? 0.82 : 0.68,
      source: "heuristic",
    },
    groupBy: {
      value: groupBy,
      confidence: groupBy.length > 0 ? 0.82 : 0.68,
      source: "heuristic",
    },
    filters: intent.filters,
    aggregatePredicates: inferAggregatePredicates(question, measure),
    timeRange: intent.timeRange,
    presentation: {
      value: intent.presentationIntent || null,
      confidence: 0.72,
      source: "fallback",
    },
    preferredVisualization: {
      value: intent.preferredVisualization || null,
      confidence: 0.72,
      source: "fallback",
    },
    entityRefs: inferEntityRefs(question, intent.scope),
    clarificationNeeds: [],
    confidence: average([
      intent.confidence,
      groupBy.length > 0 ? 0.82 : 0.68,
      measure ? 0.78 : 0.4,
    ]),
  };

  // Structural predicates are not value filters. Remove them before terminology mapping.
  if (frame.aggregatePredicates.length > 0) {
    frame.filters = frame.filters.filter((filter) => {
      const phrase = filter.userPhrase.toLowerCase();
      return !/assessment/.test(phrase) || !/[<>]=?|\bat least\b|\bfewer than\b|\bless than\b/.test(phrase);
    });
  }

  frame.clarificationNeeds = buildClarificationNeeds(frame);
  return frame;
}

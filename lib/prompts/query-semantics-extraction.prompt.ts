import type {
  AggregatePredicate,
  CanonicalClarificationItem,
  CanonicalQuerySemantics,
  CanonicalQueryShape,
  CanonicalSubjectEntityType,
  CanonicalSubjectReferenceKind,
  CanonicalSubjectReferenceStatus,
  CanonicalValueSpec,
  ExecutionRequirements,
  IntentClassificationResult,
  MeasureSpec,
  IntentType,
  SemanticGrain,
  SemanticSubject,
  SubjectRef,
  TemporalSpec,
  ClarificationSlot,
} from "@/lib/services/context-discovery/types";

const QUERY_SHAPES: CanonicalQueryShape[] = [
  "aggregate",
  "cohort",
  "individual_subject",
  "trend",
  "comparison",
];

const SUBJECT_ENTITY_TYPES: CanonicalSubjectEntityType[] = [
  "patient",
  "wound",
  "unit",
  "clinic",
  "assessment_type",
];

const SUBJECT_REFERENCE_KINDS: CanonicalSubjectReferenceKind[] = [
  "name",
  "domain_id",
  "guid",
  "label",
  "unknown",
];

const SUBJECT_REFERENCE_STATUSES: CanonicalSubjectReferenceStatus[] = [
  "absent",
  "candidate",
  "ambiguous",
  "requires_resolution",
];

const SEMANTIC_SUBJECTS: SemanticSubject[] = [
  "patient",
  "wound",
  "assessment",
  "unit",
  "clinic",
  "measurement",
  "unknown",
];

const SEMANTIC_GRAINS: SemanticGrain[] = [
  "total",
  "per_patient",
  "per_wound",
  "per_assessment",
  "per_unit",
  "per_clinic",
  "per_month",
  "per_week",
  "per_day",
  "unknown",
];

const ANALYTIC_INTENTS: IntentType[] = [
  "outcome_analysis",
  "trend_analysis",
  "cohort_comparison",
  "risk_assessment",
  "quality_metrics",
  "operational_metrics",
];

const CLARIFICATION_SLOTS: ClarificationSlot[] = [
  "scope",
  "subject",
  "measure",
  "grain",
  "groupBy",
  "timeRange",
  "assessmentType",
  "aggregatePredicate",
  "entityRef",
  "valueFilter",
];

export const QUERY_SEMANTICS_EXTRACTION_SYSTEM_PROMPT = `You are an expert healthcare analytics query semantic extractor.

Your job is to transform a natural-language analytics question plus an already-classified analytic intent into one canonical query semantics contract.

Return ONLY valid JSON.

Rules:
- Do not generate SQL.
- Do not invent database fields or table names.
- Detect whether the question refers to one specific patient even when phrased as an aggregate question.
- Treat absolute dates and date ranges as first-class temporal structures.
- Use subjectRefs for named references such as one patient, one clinic, or one unit.
- If a specific patient must be securely resolved before SQL generation, set executionRequirements.requiresPatientResolution = true and add patientId1 to requiredBindings.
- If clarification is required before safe SQL generation, set executionRequirements.allowSqlGeneration = false and explain why in blockReason and clarificationPlan.
- domain_id can be a lookup/reference kind, but it is not a SQL binding path.

JSON shape:
{
  "version": "v1",
  "queryShape": "aggregate|cohort|individual_subject|trend|comparison",
  "analyticIntent": "outcome_analysis|trend_analysis|cohort_comparison|risk_assessment|quality_metrics|operational_metrics",
  "measureSpec": {
    "metrics": ["..."],
    "subject": "patient|wound|assessment|unit|clinic|measurement|unknown|null",
    "grain": "total|per_patient|per_wound|per_assessment|per_unit|per_clinic|per_month|per_week|per_day|unknown|null",
    "groupBy": ["..."],
    "aggregatePredicates": [{"measure":"...","operator":">","value":1,"rawText":"...","confidence":0.9}],
    "presentationIntent": "chart|table|either|null",
    "preferredVisualization": "line|bar|kpi|table|null"
  },
  "subjectRefs": [{
    "entityType": "patient|wound|unit|clinic|assessment_type",
    "mentionText": "...",
    "referenceKind": "name|domain_id|guid|label|unknown",
    "status": "absent|candidate|ambiguous|requires_resolution",
    "confidence": 0.0,
    "explicit": true
  }],
  "temporalSpec": {
    "kind": "none|relative_range|absolute_range|point_in_time",
    "unit": "days|weeks|months|years",
    "value": 1,
    "start": "YYYY-MM-DD",
    "end": "YYYY-MM-DD",
    "rawText": "..."
  },
  "valueSpecs": [{
    "field": "...",
    "operator": "equals",
    "userPhrase": "...",
    "value": null,
    "resolved": false
  }],
  "clarificationPlan": [{
    "slot": "scope|subject|measure|grain|groupBy|timeRange|assessmentType|aggregatePredicate|entityRef|valueFilter",
    "reasonCode": "missing_entity|ambiguous_field|ambiguous_value|missing_time_range|missing_measure|missing_grain|missing_assessment_type|unsafe_to_execute",
    "reason": "...",
    "blocking": true,
    "confidence": 0.0,
    "target": "...",
    "evidence": {
      "userPhrase": "...",
      "matchedConcepts": ["..."],
      "matchedFields": ["..."],
      "matchedValues": ["..."],
      "threadReference": false
    }
  }],
  "executionRequirements": {
    "requiresPatientResolution": true,
    "requiredBindings": ["patientId1"],
    "allowSqlGeneration": true,
    "blockReason": null
  }
}`;

export function constructQuerySemanticsExtractionPrompt(input: {
  question: string;
  intent: IntentClassificationResult;
  semanticFrame?: unknown;
}): string {
  return [
    "Create the canonical query semantics for this analytics question.",
    `Question: "${input.question}"`,
    `Intent classification: ${JSON.stringify(input.intent)}`,
    input.semanticFrame
      ? `Migration hint semantic frame: ${JSON.stringify(input.semanticFrame)}`
      : null,
    "Return valid JSON only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeAggregatePredicates(value: unknown): AggregatePredicate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isObject(entry)) return null;
      if (
        typeof entry.measure !== "string" ||
        !["<", "<=", "=", ">", ">="].includes(String(entry.operator)) ||
        typeof entry.value !== "number" ||
        typeof entry.rawText !== "string"
      ) {
        return null;
      }

      return {
        measure: entry.measure,
        operator: entry.operator as AggregatePredicate["operator"],
        value: entry.value,
        rawText: entry.rawText,
        confidence: clampConfidence(entry.confidence),
      } satisfies AggregatePredicate;
    })
    .filter((entry): entry is AggregatePredicate => Boolean(entry));
}

function normalizeSubjectRefs(value: unknown): SubjectRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isObject(entry)) return null;
      if (
        !SUBJECT_ENTITY_TYPES.includes(
          entry.entityType as CanonicalSubjectEntityType
        ) ||
        typeof entry.mentionText !== "string" ||
        !SUBJECT_REFERENCE_KINDS.includes(
          entry.referenceKind as CanonicalSubjectReferenceKind
        ) ||
        !SUBJECT_REFERENCE_STATUSES.includes(
          entry.status as CanonicalSubjectReferenceStatus
        ) ||
        typeof entry.explicit !== "boolean"
      ) {
        return null;
      }

      return {
        entityType: entry.entityType as CanonicalSubjectEntityType,
        mentionText: entry.mentionText.trim(),
        referenceKind: entry.referenceKind as CanonicalSubjectReferenceKind,
        status: entry.status as CanonicalSubjectReferenceStatus,
        confidence: clampConfidence(entry.confidence),
        explicit: entry.explicit,
      } satisfies SubjectRef;
    })
    .filter((entry): entry is SubjectRef => Boolean(entry));
}

function normalizeTemporalSpec(value: unknown): TemporalSpec {
  if (!isObject(value) || typeof value.kind !== "string") {
    return { kind: "none", rawText: null };
  }

  if (value.kind === "relative_range") {
    if (
      typeof value.unit === "string" &&
      ["days", "weeks", "months", "years"].includes(value.unit) &&
      typeof value.value === "number"
    ) {
      return {
        kind: "relative_range",
        unit: value.unit as Extract<TemporalSpec, { kind: "relative_range" }>["unit"],
        value: value.value,
        rawText: typeof value.rawText === "string" ? value.rawText : null,
      };
    }
    return { kind: "none", rawText: null };
  }

  if (value.kind === "absolute_range") {
    if (typeof value.start === "string" && typeof value.end === "string") {
      return {
        kind: "absolute_range",
        start: value.start,
        end: value.end,
        rawText: typeof value.rawText === "string" ? value.rawText : null,
      };
    }
    return { kind: "none", rawText: null };
  }

  if (value.kind === "point_in_time") {
    if (typeof value.value === "string") {
      return {
        kind: "point_in_time",
        value: value.value,
        rawText: typeof value.rawText === "string" ? value.rawText : null,
      };
    }
    return { kind: "none", rawText: null };
  }

  return {
    kind: "none",
    rawText: typeof value.rawText === "string" ? value.rawText : null,
  };
}

function normalizeValueSpecs(value: unknown): CanonicalValueSpec[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isObject(entry)) return null;
      if (
        typeof entry.operator !== "string" ||
        typeof entry.userPhrase !== "string"
      ) {
        return null;
      }

      const spec: CanonicalValueSpec = {
        field: typeof entry.field === "string" ? entry.field : undefined,
        operator: entry.operator,
        userPhrase: entry.userPhrase,
        value:
          typeof entry.value === "string" || entry.value === null
            ? (entry.value as string | null)
            : null,
        resolved: entry.resolved === true,
      } as CanonicalValueSpec;
    })
    .filter(Boolean) as CanonicalValueSpec[];
}

function normalizeClarificationPlan(value: unknown): CanonicalClarificationItem[] {
  if (!Array.isArray(value)) return [];
  const reasonCodes: CanonicalClarificationItem["reasonCode"][] = [
    "missing_entity",
    "ambiguous_field",
    "ambiguous_value",
    "missing_time_range",
    "missing_measure",
    "missing_grain",
    "missing_assessment_type",
    "unsafe_to_execute",
  ];
  return value
    .map((entry) => {
      if (!isObject(entry)) return null;
      const slot = entry.slot as ClarificationSlot;
      const reasonCode = reasonCodes.includes(
        entry.reasonCode as CanonicalClarificationItem["reasonCode"]
      )
        ? (entry.reasonCode as CanonicalClarificationItem["reasonCode"])
        : defaultReasonCodeBySlot[slot] || "ambiguous_value";

      if (
        !CLARIFICATION_SLOTS.includes(slot) ||
        typeof entry.reason !== "string" ||
        !reasonCodes.includes(entry.reasonCode as CanonicalClarificationItem["reasonCode"]) ||
        typeof entry.blocking !== "boolean"
      ) {
        return null;
      }

      return {
        slot: entry.slot as CanonicalClarificationItem["slot"],
        reasonCode: entry.reasonCode as CanonicalClarificationItem["reasonCode"],
        reason: entry.reason,
        question: typeof entry.question === "string" ? entry.question : undefined,
        blocking: entry.blocking,
        confidence: clampConfidence(entry.confidence),
        target: typeof entry.target === "string" ? entry.target : undefined,
        evidence: isObject(entry.evidence)
          ? {
              userPhrase:
                typeof entry.evidence.userPhrase === "string"
                  ? entry.evidence.userPhrase
                  : undefined,
              matchedConcepts: Array.isArray(entry.evidence.matchedConcepts)
                ? entry.evidence.matchedConcepts.filter(
                    (item): item is string => typeof item === "string"
                  )
                : undefined,
              matchedFields: Array.isArray(entry.evidence.matchedFields)
                ? entry.evidence.matchedFields.filter(
                    (item): item is string => typeof item === "string"
                  )
                : undefined,
              matchedValues: Array.isArray(entry.evidence.matchedValues)
                ? entry.evidence.matchedValues.filter(
                    (item): item is string => typeof item === "string"
                  )
                : undefined,
              threadReference: entry.evidence.threadReference === true,
            }
          : undefined,
      } as CanonicalClarificationItem;
    })
    .filter(Boolean) as CanonicalClarificationItem[];
}

function normalizeExecutionRequirements(value: unknown): ExecutionRequirements {
  if (!isObject(value)) {
    return {
      requiresPatientResolution: false,
      requiredBindings: [],
      allowSqlGeneration: true,
    };
  }

  return {
    requiresPatientResolution: value.requiresPatientResolution === true,
    requiredBindings: Array.isArray(value.requiredBindings)
      ? value.requiredBindings.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        )
      : [],
    allowSqlGeneration: value.allowSqlGeneration !== false,
    blockReason:
      typeof value.blockReason === "string" ? value.blockReason : undefined,
  };
}

function normalizeMeasureSpec(value: unknown): MeasureSpec {
  const raw = isObject(value) ? value : {};
  return {
    metrics: Array.isArray(raw.metrics)
      ? raw.metrics.filter((entry): entry is string => typeof entry === "string")
      : [],
    subject:
      raw.subject === null ||
      SEMANTIC_SUBJECTS.includes(raw.subject as SemanticSubject)
        ? ((raw.subject as SemanticSubject | null | undefined) ?? null)
        : null,
    grain:
      raw.grain === null || SEMANTIC_GRAINS.includes(raw.grain as SemanticGrain)
        ? ((raw.grain as SemanticGrain | null | undefined) ?? null)
        : null,
    groupBy: Array.isArray(raw.groupBy)
      ? raw.groupBy.filter((entry): entry is string => typeof entry === "string")
      : [],
    aggregatePredicates: normalizeAggregatePredicates(raw.aggregatePredicates),
    presentationIntent:
      raw.presentationIntent === null ||
      raw.presentationIntent === "chart" ||
      raw.presentationIntent === "table" ||
      raw.presentationIntent === "either"
        ? ((raw.presentationIntent as MeasureSpec["presentationIntent"] | undefined) ??
          null)
        : null,
    preferredVisualization:
      raw.preferredVisualization === null ||
      raw.preferredVisualization === "line" ||
      raw.preferredVisualization === "bar" ||
      raw.preferredVisualization === "kpi" ||
      raw.preferredVisualization === "table"
        ? ((raw.preferredVisualization as MeasureSpec["preferredVisualization"] | undefined) ??
          null)
        : null,
  };
}

export function validateQuerySemanticsExtractionResponse(
  response: unknown
): {
  valid: boolean;
  result?: CanonicalQuerySemantics;
  error?: string;
} {
  if (typeof response === "string") {
    try {
      response = JSON.parse(response);
    } catch {
      return {
        valid: false,
        error: "Response was not valid JSON",
      };
    }
  }

  if (!isObject(response)) {
    return {
      valid: false,
      error: "Response must be an object",
    };
  }

  if (response.version !== "v1") {
    return {
      valid: false,
      error: "Invalid or missing version",
    };
  }

  if (!QUERY_SHAPES.includes(response.queryShape as CanonicalQueryShape)) {
    return {
      valid: false,
      error: "Invalid queryShape",
    };
  }

  if (typeof response.analyticIntent !== "string") {
    return {
      valid: false,
      error: "Missing analyticIntent",
    };
  }

  if (!ANALYTIC_INTENTS.includes(response.analyticIntent as IntentType)) {
    return {
      valid: false,
      error: "Invalid analyticIntent",
    };
  }

  const result: CanonicalQuerySemantics = {
    version: "v1",
    queryShape: response.queryShape as CanonicalQueryShape,
    analyticIntent: response.analyticIntent as CanonicalQuerySemantics["analyticIntent"],
    measureSpec: normalizeMeasureSpec(response.measureSpec),
    subjectRefs: normalizeSubjectRefs(response.subjectRefs),
    temporalSpec: normalizeTemporalSpec(response.temporalSpec),
    valueSpecs: normalizeValueSpecs(response.valueSpecs),
    clarificationPlan: normalizeClarificationPlan(response.clarificationPlan),
    executionRequirements: normalizeExecutionRequirements(
      response.executionRequirements
    ),
  };

  return {
    valid: true,
    result,
  };
}

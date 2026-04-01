import type {
  CanonicalQuerySemantics,
  SubjectRef,
} from "@/lib/services/context-discovery/types";

const NON_PATIENT_ENTITY_TARGET_KEYWORDS = [
  "wound",
  "unit",
  "clinic",
  "assessment",
];

/**
 * Canonical extraction can emit generic entityRef targets such as "entity"/"subject"
 * even when the unresolved reference is still the thread patient.
 */
export function isPatientLikeEntityRefTarget(target?: string): boolean {
  const normalized = (target || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    NON_PATIENT_ENTITY_TARGET_KEYWORDS.some((keyword) =>
      normalized.includes(keyword)
    )
  ) {
    return false;
  }

  return (
    normalized.includes("patient") ||
    normalized === "entity" ||
    normalized === "entities" ||
    normalized === "subject" ||
    normalized === "person" ||
    normalized === "individual"
  );
}

/** Follow-up phrasing that refers to the patient already scoped in the thread. */
export function isAnaphoricPatientReferenceQuestion(question: string): boolean {
  return /\b(this|that|same|the)\s+patient\b/i.test(question);
}

/**
 * Intent + canonical extraction run on the latest user message only, so "this patient"
 * yields a blocking entityRef clarification. When QueryHistory already has @patientId1,
 * merge thread context into the canonical contract (pure transform; caller should clone
 * if the object is shared/cached).
 */
export function mergeInheritedThreadPatientIntoCanonicalSemantics(
  semantics: CanonicalQuerySemantics,
  inherited: {
    resolvedId: string;
    displayLabel?: string;
    opaqueRef?: string;
  }
): CanonicalQuerySemantics {
  const clone = JSON.parse(JSON.stringify(semantics)) as CanonicalQuerySemantics;

  const filteredPlan = clone.clarificationPlan.filter((item) => {
    if (!item.blocking) return true;
    if (item.slot !== "entityRef") return true;
    if (!isPatientLikeEntityRefTarget(item.target)) return true;
    return false;
  });

  const stillBlocking = filteredPlan.some((i) => i.blocking);
  const removedPatientEntityClarification =
    filteredPlan.length !== clone.clarificationPlan.length;

  clone.clarificationPlan = filteredPlan;

  const mention =
    inherited.displayLabel?.trim() ||
    "the patient from the previous turn in this thread";

  const hasPatientSubject = clone.subjectRefs.some(
    (r) => r.entityType === "patient"
  );
  if (!hasPatientSubject) {
    const ref: SubjectRef = {
      entityType: "patient",
      mentionText: mention,
      referenceKind: "name",
      status: "requires_resolution",
      confidence: 0.92,
      explicit: false,
    };
    clone.subjectRefs = [...clone.subjectRefs, ref];
  }

  clone.executionRequirements = {
    ...clone.executionRequirements,
    requiresPatientResolution: true,
    requiredBindings:
      clone.executionRequirements.requiredBindings.length > 0
        ? [...clone.executionRequirements.requiredBindings]
        : ["patientId1"],
    allowSqlGeneration:
      removedPatientEntityClarification && !stillBlocking
        ? true
        : clone.executionRequirements.allowSqlGeneration,
    blockReason: stillBlocking
      ? clone.executionRequirements.blockReason
      : undefined,
  };

  return clone;
}

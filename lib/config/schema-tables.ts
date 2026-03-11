/**
 * Table allowlist for dbo schema introspection.
 * rpt schema: no allowlist — introspect ALL tables in the schema.
 */

export const DBO_TABLES: readonly string[] = [
  "Anatomy",
  "AssessmentSignature",
  "AssessmentType",
  "AssessmentTypeVersion",
  "AttributeFile",
  "AttributeLookup",
  "AttributeSet",
  "AttributeSetAssessmentTypeVersion",
  "AttributeType",
  "DateOfService",
  "ImageCapture",
  "ImageFormat",
  "Outline",
  "Patient",
  "PatientAttribute",
  "PatientAttributeAttributeFile",
  "PatientAttributeUserList",
  "PatientNote",
  "ProgressNote",
  "ProgressNoteRevision",
  "ProgressNoteRevisionAssessmentType",
  "ProgressNoteRevisionSeries",
  "Ruler",
  "Series",
  "SourceListItem",
  "StaffUser",
  "Wound",
  "WoundAttribute",
  "WoundAttributeAttributeFile",
  "WoundAttributeUserList",
  "WoundState",
  "WoundStateAttribute",
] as const;

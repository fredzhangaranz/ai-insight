import crypto from "crypto";
import type { ConnectionPool } from "mssql";
import { withCustomerPool } from "@/lib/services/semantic/customer-query.service";
import type { ResolvedEntitySummary } from "@/lib/types/insight-artifacts";

export interface PatientMatch {
  patientId: string;
  domainId: string | null;
  patientName: string;
  unitName: string | null;
}

export type PatientResolutionStatus =
  | "resolved"
  | "confirmation_required"
  | "disambiguation_required"
  | "not_found"
  | "no_candidate";

export interface PatientResolutionResult {
  status: PatientResolutionStatus;
  matchedText?: string;
  candidateText?: string;
  opaqueRef?: string;
  resolvedId?: string;
  matchType?: ResolvedEntitySummary["matchType"];
  requiresConfirmation?: boolean;
  matches?: PatientMatch[];
  selectedMatch?: PatientMatch;
}

export function toPatientOpaqueRef(value: string): string {
  const salt = process.env.ENTITY_HASH_SALT || "insightgen-dev-salt";
  return crypto
    .createHash("sha256")
    .update(`${value}:${salt}`)
    .digest("hex")
    .slice(0, 16);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const GENERIC_PATIENT_CANDIDATE_TOKENS = new Set([
  "age",
  "ages",
  "assessment",
  "assessments",
  "average",
  "bar",
  "chart",
  "charts",
  "clinic",
  "clinics",
  "cohort",
  "count",
  "counts",
  "demographic",
  "demographics",
  "diabetic",
  "distribution",
  "graph",
  "graphs",
  "healing",
  "histogram",
  "in",
  "infection",
  "list",
  "listing",
  "measure",
  "measures",
  "metric",
  "metrics",
  "month",
  "months",
  "patient",
  "patients",
  "per",
  "plot",
  "plots",
  "pressure",
  "rate",
  "rates",
  "report",
  "reports",
  "status",
  "summary",
  "system",
  "table",
  "tables",
  "the",
  "trend",
  "trends",
  "ulcer",
  "ulcers",
  "unit",
  "units",
  "week",
  "weeks",
  "wound",
  "wounds",
]);

const ALL_ACCESS_PREFIX =
  "EXEC sp_set_session_context @key = N'all_access', @value = 1;\n";

function extractGuid(question: string): string | undefined {
  const match = question.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  );
  return match?.[0];
}

function extractDomainId(question: string): string | undefined {
  const looksLikeIdentifier = (value: string) =>
    /\d/.test(value) || /[-_]/.test(value);

  const patterns = [
    /\b(?:patient\s*id|patient\s*number|mrn|domain\s*id)\s*[:#-]?\s*([A-Za-z0-9_-]{3,})\b/i,
    /\bpatient\s+([A-Za-z0-9_-]{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (
      match?.[1] &&
      !match[1].includes(" ") &&
      looksLikeIdentifier(match[1])
    ) {
      return match[1];
    }
  }

  return undefined;
}

export function isLikelyPatientNameCandidate(value: string): boolean {
  const candidate = value.trim().replace(/[.,!?;:]+$/, "");
  if (!candidate) return false;
  if (/\d/.test(candidate)) return false;

  const tokens = candidate
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);

  if (tokens.length < 2 || tokens.length > 4) {
    return false;
  }

  return !tokens.some((token) => GENERIC_PATIENT_CANDIDATE_TOKENS.has(token));
}

function extractFullName(question: string): string | undefined {
  const patterns = [
    /\b(?:patient|pt)\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Za-z][a-zA-Z'-]+)+)\b/i,
    /\bfor\s+([A-Za-z][a-zA-Z'-]+(?:\s+[A-Za-z][a-zA-Z'-]+)+)\b/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) {
      const candidate = match[1].trim().replace(/[.,!?;:]+$/, "");
      if (isLikelyPatientNameCandidate(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

async function queryPatients<T>(
  customerId: string,
  fn: (pool: ConnectionPool) => Promise<T>
): Promise<T> {
  return withCustomerPool(customerId, fn);
}

async function findByPatientId(
  customerId: string,
  patientId: string
): Promise<PatientMatch | null> {
  return queryPatients(customerId, async (pool) => {
    const result = await pool
      .request()
      .input("patientId", patientId)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 1
          CAST(p.id AS NVARCHAR(36)) AS patientId,
          CAST(p.domainId AS NVARCHAR(255)) AS domainId,
          LTRIM(RTRIM(CONCAT(COALESCE(p.firstName, ''), ' ', COALESCE(p.lastName, '')))) AS patientName,
          u.name AS unitName
        FROM rpt.Patient p
        LEFT JOIN rpt.Unit u ON p.unitFk = u.id
        WHERE CAST(p.id AS NVARCHAR(36)) = @patientId
      `);

    return result.recordset[0] || null;
  });
}

async function findByDomainId(
  customerId: string,
  domainId: string
): Promise<PatientMatch | null> {
  return queryPatients(customerId, async (pool) => {
    const result = await pool
      .request()
      .input("domainId", domainId)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 1
          CAST(p.id AS NVARCHAR(36)) AS patientId,
          CAST(p.domainId AS NVARCHAR(255)) AS domainId,
          LTRIM(RTRIM(CONCAT(COALESCE(p.firstName, ''), ' ', COALESCE(p.lastName, '')))) AS patientName,
          u.name AS unitName
        FROM rpt.Patient p
        LEFT JOIN rpt.Unit u ON p.unitFk = u.id
        WHERE CAST(p.domainId AS NVARCHAR(255)) = @domainId
      `);

    return result.recordset[0] || null;
  });
}

async function findByFullName(
  customerId: string,
  fullName: string
): Promise<PatientMatch[]> {
  return queryPatients(customerId, async (pool) => {
    const normalized = normalizeName(fullName);
    const result = await pool
      .request()
      .input("fullName", normalized)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 10
          CAST(p.id AS NVARCHAR(36)) AS patientId,
          CAST(p.domainId AS NVARCHAR(255)) AS domainId,
          LTRIM(RTRIM(CONCAT(COALESCE(p.firstName, ''), ' ', COALESCE(p.lastName, '')))) AS patientName,
          u.name AS unitName
        FROM rpt.Patient p
        LEFT JOIN rpt.Unit u ON p.unitFk = u.id
        WHERE LOWER(LTRIM(RTRIM(CONCAT(COALESCE(p.firstName, ''), ' ', COALESCE(p.lastName, ''))))) = @fullName
        ORDER BY patientName ASC
      `);

    return result.recordset || [];
  });
}

export class PatientEntityResolver {
  async resolve(
    question: string,
    customerId: string,
    options?: {
      selectionOpaqueRef?: string;
      overrideLookup?: string;
      confirmedOpaqueRef?: string;
      candidateText?: string;
      allowQuestionInference?: boolean;
    }
  ): Promise<PatientResolutionResult> {
    const lookupText =
      options?.overrideLookup ||
      options?.candidateText ||
      (options?.allowQuestionInference === false ? "" : question);

    if (!lookupText.trim()) {
      return { status: "no_candidate" };
    }

    const guid = extractGuid(lookupText);
    if (guid) {
      const match = await findByPatientId(customerId, guid);
      if (!match) {
        return {
          status: "not_found",
          candidateText: guid,
          matchedText: guid,
          matchType: "patient_id",
        };
      }

      return {
        status: "resolved",
        matchedText: guid,
        opaqueRef: toPatientOpaqueRef(match.patientId),
        resolvedId: match.patientId,
        matchType: "patient_id",
        selectedMatch: match,
      };
    }

    const domainId = extractDomainId(lookupText);
    if (domainId) {
      const match = await findByDomainId(customerId, domainId);
      if (!match) {
        return {
          status: "not_found",
          candidateText: domainId,
          matchedText: domainId,
          matchType: "domain_id",
        };
      }

      return {
        status: "resolved",
        matchedText: domainId,
        opaqueRef: toPatientOpaqueRef(match.patientId),
        resolvedId: match.patientId,
        matchType: "domain_id",
        selectedMatch: match,
      };
    }

    const directCandidateText = options?.candidateText?.trim();
    const fullName =
      directCandidateText &&
      !extractGuid(directCandidateText) &&
      !extractDomainId(directCandidateText) &&
      isLikelyPatientNameCandidate(directCandidateText)
        ? directCandidateText.replace(/[.,!?;:]+$/, "")
        : extractFullName(lookupText);
    if (!fullName) {
      return { status: "no_candidate" };
    }

    const matches = await findByFullName(customerId, fullName);
    if (matches.length === 0) {
      return {
        status: "not_found",
        candidateText: fullName,
        matchedText: fullName,
        matchType: "full_name",
      };
    }

    const selectedByOpaque =
      options?.selectionOpaqueRef || options?.confirmedOpaqueRef
      ? matches.find(
          (match) =>
            toPatientOpaqueRef(match.patientId) ===
            (options?.selectionOpaqueRef || options?.confirmedOpaqueRef)
        )
      : undefined;

    if (selectedByOpaque) {
      return {
        status: "resolved",
        matchedText: fullName,
        opaqueRef: toPatientOpaqueRef(selectedByOpaque.patientId),
        resolvedId: selectedByOpaque.patientId,
        matchType: "full_name",
        selectedMatch: selectedByOpaque,
      };
    }

    if (matches.length === 1) {
      const match = matches[0];
      return {
        status: "confirmation_required",
        matchedText: fullName,
        candidateText: fullName,
        opaqueRef: toPatientOpaqueRef(match.patientId),
        resolvedId: match.patientId,
        matchType: "full_name",
        requiresConfirmation: true,
        matches,
        selectedMatch: match,
      };
    }

    return {
      status: "disambiguation_required",
      matchedText: fullName,
      candidateText: fullName,
      matchType: "full_name",
      matches,
    };
  }
}

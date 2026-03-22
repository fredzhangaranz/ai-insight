import { withCustomerPool } from "@/lib/services/semantic/customer-query.service";
import type { ResolvedEntitySummary } from "@/lib/types/insight-artifacts";
import type { PatientContextBundle } from "@/lib/types/workspace-plan";

const ALL_ACCESS_PREFIX =
  "EXEC sp_set_session_context @key = N'all_access', @value = 1;\n";

type PatientSummaryRow = {
  patientRef: string;
  displayName: string;
  dateOfBirth?: string | null;
  sex?: string | null;
};

type AssessmentRow = {
  id: string;
  date: string;
  status?: string | null;
};

type WoundRow = {
  woundRef: string;
  label: string;
  status?: string | null;
};

function findResolvedPatientId(
  boundParameters?: Record<string, string | number | boolean | null>
): string | null {
  const patientEntry = Object.entries(boundParameters || {}).find(
    ([key, value]) =>
      /^patientid\d*$/i.test(key) &&
      typeof value === "string" &&
      value.length > 0
  );

  return patientEntry?.[1] || null;
}

function calculateAge(dateOfBirth?: string | null): number | undefined {
  if (!dateOfBirth) return undefined;
  const birthDate = new Date(dateOfBirth);
  if (Number.isNaN(birthDate.getTime())) return undefined;

  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  const dayDelta = now.getUTCDate() - birthDate.getUTCDate();
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }
  return age >= 0 ? age : undefined;
}

async function defaultLoader(input: {
  customerId: string;
  resolvedPatientId: string;
  opaqueRef: string;
}): Promise<PatientContextBundle> {
  const { customerId, resolvedPatientId, opaqueRef } = input;

  return withCustomerPool(customerId, async (pool) => {
    const patientResult = await pool.request().input("patientId", resolvedPatientId)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 1
          CAST(p.id AS NVARCHAR(36)) AS patientRef,
          LTRIM(RTRIM(CONCAT(COALESCE(p.firstName, ''), ' ', COALESCE(p.lastName, '')))) AS displayName,
          TRY_CAST(p.dateOfBirth AS NVARCHAR(50)) AS dateOfBirth,
          TRY_CAST(p.gender AS NVARCHAR(50)) AS sex
        FROM rpt.Patient p
        WHERE CAST(p.id AS NVARCHAR(36)) = @patientId
      `);

    const assessmentResult = await pool.request().input("patientId", resolvedPatientId)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 5
          CAST(a.id AS NVARCHAR(36)) AS id,
          TRY_CAST(a.createdUtc AS NVARCHAR(50)) AS date,
          CAST(NULL AS NVARCHAR(50)) AS status
        FROM rpt.Assessment a
        WHERE CAST(a.patientFk AS NVARCHAR(36)) = @patientId
        ORDER BY a.createdUtc DESC
      `);

    const woundResult = await pool.request().input("patientId", resolvedPatientId)
      .query(`${ALL_ACCESS_PREFIX}
        SELECT TOP 5
          CAST(w.id AS NVARCHAR(36)) AS woundRef,
          COALESCE(NULLIF(LTRIM(RTRIM(CAST(w.label AS NVARCHAR(255)))), ''), 'Wound') AS label,
          CAST(NULL AS NVARCHAR(50)) AS status
        FROM rpt.Wound w
        WHERE CAST(w.patientFk AS NVARCHAR(36)) = @patientId
        ORDER BY w.createdUtc DESC
      `);

    const patientRow = patientResult.recordset?.[0] as PatientSummaryRow | undefined;
    if (!patientRow) {
      throw new Error("Resolved patient summary could not be loaded");
    }

    const recentAssessments = (assessmentResult.recordset || []) as AssessmentRow[];
    const woundHighlights = (woundResult.recordset || []) as WoundRow[];

    const primaryFlags: string[] = [];
    if (recentAssessments.length > 0) {
      primaryFlags.push(`${recentAssessments.length} recent assessments`);
    }
    if (woundHighlights.length > 0) {
      primaryFlags.push(`${woundHighlights.length} wounds on record`);
    }

    const timestamp = new Date().toISOString();

    return {
      patientRef: opaqueRef,
      summary: {
        displayName: patientRow.displayName || "Patient",
        age: calculateAge(patientRow.dateOfBirth),
        sex: patientRow.sex || undefined,
        primaryFlags,
      },
      activeProblems: [],
      recentAssessments,
      woundHighlights,
      alerts: [],
      provenance: [
        {
          section: "summary",
          sourceType: "domain_service",
          sourceRef: "rpt.Patient",
          retrievedAt: timestamp,
        },
        {
          section: "recentAssessments",
          sourceType: "domain_service",
          sourceRef: "rpt.Assessment",
          retrievedAt: timestamp,
        },
        {
          section: "woundHighlights",
          sourceType: "domain_service",
          sourceRef: "rpt.Wound",
          retrievedAt: timestamp,
        },
      ],
    };
  });
}

export class PatientContextAssembler {
  constructor(
    private readonly loader: typeof defaultLoader = defaultLoader
  ) {}

  async assemble(input: {
    customerId?: string;
    resolvedEntities?: ResolvedEntitySummary[];
    boundParameters?: Record<string, string | number | boolean | null>;
    authContext?: {
      canViewPatientContext?: boolean;
    };
    timeoutMs?: number;
  }): Promise<PatientContextBundle | null> {
    const {
      customerId,
      resolvedEntities,
      boundParameters,
      authContext,
      timeoutMs = 400,
    } = input;

    if (!customerId) return null;
    if (authContext?.canViewPatientContext === false) return null;

    const patientEntity = resolvedEntities?.find((entity) => entity.kind === "patient");
    if (!patientEntity?.opaqueRef) return null;
    const resolvedPatientId = findResolvedPatientId(boundParameters);
    if (!resolvedPatientId) return null;

    const timeoutPromise = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    });

    const loadPromise = this.loader({
      customerId,
      resolvedPatientId,
      opaqueRef: patientEntity.opaqueRef,
    }).catch(() => null);

    return Promise.race([loadPromise, timeoutPromise]);
  }
}

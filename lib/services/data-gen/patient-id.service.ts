import sql from "mssql";
import type { ConnectionPool, Transaction } from "mssql";

const GENERATED_PATIENT_ID_PREFIX = "IG-";
const GENERATED_ACCESS_CODE_PREFIX = "IG";
const GENERATED_PATIENT_ID_LOCK = "insight-gen-patient-domain-id-sequence";

type RequestSource = ConnectionPool | Transaction;

export interface GeneratedPatientIdentifiers {
  sequenceNumber: number;
  domainId: string;
  accessCode: string;
}

export function formatGeneratedPatientDomainId(sequenceNumber: number): string {
  const digits = String(sequenceNumber).padStart(5, "0");
  return `${GENERATED_PATIENT_ID_PREFIX}${digits}`;
}

export function formatGeneratedPatientAccessCode(sequenceNumber: number): string {
  const encoded = sequenceNumber.toString(36).toUpperCase().padStart(4, "0");
  return `${GENERATED_ACCESS_CODE_PREFIX}${encoded.slice(-4)}`;
}

export function parseGeneratedPatientSequenceNumber(
  domainId: string | null | undefined,
): number | null {
  if (!domainId) return null;
  const trimmed = String(domainId).trim();
  if (!trimmed.startsWith(GENERATED_PATIENT_ID_PREFIX)) return null;
  const suffix = trimmed.slice(GENERATED_PATIENT_ID_PREFIX.length);
  if (!/^\d+$/.test(suffix)) return null;

  const parsed = Number.parseInt(suffix, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildGeneratedPatientIdentifiers(
  startSequenceNumber: number,
  count: number,
): GeneratedPatientIdentifiers[] {
  return Array.from({ length: count }, (_, idx) => {
    const sequenceNumber = startSequenceNumber + idx;
    return {
      sequenceNumber,
      domainId: formatGeneratedPatientDomainId(sequenceNumber),
      accessCode: formatGeneratedPatientAccessCode(sequenceNumber),
    };
  });
}

export async function peekNextPatientSequenceStart(
  db: RequestSource,
): Promise<number> {
  const result = await db.request().query(`
    SELECT ISNULL(
      MAX(
        CASE
          WHEN domainId LIKE '${GENERATED_PATIENT_ID_PREFIX}%'
            AND TRY_CONVERT(int, SUBSTRING(domainId, ${GENERATED_PATIENT_ID_PREFIX.length + 1}, LEN(domainId))) IS NOT NULL
          THEN TRY_CONVERT(int, SUBSTRING(domainId, ${GENERATED_PATIENT_ID_PREFIX.length + 1}, LEN(domainId)))
          ELSE NULL
        END
      ),
      0
    ) AS maxSequence
    FROM dbo.Patient
    WHERE isDeleted = 0
  `);

  const maxSequence = result.recordset[0]?.maxSequence ?? 0;
  return Number(maxSequence) + 1;
}

export async function reserveNextPatientSequenceRange(
  pool: ConnectionPool,
  count: number,
): Promise<{
  transaction: Transaction;
  startSequenceNumber: number;
}> {
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const lockResult = await transaction.request()
      .input("resource", sql.NVarChar, GENERATED_PATIENT_ID_LOCK)
      .query(`
        DECLARE @lockResult int;
        EXEC @lockResult = sp_getapplock
          @Resource = @resource,
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 10000;
        SELECT @lockResult AS lockResult;
      `);

    const applock = Number(lockResult.recordset[0]?.lockResult ?? -999);
    if (applock < 0) {
      throw new Error(`Failed to reserve patient ID range (sp_getapplock=${applock})`);
    }

    const startSequenceNumber = await peekNextPatientSequenceStart(transaction);
    return { transaction, startSequenceNumber };
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

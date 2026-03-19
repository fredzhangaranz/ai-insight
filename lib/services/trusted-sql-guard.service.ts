export interface TrustedSqlGuardInput {
  sql: string;
  patientParamNames?: string[];
  resolvedPatientIds?: string[];
}

export interface TrustedSqlGuardResult {
  valid: boolean;
  message?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateTrustedSql(
  input: TrustedSqlGuardInput
): TrustedSqlGuardResult {
  const patientParamNames = input.patientParamNames || [];
  const resolvedPatientIds = input.resolvedPatientIds || [];

  for (const resolvedPatientId of resolvedPatientIds) {
    const literalPattern = new RegExp(escapeRegExp(resolvedPatientId), "i");
    if (literalPattern.test(input.sql)) {
      return {
        valid: false,
        message:
          "Generated SQL embedded a literal patient identifier instead of using a trusted parameter.",
      };
    }
  }

  for (const patientParamName of patientParamNames) {
    const paramPattern = new RegExp(`@${escapeRegExp(patientParamName)}\\b`, "i");
    if (!paramPattern.test(input.sql)) {
      return {
        valid: false,
        message: `Generated SQL omitted required trusted parameter @${patientParamName}.`,
      };
    }
  }

  return { valid: true };
}

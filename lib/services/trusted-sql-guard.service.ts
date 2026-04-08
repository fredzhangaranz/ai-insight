export interface TrustedSqlGuardInput {
  sql: string;
  patientParamNames?: string[];
  requiredPatientBindings?: string[];
  resolvedPatientIds?: string[];
  resolvedPatientOpaqueRefs?: string[];
}

export interface TrustedSqlGuardResult {
  valid: boolean;
  message?: string;
}

const SQL_KEYWORDS = new Set([
  "as",
  "cross",
  "full",
  "group",
  "having",
  "inner",
  "join",
  "left",
  "on",
  "order",
  "outer",
  "right",
  "union",
  "where",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPatientTableReferences(sql: string): {
  aliases: string[];
  hasBarePatientTable: boolean;
} {
  const aliases = new Set<string>();
  let hasBarePatientTable = false;
  const pattern =
    /\b(?:from|join)\s+rpt\.Patient(?:\s+(?:as\s+)?)?([A-Za-z_][A-Za-z0-9_]*)?/gi;

  for (const match of sql.matchAll(pattern)) {
    const alias = match[1]?.trim();
    if (!alias || SQL_KEYWORDS.has(alias.toLowerCase())) {
      hasBarePatientTable = true;
      continue;
    }
    aliases.add(alias);
  }

  return {
    aliases: Array.from(aliases),
    hasBarePatientTable,
  };
}

function hasAllowedPatientBinding(sql: string, patientParamName: string): boolean {
  const escapedParam = escapeRegExp(`@${patientParamName}`);
  const { aliases, hasBarePatientTable } = extractPatientTableReferences(sql);
  const patterns = [
    new RegExp(
      `(?:^|[^\\w.])(?:[\\w\\[\\]]+\\s*\\.\\s*)?(?:\\[patientFk\\]|patientFk)\\s*=\\s*${escapedParam}\\b`,
      "i"
    ),
    new RegExp(
      `${escapedParam}\\b\\s*=\\s*(?:[\\w\\[\\]]+\\s*\\.\\s*)?(?:\\[patientFk\\]|patientFk)\\b`,
      "i"
    ),
  ];

  for (const alias of aliases) {
    const escapedAlias = escapeRegExp(alias);
    patterns.push(
      new RegExp(
        `\\b${escapedAlias}\\s*\\.\\s*(?:\\[id\\]|id)\\s*=\\s*${escapedParam}\\b`,
        "i"
      ),
      new RegExp(
        `${escapedParam}\\b\\s*=\\s*\\b${escapedAlias}\\s*\\.\\s*(?:\\[id\\]|id)\\b`,
        "i"
      )
    );
  }

  if (hasBarePatientTable) {
    patterns.push(
      new RegExp(
        `(?:^|[^\\w.])(?:rpt\\.Patient\\s*\\.\\s*)?(?:\\[id\\]|id)\\s*=\\s*${escapedParam}\\b`,
        "i"
      ),
      new RegExp(
        `${escapedParam}\\b\\s*=\\s*(?:rpt\\.Patient\\s*\\.\\s*)?(?:\\[id\\]|id)\\b`,
        "i"
      )
    );
  }

  return patterns.some((pattern) => pattern.test(sql));
}

export function validateTrustedSql(
  input: TrustedSqlGuardInput
): TrustedSqlGuardResult {
  const patientParamNames = input.patientParamNames || [];
  const requiredPatientBindings = input.requiredPatientBindings || [];
  const resolvedPatientIds = input.resolvedPatientIds || [];
  const resolvedPatientOpaqueRefs = input.resolvedPatientOpaqueRefs || [];
  const hasResolvedPatientContext =
    resolvedPatientIds.length > 0 ||
    resolvedPatientOpaqueRefs.length > 0 ||
    requiredPatientBindings.length > 0;

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

  for (const opaqueRef of resolvedPatientOpaqueRefs) {
    const literalPattern = new RegExp(`['"]${escapeRegExp(opaqueRef)}['"]`, "i");
    if (literalPattern.test(input.sql)) {
      return {
        valid: false,
        message:
          "Generated SQL embedded a trusted patient opaque reference instead of using a trusted parameter.",
      };
    }
  }

  const effectivePatientBindings =
    requiredPatientBindings.length > 0
      ? requiredPatientBindings
      : patientParamNames;

  if (hasResolvedPatientContext && effectivePatientBindings.length === 0) {
    return {
      valid: false,
      message:
        "Generated SQL omitted the required trusted patient parameter binding.",
    };
  }

  for (const patientParamName of effectivePatientBindings) {
    const paramPattern = new RegExp(`@${escapeRegExp(patientParamName)}\\b`, "i");
    if (!paramPattern.test(input.sql)) {
      return {
        valid: false,
        message: `Generated SQL omitted required trusted parameter @${patientParamName}.`,
      };
    }

    if (!hasAllowedPatientBinding(input.sql, patientParamName)) {
      return {
        valid: false,
        message: /\bdomainId\b/i.test(input.sql)
          ? `Generated SQL used patient domainId for trusted parameter @${patientParamName}. Use patient primary key id or patientFk instead.`
          : `Generated SQL must bind trusted parameter @${patientParamName} through patient primary key id or patientFk.`,
      };
    }
  }

  return { valid: true };
}

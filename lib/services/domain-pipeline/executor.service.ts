import type {
  CompiledQuery,
  ExecutionResult,
} from "@/lib/services/domain-pipeline/types";
import {
  executeCustomerQuery,
  validateAndFixQuery,
} from "@/lib/services/semantic/customer-query.service";

export class DomainExecutorService {
  async execute(
    customerId: string,
    compiledQuery: CompiledQuery
  ): Promise<ExecutionResult> {
    const startedAt = Date.now();

    try {
      const execution = await executeCustomerQuery(
        customerId,
        validateAndFixQuery(compiledQuery.sql),
        compiledQuery.boundParameters
      );
      return {
        rows: execution.rows,
        columns: execution.columns,
        rowCount: execution.rows.length,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        rows: [],
        columns: [],
        rowCount: 0,
        durationMs: Date.now() - startedAt,
        error: {
          message: error instanceof Error ? error.message : "Query execution failed",
          step: "execute_query",
        },
      };
    }
  }
}

export function getDomainExecutorService(): DomainExecutorService {
  return new DomainExecutorService();
}

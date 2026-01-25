/**
 * File: lib/services/audit/sql-validation-audit.service.ts
 * Purpose: Fire-and-forget logging service for SQL validation audit trail
 * Related: Task P0.2 - SQL Validation Logging
 * Dependencies: QueryHistory table, SqlValidationLog table (migration 044)
 */

import { getInsightGenDbPool } from "@/lib/db";

/**
 * SQL error type classification
 */
export type SqlErrorType =
  | 'syntax_error'
  | 'semantic_error'
  | 'missing_column'
  | 'join_failure'
  | 'timeout'
  | 'permission_denied'
  | 'other';

/**
 * Input structure for logging a SQL validation event
 */
export interface LogSqlValidationInput {
  // Link to query (optional - may not exist yet)
  queryHistoryId?: number;
  
  // SQL context
  sqlGenerated: string;
  intentType?: string;       // e.g., 'outcome_analysis', 'trend_analysis'
  mode: string;              // 'template', 'direct', 'funnel'
  
  // Validation result
  isValid: boolean;
  errorType?: SqlErrorType;
  errorMessage?: string;
  errorLine?: number;
  errorColumn?: number;
  
  // Suggestion tracking
  suggestionProvided?: boolean;
  suggestionText?: string;
  suggestionAccepted?: boolean;
  
  // Performance
  validationDurationMs?: number;
}

/**
 * Service for logging SQL validation audit trail
 * Uses fire-and-forget pattern to avoid blocking query execution
 */
export class SqlValidationAuditService {
  /**
   * Truncate string to fit database column limits
   */
  private static truncateToLength(value: string | null | undefined, maxLength: number, fieldName?: string): string | null {
    if (!value) return null;
    if (value.length <= maxLength) return value;
    console.warn(`[SqlValidationAudit] Truncating ${fieldName || 'value'} from ${value.length} to ${maxLength} characters`);
    return value.substring(0, maxLength);
  }

  /**
   * Log a SQL validation event
   * Fire-and-forget: errors are logged but don't throw
   */
  static async logValidation(input: LogSqlValidationInput): Promise<number | null> {
    try {
      const pool = await getInsightGenDbPool();
      
      // Truncate values to fit database column limits
      const intentType = this.truncateToLength(input.intentType, 100, 'intentType');
      const mode = this.truncateToLength(input.mode, 32, 'mode') || input.mode; // mode is required, so fallback to original
      
      const result = await pool.query(
        `
        INSERT INTO "SqlValidationLog" (
          "queryHistoryId",
          "sqlGenerated",
          "intentType",
          "mode",
          "isValid",
          "errorType",
          "errorMessage",
          "errorLine",
          "errorColumn",
          "suggestionProvided",
          "suggestionText",
          "suggestionAccepted",
          "validationDurationMs"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id
        `,
        [
          input.queryHistoryId ?? null,
          input.sqlGenerated,
          intentType,
          mode,
          input.isValid,
          input.errorType ?? null,
          input.errorMessage ?? null,
          input.errorLine ?? null,
          input.errorColumn ?? null,
          input.suggestionProvided ?? false,
          input.suggestionText ?? null,
          input.suggestionAccepted ?? null,
          input.validationDurationMs ?? null,
        ]
      );
      
      const auditId = result.rows[0]?.id ?? null;
      
      console.log('[SqlValidationAudit] Logged validation:', {
        auditId,
        isValid: input.isValid,
        errorType: input.errorType,
        hasQueryHistory: !!input.queryHistoryId,
      });
      
      return auditId;
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      console.error('[SqlValidationAudit] Failed to log validation (non-blocking):', error);
      return null;
    }
  }
  
  /**
   * Log multiple SQL validation events in batch
   * Fire-and-forget: errors are logged but don't throw
   */
  static async logValidationBatch(validations: LogSqlValidationInput[]): Promise<number[]> {
    if (!validations || validations.length === 0) {
      return [];
    }
    
    try {
      const pool = await getInsightGenDbPool();
      
      // Build multi-row insert
      const values: any[] = [];
      const placeholders: string[] = [];
      
      validations.forEach((validation, index) => {
        const baseIndex = index * 13;
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13})`
        );
        
        // Truncate values to fit database column limits
        const intentType = this.truncateToLength(validation.intentType, 100, 'intentType');
        const mode = this.truncateToLength(validation.mode, 32, 'mode') || validation.mode; // mode is required, so fallback to original
        
        values.push(
          validation.queryHistoryId ?? null,
          validation.sqlGenerated,
          intentType,
          mode,
          validation.isValid,
          validation.errorType ?? null,
          validation.errorMessage ?? null,
          validation.errorLine ?? null,
          validation.errorColumn ?? null,
          validation.suggestionProvided ?? false,
          validation.suggestionText ?? null,
          validation.suggestionAccepted ?? null,
          validation.validationDurationMs ?? null
        );
      });
      
      const query = `
        INSERT INTO "SqlValidationLog" (
          "queryHistoryId",
          "sqlGenerated",
          "intentType",
          "mode",
          "isValid",
          "errorType",
          "errorMessage",
          "errorLine",
          "errorColumn",
          "suggestionProvided",
          "suggestionText",
          "suggestionAccepted",
          "validationDurationMs"
        )
        VALUES ${placeholders.join(', ')}
        RETURNING id
      `;
      
      const result = await pool.query(query, values);
      
      console.log('[SqlValidationAudit] Logged validation batch:', {
        count: validations.length,
      });
      
      return result.rows.map((row: any) => row.id);
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      console.error('[SqlValidationAudit] Failed to log validation batch (non-blocking):', error);
      return [];
    }
  }
  
  /**
   * Update suggestion acceptance after user responds
   */
  static async updateSuggestionAcceptance(
    auditId: number,
    accepted: boolean
  ): Promise<void> {
    try {
      const pool = await getInsightGenDbPool();
      
      await pool.query(
        `
        UPDATE "SqlValidationLog"
        SET "suggestionAccepted" = $1
        WHERE id = $2
        `,
        [accepted, auditId]
      );
      
      console.log('[SqlValidationAudit] Updated suggestion acceptance:', {
        auditId,
        accepted,
      });
    } catch (error) {
      console.error('[SqlValidationAudit] Failed to update suggestion acceptance (non-blocking):', error);
    }
  }
  
  /**
   * Link validation to query history after query executes
   */
  static async linkValidationToQuery(
    auditId: number,
    queryHistoryId: number
  ): Promise<void> {
    try {
      const pool = await getInsightGenDbPool();
      
      await pool.query(
        `
        UPDATE "SqlValidationLog"
        SET "queryHistoryId" = $1
        WHERE id = $2
        `,
        [queryHistoryId, auditId]
      );
      
      console.log('[SqlValidationAudit] Linked validation to query:', {
        auditId,
        queryHistoryId,
      });
    } catch (error) {
      console.error('[SqlValidationAudit] Failed to link validation to query (non-blocking):', error);
    }
  }
  
  /**
   * Helper: Classify error type from error message
   */
  static classifyErrorType(errorMessage: string): SqlErrorType {
    const msg = errorMessage.toLowerCase();
    
    if (msg.includes('syntax') || msg.includes('unexpected')) {
      return 'syntax_error';
    }
    if (msg.includes('column') && (msg.includes('not found') || msg.includes('does not exist'))) {
      return 'missing_column';
    }
    if (msg.includes('join') || msg.includes('foreign key')) {
      return 'join_failure';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'timeout';
    }
    if (msg.includes('permission') || msg.includes('denied') || msg.includes('unauthorized')) {
      return 'permission_denied';
    }
    if (msg.includes('ambiguous') || msg.includes('invalid')) {
      return 'semantic_error';
    }
    
    return 'other';
  }
  
  /**
   * Helper: Extract line and column from error message if available
   */
  static extractErrorLocation(errorMessage: string): { line?: number; column?: number } {
    // Try to extract line number: "line 42", "LINE 42", etc.
    const lineMatch = errorMessage.match(/line\s+(\d+)/i);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;
    
    // Try to extract column number: "column 15", "COLUMN 15", "position 15"
    const columnMatch = errorMessage.match(/(column|position)\s+(\d+)/i);
    const column = columnMatch ? parseInt(columnMatch[2], 10) : undefined;
    
    return { line, column };
  }
}

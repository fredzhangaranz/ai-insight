import type { Pool } from "pg";

export type DiscoveryLogLevel = "debug" | "info" | "warn" | "error";

export type DiscoveryLogEntry = {
  timestamp: string;
  level: DiscoveryLogLevel;
  stage: string;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
  durationMs?: number;
};

/**
 * Centralized logger for discovery operations
 * Logs to console AND database for inspection and debugging
 */
export class DiscoveryLogger {
  private runId: string;
  private pool: Pool | null = null;
  private logs: DiscoveryLogEntry[] = [];
  private startTimes: Map<string, number> = new Map();

  constructor(runId: string) {
    this.runId = runId;
  }

  /**
   * Set the database pool for persisting logs
   */
  setPool(pool: Pool): void {
    this.pool = pool;
  }

  /**
   * Log a debug message (verbose, development-time info)
   */
  debug(
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("debug", stage, component, message, metadata);
  }

  /**
   * Log an info message (normal operation progress)
   */
  info(
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("info", stage, component, message, metadata);
  }

  /**
   * Log a warning (potential issue but recovery possible)
   */
  warn(
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("warn", stage, component, message, metadata);
  }

  /**
   * Log an error (operation failed)
   */
  error(
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    this.log("error", stage, component, message, metadata);
  }

  /**
   * Start timing a named operation
   */
  startTimer(operationId: string): void {
    this.startTimes.set(operationId, Date.now());
  }

  /**
   * End timing and log duration
   */
  endTimer(
    operationId: string,
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): number {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      console.warn(`⚠️ Timer "${operationId}" not started`);
      return 0;
    }

    const durationMs = Date.now() - startTime;
    this.startTimes.delete(operationId);

    const entry: DiscoveryLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      stage,
      component,
      message,
      metadata,
      durationMs,
    };

    this.logs.push(entry);
    this.logToConsole(entry);

    // Return duration for immediate use
    return durationMs;
  }

  /**
   * Core logging implementation
   */
  private log(
    level: DiscoveryLogLevel,
    stage: string,
    component: string,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: DiscoveryLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      stage,
      component,
      message,
      metadata,
    };

    this.logs.push(entry);
    this.logToConsole(entry);
  }

  /**
   * Format and log to console with color coding
   */
  private logToConsole(entry: DiscoveryLogEntry): void {
    const levelEmoji: Record<DiscoveryLogLevel, string> = {
      debug: "🔍",
      info: "ℹ️",
      warn: "⚠️",
      error: "❌",
    };

    const emoji = levelEmoji[entry.level];
    const timestamp =
      entry.timestamp.split("T")[1]?.split(".")[0] ?? entry.timestamp;

    let message = `${emoji} [${entry.stage}:${entry.component}] ${entry.message}`;

    if (entry.durationMs !== undefined) {
      message += ` (${entry.durationMs}ms)`;
    }

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      message += ` ${JSON.stringify(entry.metadata)}`;
    }

    const logFn = console[entry.level] ?? console.log;
    logFn(`  [${timestamp}] ${message}`);
  }

  /**
   * Get all collected logs
   */
  getLogs(): DiscoveryLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by stage
   */
  getLogsByStage(stage: string): DiscoveryLogEntry[] {
    return this.logs.filter((log) => log.stage === stage);
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: DiscoveryLogLevel): DiscoveryLogEntry[] {
    return this.logs.filter((log) => log.level === level);
  }

  /**
   * Log a metric/measurement
   */
  logMetric(
    stage: string,
    component: string,
    metricName: string,
    value: number | null | undefined
  ): void {
    this.debug(stage, component, `[Metric] ${metricName}`, {
      metric: metricName,
      value,
    });
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalLogs: number;
    logsByLevel: Record<DiscoveryLogLevel, number>;
    logsByStage: Record<string, number>;
    errors: DiscoveryLogEntry[];
    warnings: DiscoveryLogEntry[];
  } {
    const logsByLevel: Record<DiscoveryLogLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    const logsByStage: Record<string, number> = {};

    for (const log of this.logs) {
      logsByLevel[log.level]++;
      logsByStage[log.stage] = (logsByStage[log.stage] ?? 0) + 1;
    }

    return {
      totalLogs: this.logs.length,
      logsByLevel,
      logsByStage,
      errors: this.logs.filter((log) => log.level === "error"),
      warnings: this.logs.filter((log) => log.level === "warn"),
    };
  }

  /**
   * Persist logs to database
   */
  async persistLogs(): Promise<void> {
    console.log(
      `🔍 DiscoveryLogger.persistLogs() called with ${this.logs.length} logs for runId: ${this.runId}`
    );

    if (!this.pool) {
      console.warn("⚠️ No database pool configured for DiscoveryLogger");
      return;
    }

    if (this.logs.length === 0) {
      console.log("ℹ️ No logs to persist");
      return;
    }

    try {
      console.log(
        `📝 Attempting to persist ${this.logs.length} logs to DiscoveryLog table...`
      );

      // Test database connection first
      const connectionTest = await this.pool.query("SELECT 1 as test");
      console.log("✅ Database connection test successful");

      const result = await this.pool.query(
        `
          INSERT INTO "DiscoveryLog" (
            discovery_run_id,
            level,
            stage,
            component,
            message,
            metadata,
            duration_ms,
            logged_at
          )
          SELECT
            $1,
            t.level,
            t.stage,
            t.component,
            t.message,
            t.metadata,
            t.duration_ms,
            t.timestamp::timestamptz
          FROM jsonb_to_recordset($2::jsonb) AS t(
            timestamp text,
            level text,
            stage text,
            component text,
            message text,
            metadata jsonb,
            duration_ms integer
          )
        `,
        [this.runId, JSON.stringify(this.logs)]
      );

      console.log(
        `✅ Successfully persisted ${result.rowCount} logs to DiscoveryLog table`
      );

      // Verify the logs were actually inserted
      const verifyResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM "DiscoveryLog" WHERE discovery_run_id = $1`,
        [this.runId]
      );
      console.log(
        `🔍 Verification: Found ${verifyResult.rows[0].count} logs in database for runId ${this.runId}`
      );
    } catch (error) {
      console.error("❌ Failed to persist discovery logs:", error);
      const err = error as any;
      console.error("❌ Error details:", {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        hint: err?.hint,
        position: err?.position,
        internalPosition: err?.internalPosition,
        internalQuery: err?.internalQuery,
        where: err?.where,
        schema: err?.schema,
        table: err?.table,
        column: err?.column,
        dataType: err?.dataType,
        constraint: err?.constraint,
        file: err?.file,
        line: err?.line,
        routine: err?.routine,
      });
    }
  }

  /**
   * Print formatted log summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();

    console.log(`
📋 Discovery Logs Summary (Run: ${this.runId})
  ├─ Total logs: ${summary.totalLogs}
  ├─ By level:
  │  ├─ 📝 Info: ${summary.logsByLevel.info}
  │  ├─ 🔍 Debug: ${summary.logsByLevel.debug}
  │  ├─ ⚠️ Warnings: ${summary.logsByLevel.warn}
  │  └─ ❌ Errors: ${summary.logsByLevel.error}
  ├─ By stage:
${Object.entries(summary.logsByStage)
  .map(([stage, count]) => `  │  ├─ ${stage}: ${count}`)
  .join("\n")}
  ${
    summary.errors.length > 0
      ? `└─ ❌ ${summary.errors.length} error(s)`
      : "└─ ✅ No errors"
  }
    `);

    if (summary.errors.length > 0) {
      console.log("\n🔴 Errors:");
      for (const error of summary.errors) {
        console.log(`  - [${error.stage}:${error.component}] ${error.message}`);
      }
    }

    if (summary.warnings.length > 0) {
      console.log("\n🟡 Warnings:");
      for (const warning of summary.warnings) {
        console.log(
          `  - [${warning.stage}:${warning.component}] ${warning.message}`
        );
      }
    }
  }
}

/**
 * Create a new DiscoveryLogger instance
 */
export function createDiscoveryLogger(runId: string): DiscoveryLogger {
  return new DiscoveryLogger(runId);
}

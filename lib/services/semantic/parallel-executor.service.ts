// lib/services/semantic/parallel-executor.service.ts
// Parallel Execution Utility for Performance Optimization (Task 1.1.3)
//
// Provides utilities for executing independent operations in parallel with:
// - AbortController support for early cancellation
// - Timeout protection to prevent hanging operations
// - Error aggregation for partial failures
// - Telemetry for tracking parallel execution performance
//
// See: docs/todos/in-progress/performance-optimization-implementation.md Task 1.1.3

/**
 * Result of a parallel execution task
 */
export interface ParallelTaskResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  duration: number;
  taskName: string;
  canceledBySignal?: boolean;
}

/**
 * Configuration for parallel execution
 */
export interface ParallelExecutionConfig {
  /**
   * Maximum time in milliseconds to wait for all tasks to complete
   * Default: 30000 (30 seconds)
   */
  timeout?: number;

  /**
   * Optional AbortSignal to cancel all tasks
   * When aborted, all pending tasks will be canceled
   */
  signal?: AbortSignal;

  /**
   * Whether to throw an error if any task fails
   * If false, will return partial results with error information
   * Default: false (return partial results)
   */
  throwOnError?: boolean;

  /**
   * Whether to emit telemetry events for tracking
   * Default: true
   */
  emitTelemetry?: boolean;
}

/**
 * Aggregated results from parallel execution
 */
export interface ParallelExecutionResult<T> {
  /**
   * All task results (successful and failed)
   */
  results: ParallelTaskResult<T>[];

  /**
   * Successfully completed tasks
   */
  successful: ParallelTaskResult<T>[];

  /**
   * Failed tasks
   */
  failed: ParallelTaskResult<T>[];

  /**
   * Canceled tasks (aborted by signal or timeout)
   */
  canceled: ParallelTaskResult<T>[];

  /**
   * Total execution time in milliseconds
   */
  totalDuration: number;

  /**
   * Whether all tasks succeeded
   */
  allSucceeded: boolean;

  /**
   * Whether any tasks failed
   */
  anyFailed: boolean;

  /**
   * Whether execution was canceled
   */
  wasCanceled: boolean;
}

/**
 * Parallel Executor Service
 *
 * Executes multiple independent operations in parallel with:
 * - Timeout protection
 * - AbortController integration
 * - Error aggregation
 * - Performance telemetry
 *
 * Example usage:
 *
 * ```typescript
 * const executor = new ParallelExecutorService();
 * const result = await executor.executeInParallel([
 *   { name: 'semantic_search', fn: () => searchSemanticIndex(customerId, concepts) },
 *   { name: 'terminology_mapping', fn: () => mapTerminology(customerId, terms) }
 * ], { timeout: 10000, signal: abortController.signal });
 *
 * if (result.allSucceeded) {
 *   const [semanticResults, terminologyResults] = result.successful.map(r => r.value);
 *   // Use results...
 * } else {
 *   // Handle partial failure...
 *   console.error('Some tasks failed:', result.failed);
 * }
 * ```
 */
export class ParallelExecutorService {
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Execute multiple tasks in parallel with timeout and cancellation support
   *
   * @param tasks Array of tasks to execute in parallel
   * @param config Configuration options
   * @returns Aggregated results from all tasks
   */
  async executeInParallel<T>(
    tasks: Array<{ name: string; fn: () => Promise<T> }>,
    config: ParallelExecutionConfig = {}
  ): Promise<ParallelExecutionResult<T>> {
    const {
      timeout = this.DEFAULT_TIMEOUT,
      signal,
      throwOnError = false,
      emitTelemetry = true,
    } = config;

    if (tasks.length === 0) {
      return this.createEmptyResult();
    }

    const startTime = Date.now();
    const results: ParallelTaskResult<T>[] = [];

    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Parallel execution timeout after ${timeout}ms`)), timeout);
    });

    // Create abort handler
    let abortHandler: (() => void) | null = null;
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortHandler = () => reject(new Error('Parallel execution aborted by signal'));
          signal.addEventListener('abort', abortHandler, { once: true });
        })
      : null;

    try {
      // Execute all tasks in parallel
      const taskPromises = tasks.map(async (task): Promise<ParallelTaskResult<T>> => {
        const taskStart = Date.now();
        try {
          // Check if already aborted
          if (signal?.aborted) {
            return {
              success: false,
              error: new Error('Task canceled before execution'),
              duration: 0,
              taskName: task.name,
              canceledBySignal: true,
            };
          }

          const value = await task.fn();
          const duration = Date.now() - taskStart;

          return {
            success: true,
            value,
            duration,
            taskName: task.name,
          };
        } catch (error) {
          const duration = Date.now() - taskStart;
          const isAbortError = signal?.aborted || error instanceof Error && error.message.includes('abort');

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            duration,
            taskName: task.name,
            canceledBySignal: isAbortError,
          };
        }
      });

      // Race between tasks, timeout, and abort signal
      const racers = [Promise.all(taskPromises), timeoutPromise];
      if (abortPromise) {
        racers.push(abortPromise);
      }

      const taskResults = await Promise.race(racers) as ParallelTaskResult<T>[];
      results.push(...taskResults);
    } catch (error) {
      // Handle timeout or abort
      const isTimeout = error instanceof Error && error.message.includes('timeout');
      const isAbort = error instanceof Error && error.message.includes('abort');

      // Mark all tasks that didn't complete as canceled
      for (let i = 0; i < tasks.length; i++) {
        if (!results[i]) {
          results.push({
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            duration: Date.now() - startTime,
            taskName: tasks[i].name,
            canceledBySignal: isAbort || isTimeout,
          });
        }
      }
    } finally {
      // Clean up abort listener
      if (abortHandler && signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }

    const totalDuration = Date.now() - startTime;
    const result = this.aggregateResults(results, totalDuration);

    // Emit telemetry
    if (emitTelemetry) {
      this.emitTelemetryEvents(result);
    }

    // Throw if configured and any task failed
    if (throwOnError && result.anyFailed) {
      const errorMessages = result.failed.map(f => `${f.taskName}: ${f.error?.message}`).join(', ');
      throw new Error(`Parallel execution failed: ${errorMessages}`);
    }

    return result;
  }

  /**
   * Aggregate individual task results into a summary
   */
  private aggregateResults<T>(
    results: ParallelTaskResult<T>[],
    totalDuration: number
  ): ParallelExecutionResult<T> {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success && !r.canceledBySignal);
    const canceled = results.filter(r => r.canceledBySignal);

    return {
      results,
      successful,
      failed,
      canceled,
      totalDuration,
      allSucceeded: failed.length === 0 && canceled.length === 0,
      anyFailed: failed.length > 0,
      wasCanceled: canceled.length > 0,
    };
  }

  /**
   * Create empty result for edge case of no tasks
   */
  private createEmptyResult<T>(): ParallelExecutionResult<T> {
    return {
      results: [],
      successful: [],
      failed: [],
      canceled: [],
      totalDuration: 0,
      allSucceeded: true,
      anyFailed: false,
      wasCanceled: false,
    };
  }

  /**
   * Emit telemetry events for tracking parallel execution performance
   */
  private emitTelemetryEvents<T>(result: ParallelExecutionResult<T>): void {
    // Log summary
    console.log('[ParallelExecutor] Execution completed:', {
      totalTasks: result.results.length,
      successful: result.successful.length,
      failed: result.failed.length,
      canceled: result.canceled.length,
      totalDuration: result.totalDuration,
    });

    // Log individual task performance
    for (const taskResult of result.results) {
      console.log(`[ParallelExecutor] Task "${taskResult.taskName}":`, {
        success: taskResult.success,
        duration: taskResult.duration,
        canceled: taskResult.canceledBySignal,
        error: taskResult.error?.message,
      });
    }

    // In the future, these events can be sent to a metrics service like:
    // - InfluxDB for time-series metrics
    // - Prometheus for monitoring
    // - CloudWatch/DataDog for alerting
    // For now, we just console.log for visibility during development
  }

  /**
   * Execute two tasks in parallel and return both results
   * Convenience method for common case of exactly 2 parallel tasks
   *
   * @throws Error if either task fails
   */
  async executeTwo<T1, T2>(
    task1: { name: string; fn: () => Promise<T1> },
    task2: { name: string; fn: () => Promise<T2> },
    config: ParallelExecutionConfig = {}
  ): Promise<[T1, T2]> {
    const result = await this.executeInParallel<T1 | T2>(
      [task1 as any, task2 as any],
      { ...config, throwOnError: true }
    );

    const [result1, result2] = result.successful.map(r => r.value!);
    return [result1 as T1, result2 as T2];
  }

  /**
   * Execute three tasks in parallel and return all results
   * Convenience method for common case of exactly 3 parallel tasks
   *
   * @throws Error if any task fails
   */
  async executeThree<T1, T2, T3>(
    task1: { name: string; fn: () => Promise<T1> },
    task2: { name: string; fn: () => Promise<T2> },
    task3: { name: string; fn: () => Promise<T3> },
    config: ParallelExecutionConfig = {}
  ): Promise<[T1, T2, T3]> {
    const result = await this.executeInParallel<T1 | T2 | T3>(
      [task1 as any, task2 as any, task3 as any],
      { ...config, throwOnError: true }
    );

    const [result1, result2, result3] = result.successful.map(r => r.value!);
    return [result1 as T1, result2 as T2, result3 as T3];
  }
}

// Singleton instance
let instance: ParallelExecutorService | null = null;

/**
 * Get the singleton ParallelExecutorService instance
 */
export function getParallelExecutorService(): ParallelExecutorService {
  if (!instance) {
    instance = new ParallelExecutorService();
  }
  return instance;
}

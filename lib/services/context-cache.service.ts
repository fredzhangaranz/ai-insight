/**
 * Context cache management with trimming support.
 * Limits stored result sets to prevent unbounded growth in long conversations.
 */

import type { ConversationContext, ResultSummary } from "@/lib/types/conversation";

// Maximum number of result sets to retain in context cache
export const MAX_CACHED_RESULT_SETS = 10;

/**
 * Trim a context cache to keep only the most recent result sets.
 * Prevents context from growing unboundedly in long conversations.
 *
 * @param contextCache - Existing context cache from database
 * @param maxResults - Maximum number of result sets to retain (default: 10)
 * @returns Trimmed context cache
 */
export function trimContextCache(
  contextCache: ConversationContext,
  maxResults: number = MAX_CACHED_RESULT_SETS
): ConversationContext {
  if (!Array.isArray(contextCache.referencedResultSets)) {
    return contextCache;
  }

  if (contextCache.referencedResultSets.length <= maxResults) {
    return contextCache;
  }

  return {
    ...contextCache,
    referencedResultSets: contextCache.referencedResultSets.slice(-maxResults),
  };
}

/**
 * Add a new result set to the context cache with automatic trimming.
 * Removes duplicates by message ID before adding the new one.
 *
 * @param existingCache - Current context cache
 * @param newResultSet - New result set to add
 * @param maxResults - Maximum number of result sets to retain
 * @returns Updated context cache with trimming applied
 */
export function addResultToCache(
  existingCache: ConversationContext,
  newResultSet: {
    messageId: string;
    rowCount: number;
    columns: string[];
    entityHashes?: string[];
  },
  maxResults: number = MAX_CACHED_RESULT_SETS
): ConversationContext {
  const existingReferenced = Array.isArray(existingCache.referencedResultSets)
    ? existingCache.referencedResultSets
    : [];

  // Remove old entry with same message ID (handle updates)
  const filtered = existingReferenced.filter(
    (entry) => entry.messageId !== newResultSet.messageId
  );

  // Add new result set
  const updated = [...filtered, newResultSet];

  // Trim to max size
  const trimmed = updated.slice(-maxResults);

  return {
    ...existingCache,
    referencedResultSets: trimmed,
  };
}

/**
 * Get the most recent result set from the cache.
 * Useful for finding the last query's result metadata.
 */
export function getLastResultSet(
  contextCache: ConversationContext
): ConversationContext["referencedResultSets"][0] | undefined {
  if (!Array.isArray(contextCache.referencedResultSets)) {
    return undefined;
  }

  return contextCache.referencedResultSets[
    contextCache.referencedResultSets.length - 1
  ];
}

/**
 * Clear all result sets from the cache.
 * Keeps other context like activeFilters and timeRange.
 */
export function clearResultSetCache(
  contextCache: ConversationContext
): ConversationContext {
  return {
    ...contextCache,
    referencedResultSets: [],
  };
}

/**
 * Calculate cache size in characters (approximate).
 * Useful for monitoring cache growth.
 */
export function estimateCacheSize(contextCache: ConversationContext): number {
  return JSON.stringify(contextCache).length;
}

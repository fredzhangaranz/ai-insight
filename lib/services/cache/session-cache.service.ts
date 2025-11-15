// lib/services/cache/session-cache.service.ts
// Session-Based Cache Service for Performance Optimization (Task 1.3)
//
// Provides in-memory caching for query results with clarification-aware keys.
// This is the first caching layer (fastest) before Redis (Task 2.1).
//
// Key Features:
// - Clarification-aware cache keys (respects Adaptive Query Resolution)
// - Multi-dimensional keys: customer + schema + model + prompt + clarifications + question
// - LRU eviction when size limit reached
// - TTL-based expiration (default: 30 minutes)
// - Cache statistics for monitoring
//
// See: docs/todos/in-progress/performance-optimization-implementation.md Task 1.3
// See: docs/design/semantic_layer/PERFORMANCE_OPTIMIZATION.md lines 742-875

import { createHash } from 'crypto';
import type { OrchestrationResult } from '../semantic/three-mode-orchestrator.service';

/**
 * Clarification selection from user
 * Used to create unique cache keys for queries with different clarification choices
 */
export interface ClarificationSelection {
  id: string;
  optionId?: string;
  customValue?: string;
}

/**
 * Input for generating cache key
 * All dimensions that affect query results
 */
export interface CacheKeyInput {
  customerId: string;
  question: string;
  modelId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  clarifications?: ClarificationSelection[];
}

/**
 * Cached result with metadata
 */
interface CachedResult {
  key: string;
  result: OrchestrationResult;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  memoryUsageMB: number;
  oldestEntryAge: number;
  newestEntryAge: number;
}

/**
 * Session Cache Service
 *
 * In-memory cache for query results with clarification-aware keys.
 * This is the fastest caching layer (< 100ms latency).
 *
 * Cache Key Structure:
 * {customerId}:{schemaVersion}:{modelId}:{promptVersion}:{clarificationHash}:{normalizedQuestion}
 *
 * Example:
 * cust123:schema_v2:claude-sonnet:prompt_v1:abc123ef:how_many_patients
 *
 * The clarification hash ensures that:
 * - "Show patients" with "Last 6 months" → Different cache key
 * - "Show patients" with "Last year" → Different cache key
 * - Same clarifications in different order → Same cache key (deterministic)
 */
export class SessionCacheService {
  private cache: Map<string, CachedResult> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  // Statistics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(config?: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = config?.maxSize || 100; // Default: 100 entries
    this.ttlMs = config?.ttlMs || 30 * 60 * 1000; // Default: 30 minutes
  }

  /**
   * Hash clarification selections into a deterministic short string
   *
   * Algorithm:
   * 1. Sort clarifications by ID (deterministic order)
   * 2. Serialize to string: "id:optionId:customValue|..."
   * 3. Hash with SHA1
   * 4. Take first 8 characters
   *
   * This ensures:
   * - Same clarifications in different order → Same hash
   * - Different clarifications → Different hash
   * - Collision rate: ~1 in 4 billion (acceptable for session cache)
   */
  private hashClarifications(clarifications?: ClarificationSelection[]): string {
    if (!clarifications || clarifications.length === 0) {
      return 'no_clarifications';
    }

    // Sort by ID for deterministic ordering
    const sorted = [...clarifications].sort((a, b) => a.id.localeCompare(b.id));

    // Serialize: "id:optionId:customValue"
    const serialized = sorted
      .map(({ id, optionId, customValue }) => {
        return `${id}:${optionId ?? ''}:${customValue ?? ''}`;
      })
      .join('|');

    // Hash with SHA1 and take first 8 characters
    return createHash('sha1').update(serialized).digest('hex').slice(0, 8);
  }

  /**
   * Normalize question for cache key
   *
   * Normalization:
   * - Convert to lowercase
   * - Trim whitespace
   * - Replace multiple spaces with single space
   * - Remove special characters except alphanumeric, spaces, and basic punctuation
   *
   * This ensures:
   * - "How many patients?" === "how many patients?" === "How  many  patients?"
   * - But "How many patients?" !== "How many patients in 2023?"
   */
  private normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/[^a-z0-9_?]/g, '') // Remove special chars except ? and _
      .slice(0, 100); // Limit length for cache key size
  }

  /**
   * Generate cache key from input dimensions
   *
   * Cache key format:
   * {customerId}:{schemaVersion}:{modelId}:{promptVersion}:{clarificationHash}:{normalizedQuestion}
   *
   * Each dimension affects query results:
   * - customerId: Different customers have different schemas
   * - schemaVersion: Schema changes invalidate old results
   * - modelId: Different models may generate different SQL
   * - promptVersion: Prompt changes may affect output
   * - clarificationHash: Different clarifications produce different results
   * - normalizedQuestion: The actual question
   */
  private getCacheKey(input: CacheKeyInput): string {
    const parts = [
      input.customerId,
      input.schemaVersion ?? 'schema_unknown',
      input.modelId ?? 'model_auto',
      input.promptVersion ?? 'prompt_v1',
      this.hashClarifications(input.clarifications),
      this.normalizeQuestion(input.question),
    ];

    return parts.join(':');
  }

  /**
   * Get cached result
   *
   * Returns null if:
   * - Key not found
   * - Entry expired (TTL exceeded)
   *
   * Updates access statistics on hit
   */
  get(input: CacheKeyInput): OrchestrationResult | null {
    const key = this.getCacheKey(input);
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.ttlMs) {
      // Expired - remove from cache
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Cache hit!
    this.hits++;
    entry.accessCount++;
    entry.lastAccessed = Date.now();

    console.log(`[SessionCache] ✅ Cache HIT`, {
      key: key.slice(0, 60) + '...',
      age_ms: age,
      access_count: entry.accessCount,
      hit_rate: this.getHitRate(),
    });

    return entry.result;
  }

  /**
   * Store result in cache
   *
   * Behavior:
   * - If cache is full, evict LRU entry first
   * - Update entry if key already exists
   * - Track storage timestamp for TTL
   */
  set(input: CacheKeyInput, result: OrchestrationResult): void {
    const key = this.getCacheKey(input);

    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    // Store entry
    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    });

    console.log(`[SessionCache] 💾 Stored result`, {
      key: key.slice(0, 60) + '...',
      cache_size: this.cache.size,
      max_size: this.maxSize,
    });
  }

  /**
   * Evict least recently used (LRU) entry
   *
   * Algorithm:
   * - Find entry with oldest lastAccessed timestamp
   * - Remove from cache
   * - Increment eviction counter
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;

      console.log(`[SessionCache] 🗑️ Evicted LRU entry`, {
        key: oldestKey.slice(0, 60) + '...',
        age_ms: Date.now() - oldestTime,
        evictions_total: this.evictions,
      });
    }
  }

  /**
   * Invalidate cache entries
   *
   * Supports:
   * - Invalidate all entries for a customer
   * - Invalidate all entries for a schema version
   * - Invalidate entire cache
   */
  invalidate(filter?: {
    customerId?: string;
    schemaVersion?: string;
  }): number {
    if (!filter) {
      // Clear entire cache
      const count = this.cache.size;
      this.cache.clear();
      console.log(`[SessionCache] 🗑️ Cleared entire cache (${count} entries)`);
      return count;
    }

    // Filter-based invalidation
    let count = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const parts = key.split(':');
      const [entryCustomerId, entrySchemaVersion] = parts;

      let shouldDelete = false;

      if (filter.customerId && entryCustomerId === filter.customerId) {
        shouldDelete = true;
      }

      if (filter.schemaVersion && entrySchemaVersion === filter.schemaVersion) {
        shouldDelete = true;
      }

      if (shouldDelete) {
        keysToDelete.push(key);
      }
    }

    // Delete matching entries
    for (const key of keysToDelete) {
      this.cache.delete(key);
      count++;
    }

    console.log(`[SessionCache] 🗑️ Invalidated ${count} entries`, filter);
    return count;
  }

  /**
   * Get cache statistics
   *
   * Useful for:
   * - Monitoring cache effectiveness
   * - Tuning cache size
   * - Debugging cache issues
   */
  getStats(): CacheStats {
    const now = Date.now();
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }

    // Estimate memory usage (rough approximation)
    const avgEntrySize = 5000; // ~5KB per entry (SQL + results + metadata)
    const memoryUsageMB = (this.cache.size * avgEntrySize) / (1024 * 1024);

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      evictions: this.evictions,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
      oldestEntryAge: Math.round(oldestAge / 1000), // in seconds
      newestEntryAge: newestAge === Infinity ? 0 : Math.round(newestAge / 1000),
    };
  }

  /**
   * Get cache hit rate as percentage
   */
  private getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return Math.round((this.hits / total) * 100 * 100) / 100; // 2 decimal places
  }

  /**
   * Clear statistics (useful for testing)
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}

// Singleton instance
let instance: SessionCacheService | null = null;

/**
 * Get the singleton SessionCacheService instance
 */
export function getSessionCacheService(): SessionCacheService {
  if (!instance) {
    instance = new SessionCacheService({
      maxSize: 100, // 100 entries
      ttlMs: 30 * 60 * 1000, // 30 minutes
    });
  }
  return instance;
}

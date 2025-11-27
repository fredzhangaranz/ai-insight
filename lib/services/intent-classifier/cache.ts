/**
 * Intent Classifier Cache
 *
 * In-memory cache for intent classification results to improve performance.
 * Separate caches for pattern-based and AI-based results with TTL management.
 *
 * Pattern: Follows existing IntentClassificationServiceCache pattern
 * Reference: lib/services/context-discovery/intent-classifier.service.ts:547-606
 *
 * Created: 2025-11-27
 * Purpose: Task 2.8 - Cache Implementation
 */

import { createHash } from "crypto";
import type { IntentClassificationResult } from "./intent-classifier.service";

/**
 * Cache entry with expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Intent Classifier Cache
 *
 * Caches classification results with separate TTLs for pattern and AI results.
 * Uses SHA-256 hashed keys for security and automatic expiration cleanup.
 */
export class IntentClassifierCache {
  private patternCache = new Map<string, CacheEntry<IntentClassificationResult>>();
  private aiCache = new Map<string, CacheEntry<IntentClassificationResult>>();

  private readonly PATTERN_CACHE_TTL = 60 * 60 * 1000; // 60 minutes
  private readonly AI_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

  /**
   * Generate cache key from question and customer ID
   *
   * Uses SHA-256 to avoid cache key collisions and protect sensitive data.
   *
   * @param question - User's question
   * @param customerId - Customer ID
   * @returns SHA-256 hash of the cache key
   */
  private generateCacheKey(question: string, customerId: string): string {
    return createHash("sha256")
      .update(`${customerId}:${question}`)
      .digest("hex");
  }

  /**
   * Get cached classification result
   *
   * Tries pattern cache first (faster), then AI cache.
   *
   * @param question - User's question
   * @param customerId - Customer ID
   * @returns Cached result or null if not found/expired
   */
  getResult(question: string, customerId: string): IntentClassificationResult | null {
    const key = this.generateCacheKey(question, customerId);

    // Try pattern cache first (faster)
    const patternResult = this.get(this.patternCache, key);
    if (patternResult) return patternResult;

    // Fall back to AI cache
    return this.get(this.aiCache, key);
  }

  /**
   * Set classification result in cache
   *
   * Routes to pattern or AI cache based on result method.
   *
   * @param question - User's question
   * @param customerId - Customer ID
   * @param result - Classification result to cache
   */
  setResult(
    question: string,
    customerId: string,
    result: IntentClassificationResult
  ): void {
    const key = this.generateCacheKey(question, customerId);
    const cache = result.method === 'pattern' ? this.patternCache : this.aiCache;
    const ttl = result.method === 'pattern' ? this.PATTERN_CACHE_TTL : this.AI_CACHE_TTL;
    this.set(cache, key, result, ttl);
  }

  /**
   * Clean up expired cache entries
   *
   * Called periodically (every 10 minutes) to prevent memory leaks.
   */
  cleanupExpired(): void {
    const now = Date.now();

    // Clean pattern cache
    const patternKeys = Array.from(this.patternCache.keys());
    for (const key of patternKeys) {
      const entry = this.patternCache.get(key);
      if (entry && now > entry.expiresAt) {
        this.patternCache.delete(key);
      }
    }

    // Clean AI cache
    const aiKeys = Array.from(this.aiCache.keys());
    for (const key of aiKeys) {
      const entry = this.aiCache.get(key);
      if (entry && now > entry.expiresAt) {
        this.aiCache.delete(key);
      }
    }
  }

  /**
   * Get value from cache
   *
   * @param cache - Cache map to get from
   * @param key - Cache key
   * @returns Cached value or null if not found/expired
   */
  private get<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set value in cache
   *
   * @param cache - Cache map to set in
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttlMs - Time to live in milliseconds
   */
  private set<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    value: T,
    ttlMs: number
  ): void {
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

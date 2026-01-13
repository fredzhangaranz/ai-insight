/**
 * File: lib/services/audit/__tests__/audit-cache.test.ts
 * Purpose: Unit tests for audit cache service (Task P0.3)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditCache, clearAuditCache } from "../audit-cache";

describe("getAuditCache", () => {
  beforeEach(() => {
    clearAuditCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAuditCache();
  });

  it("returns cached value when available and not expired", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "test" });

    // First call - cache miss
    const result1 = await getAuditCache("key1", 60_000, loader);
    expect(result1).toEqual({ data: "test" });
    expect(loader).toHaveBeenCalledTimes(1);

    // Second call - cache hit
    const result2 = await getAuditCache("key1", 60_000, loader);
    expect(result2).toEqual({ data: "test" });
    expect(loader).toHaveBeenCalledTimes(1); // Not called again
  });

  it("calls loader when cache miss", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "new" });

    const result = await getAuditCache("key2", 60_000, loader);

    expect(result).toEqual({ data: "new" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("calls loader when cache expired", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "test" });

    // First call
    await getAuditCache("key3", 60_000, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Advance time past TTL
    vi.advanceTimersByTime(61_000);

    // Second call - cache expired, loader called again
    const result = await getAuditCache("key3", 60_000, loader);
    expect(result).toEqual({ data: "test" });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("handles different cache keys independently", async () => {
    const loader1 = vi.fn().mockResolvedValue({ data: "key1" });
    const loader2 = vi.fn().mockResolvedValue({ data: "key2" });

    const result1 = await getAuditCache("key-a", 60_000, loader1);
    const result2 = await getAuditCache("key-b", 60_000, loader2);

    expect(result1).toEqual({ data: "key1" });
    expect(result2).toEqual({ data: "key2" });
    expect(loader1).toHaveBeenCalledTimes(1);
    expect(loader2).toHaveBeenCalledTimes(1);
  });

  it("handles async loader functions", async () => {
    const loader = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: "async" }), 100);
        })
    );

    const result = await getAuditCache("key4", 60_000, loader);

    expect(result).toEqual({ data: "async" });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("handles loader errors and does not cache them", async () => {
    const loader = vi.fn().mockRejectedValue(new Error("Loader failed"));

    await expect(getAuditCache("key5", 60_000, loader)).rejects.toThrow(
      "Loader failed"
    );

    // Error should not be cached
    const loader2 = vi.fn().mockResolvedValue({ data: "success" });
    const result = await getAuditCache("key5", 60_000, loader2);

    expect(result).toEqual({ data: "success" });
    expect(loader2).toHaveBeenCalledTimes(1);
  });

  it("respects different TTL values per key", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "test" });

    // Cache with 30s TTL
    await getAuditCache("key6", 30_000, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Advance 25s - still cached
    vi.advanceTimersByTime(25_000);
    await getAuditCache("key6", 30_000, loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Advance another 10s - expired
    vi.advanceTimersByTime(10_000);
    await getAuditCache("key6", 30_000, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("caches null values", async () => {
    const loader = vi.fn().mockResolvedValue(null);

    const result1 = await getAuditCache("key7", 60_000, loader);
    expect(result1).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);

    const result2 = await getAuditCache("key7", 60_000, loader);
    expect(result2).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1); // Cached
  });

  it("caches complex objects", async () => {
    const complexData = {
      queries: [{ id: 1 }, { id: 2 }],
      total: 2,
      metadata: { timestamp: Date.now() },
    };
    const loader = vi.fn().mockResolvedValue(complexData);

    const result = await getAuditCache("key8", 60_000, loader);
    expect(result).toEqual(complexData);
    expect(loader).toHaveBeenCalledTimes(1);

    const result2 = await getAuditCache("key8", 60_000, loader);
    expect(result2).toEqual(complexData);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("clearAuditCache", () => {
  beforeEach(() => {
    clearAuditCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAuditCache();
  });

  it("clears all cached entries", async () => {
    const loader = vi.fn().mockResolvedValue({ data: "test" });

    await getAuditCache("key1", 60_000, loader);
    await getAuditCache("key2", 60_000, loader);
    expect(loader).toHaveBeenCalledTimes(2);

    clearAuditCache();

    // After clear, loader should be called again
    await getAuditCache("key1", 60_000, loader);
    await getAuditCache("key2", 60_000, loader);
    expect(loader).toHaveBeenCalledTimes(4);
  });
});

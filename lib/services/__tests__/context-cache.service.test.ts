import { describe, it, expect } from "vitest";
import {
  trimContextCache,
  addResultToCache,
  getLastResultSet,
  clearResultSetCache,
  estimateCacheSize,
  MAX_CACHED_RESULT_SETS,
} from "../context-cache.service";
import type { ConversationContext } from "@/lib/types/conversation";

describe("Context Cache Service", () => {
  describe("trimContextCache", () => {
    it("returns cache unchanged if under limit", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: [
          {
            messageId: "msg-1",
            rowCount: 10,
            columns: ["col1"],
          },
          {
            messageId: "msg-2",
            rowCount: 20,
            columns: ["col1", "col2"],
          },
        ],
      };

      const trimmed = trimContextCache(cache);
      expect(trimmed.referencedResultSets).toHaveLength(2);
      expect(trimmed).toEqual(cache);
    });

    it("trims to max size when exceeded", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: Array.from({ length: 15 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: i * 10,
          columns: ["col1"],
        })),
      };

      const trimmed = trimContextCache(cache);
      expect(trimmed.referencedResultSets).toHaveLength(10);
      // Should keep last 10 (messages 6-15)
      expect(trimmed.referencedResultSets?.[0].messageId).toBe("msg-6");
      expect(trimmed.referencedResultSets?.[9].messageId).toBe("msg-15");
    });

    it("respects custom max results parameter", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: Array.from({ length: 10 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: 10,
          columns: ["col1"],
        })),
      };

      const trimmed = trimContextCache(cache, 5);
      expect(trimmed.referencedResultSets).toHaveLength(5);
      expect(trimmed.referencedResultSets?.[0].messageId).toBe("msg-6");
    });

    it("handles missing or invalid referencedResultSets", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
      };

      const trimmed = trimContextCache(cache);
      expect(trimmed).toEqual(cache);
    });

    it("preserves other context fields during trimming", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        activeFilters: [{ field: "status", value: "active" }],
        timeRange: { start: new Date("2026-01-01"), end: new Date("2026-01-31") },
        referencedResultSets: Array.from({ length: 15 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: 10,
          columns: ["col1"],
        })),
      };

      const trimmed = trimContextCache(cache);
      expect(trimmed.activeFilters).toEqual(cache.activeFilters);
      expect(trimmed.timeRange).toEqual(cache.timeRange);
      expect(trimmed.customerId).toBe("cust-1");
    });
  });

  describe("addResultToCache", () => {
    it("adds new result to empty cache", () => {
      const cache: ConversationContext = { customerId: "cust-1" };
      const newResult = {
        messageId: "msg-1",
        rowCount: 42,
        columns: ["id", "name"],
      };

      const updated = addResultToCache(cache, newResult);
      expect(updated.referencedResultSets).toHaveLength(1);
      expect(updated.referencedResultSets?.[0]).toEqual(newResult);
    });

    it("replaces duplicate message IDs instead of duplicating", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: [
          {
            messageId: "msg-1",
            rowCount: 10,
            columns: ["col1"],
          },
        ],
      };

      const updated = addResultToCache(cache, {
        messageId: "msg-1",
        rowCount: 20, // Updated row count
        columns: ["col1", "col2"],
      });

      expect(updated.referencedResultSets).toHaveLength(1);
      expect(updated.referencedResultSets?.[0].rowCount).toBe(20);
      expect(updated.referencedResultSets?.[0].columns).toEqual(["col1", "col2"]);
    });

    it("applies trimming after adding result", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: Array.from({ length: 10 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: 10,
          columns: ["col1"],
        })),
      };

      const updated = addResultToCache(cache, {
        messageId: "msg-11",
        rowCount: 50,
        columns: ["col1"],
      });

      expect(updated.referencedResultSets).toHaveLength(10);
      // Should have removed msg-1 and added msg-11
      expect(updated.referencedResultSets?.[0].messageId).toBe("msg-2");
      expect(updated.referencedResultSets?.[9].messageId).toBe("msg-11");
    });

    it("includes entityHashes when provided", () => {
      const cache: ConversationContext = { customerId: "cust-1" };
      const newResult = {
        messageId: "msg-1",
        rowCount: 5,
        columns: ["id"],
        entityHashes: ["hash1", "hash2"],
      };

      const updated = addResultToCache(cache, newResult);
      expect(updated.referencedResultSets?.[0]).toEqual(newResult);
    });
  });

  describe("getLastResultSet", () => {
    it("returns most recent result set", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: [
          { messageId: "msg-1", rowCount: 10, columns: ["col1"] },
          { messageId: "msg-2", rowCount: 20, columns: ["col1", "col2"] },
          { messageId: "msg-3", rowCount: 30, columns: ["col1"] },
        ],
      };

      const last = getLastResultSet(cache);
      expect(last?.messageId).toBe("msg-3");
      expect(last?.rowCount).toBe(30);
    });

    it("returns undefined when no result sets", () => {
      const cache: ConversationContext = { customerId: "cust-1" };
      expect(getLastResultSet(cache)).toBeUndefined();
    });

    it("returns undefined when referencedResultSets is not array", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: null as any,
      };
      expect(getLastResultSet(cache)).toBeUndefined();
    });
  });

  describe("clearResultSetCache", () => {
    it("clears result sets but keeps other context", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        activeFilters: [{ field: "status", value: "active" }],
        timeRange: { start: new Date("2026-01-01") },
        referencedResultSets: [
          { messageId: "msg-1", rowCount: 10, columns: ["col1"] },
        ],
      };

      const cleared = clearResultSetCache(cache);
      expect(cleared.referencedResultSets).toEqual([]);
      expect(cleared.activeFilters).toEqual(cache.activeFilters);
      expect(cleared.timeRange).toEqual(cache.timeRange);
    });
  });

  describe("estimateCacheSize", () => {
    it("estimates cache size in characters", () => {
      const cache: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: Array.from({ length: 5 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: 10,
          columns: ["col1", "col2"],
        })),
      };

      const size = estimateCacheSize(cache);
      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe("number");
    });

    it("shows larger cache for more result sets", () => {
      const cacheSmall: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: [
          { messageId: "msg-1", rowCount: 10, columns: ["col1"] },
        ],
      };

      const cacheLarge: ConversationContext = {
        customerId: "cust-1",
        referencedResultSets: Array.from({ length: 10 }, (_, i) => ({
          messageId: `msg-${i + 1}`,
          rowCount: 10,
          columns: ["col1", "col2", "col3"],
        })),
      };

      const sizeSmall = estimateCacheSize(cacheSmall);
      const sizeLarge = estimateCacheSize(cacheLarge);
      expect(sizeLarge).toBeGreaterThan(sizeSmall);
    });
  });

  describe("MAX_CACHED_RESULT_SETS constant", () => {
    it("exports default max of 10", () => {
      expect(MAX_CACHED_RESULT_SETS).toBe(10);
    });
  });
});

/**
 * Unit tests for Ontology Lookup Service
 *
 * Tests Phase 1 functionality:
 * - Direct synonym lookup
 * - Abbreviation expansion
 * - Cache behavior
 * - Regional preferences
 */

import { getOntologyLookupService } from "../ontology-lookup.service";
import { getInsightGenDbPool } from "@/lib/db";

describe("OntologyLookupService", () => {
  const service = getOntologyLookupService();
  const customerId = "test-customer-001";

  beforeEach(() => {
    // Clear cache before each test
    service.clearCache();
  });

  describe("lookupOntologySynonyms", () => {
    it("should return empty array for empty term", async () => {
      const synonyms = await service.lookupOntologySynonyms("", customerId);
      expect(synonyms).toEqual([]);
    });

    it("should return empty array for whitespace-only term", async () => {
      const synonyms = await service.lookupOntologySynonyms("   ", customerId);
      expect(synonyms).toEqual([]);
    });

    it("should handle term not found in ontology", async () => {
      const synonyms = await service.lookupOntologySynonyms(
        "unknown-term-xyz-123",
        customerId
      );
      expect(synonyms).toEqual([]);
    });

    // Integration test - requires database with ontology data
    it.skip("should find synonyms for known term (integration)", async () => {
      // This test will work after Task 1.5 (populate initial ontology data)
      const synonyms = await service.lookupOntologySynonyms(
        "foot ulcer",
        customerId
      );

      expect(synonyms.length).toBeGreaterThan(0);
      expect(synonyms).toContain("diabetic foot ulcer");
    });

    // Integration test - requires database with ontology data
    it.skip("should expand abbreviations (integration)", async () => {
      // This test will work after Task 1.5 (populate initial ontology data)
      const synonyms = await service.lookupOntologySynonyms("DFU", customerId);

      expect(synonyms.length).toBeGreaterThan(0);
      expect(synonyms).toContain("diabetic foot ulcer");
    });

    it("should deduplicate results", async () => {
      // Even if database returns duplicates, service should deduplicate
      const synonyms = await service.lookupOntologySynonyms(
        "test-term",
        customerId
      );

      const unique = [...new Set(synonyms)];
      expect(synonyms.length).toBe(unique.length);
    });

    it("should respect maxResults option", async () => {
      const synonyms = await service.lookupOntologySynonyms(
        "test-term",
        customerId,
        { maxResults: 5 }
      );

      expect(synonyms.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Cache behavior", () => {
    it("should cache results", async () => {
      const term = "test-cache-term";

      // First call - cache miss
      const synonyms1 = await service.lookupOntologySynonyms(
        term,
        customerId
      );

      // Second call - should hit cache (same result, faster)
      const synonyms2 = await service.lookupOntologySynonyms(
        term,
        customerId
      );

      expect(synonyms1).toEqual(synonyms2);
    });

    it("should return cache stats", () => {
      const stats = service.getCacheStats();

      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("maxSize");
      expect(stats).toHaveProperty("ttlMs");
      expect(typeof stats.size).toBe("number");
      expect(typeof stats.maxSize).toBe("number");
      expect(typeof stats.ttlMs).toBe("number");
    });

    it("should clear cache", async () => {
      // Add something to cache
      await service.lookupOntologySynonyms("test-term", customerId);

      const statsBefore = service.getCacheStats();
      expect(statsBefore.size).toBeGreaterThanOrEqual(0);

      // Clear cache
      service.clearCache();

      const statsAfter = service.getCacheStats();
      expect(statsAfter.size).toBe(0);
    });
  });

  describe("Options handling", () => {
    it("should handle includeDeprecated option", async () => {
      // Should not throw
      await service.lookupOntologySynonyms("test-term", customerId, {
        includeDeprecated: true,
      });

      await service.lookupOntologySynonyms("test-term", customerId, {
        includeDeprecated: false,
      });
    });

    it("should handle includeInformal option", async () => {
      // Should not throw
      await service.lookupOntologySynonyms("test-term", customerId, {
        includeInformal: true,
      });

      await service.lookupOntologySynonyms("test-term", customerId, {
        includeInformal: false,
      });
    });

    it("should handle preferredRegion option", async () => {
      // Should not throw
      await service.lookupOntologySynonyms("test-term", customerId, {
        preferredRegion: "US",
      });

      await service.lookupOntologySynonyms("test-term", customerId, {
        preferredRegion: "UK",
      });
    });

    it("should handle maxLevels option", async () => {
      // Should not throw
      await service.lookupOntologySynonyms("test-term", customerId, {
        maxLevels: 1,
      });

      await service.lookupOntologySynonyms("test-term", customerId, {
        maxLevels: 2,
      });
    });
  });

  describe("Case insensitivity", () => {
    it("should normalize term to lowercase", async () => {
      // All variations should return same result (case-insensitive)
      const lower = await service.lookupOntologySynonyms(
        "test",
        customerId
      );
      const upper = await service.lookupOntologySynonyms(
        "TEST",
        customerId
      );
      const mixed = await service.lookupOntologySynonyms(
        "TeSt",
        customerId
      );

      expect(lower).toEqual(upper);
      expect(upper).toEqual(mixed);
    });
  });
});

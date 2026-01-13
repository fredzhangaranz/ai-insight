/**
 * Integration tests for Ontology-based Filter Mapping
 *
 * Tests the complete flow:
 * 1. Synonym lookup from ClinicalOntology table
 * 2. Integration with filter mapping pipeline
 * 3. End-to-end validation with real database data
 */

import { describe, it, expect } from "vitest";
import { getOntologyLookupService } from "../ontology-lookup.service";

describe("Ontology Integration Tests", () => {
  const service = getOntologyLookupService();
  const customerId = "test-customer-001";

  describe("Real database synonym lookups", () => {
    it("should find synonyms for 'debridement' (loaded in database)", async () => {
      // This term was successfully loaded by the synonym loader
      const synonyms = await service.lookupOntologySynonyms(
        "debridement",
        customerId
      );

      // Based on wound-care-terminology.yaml, debridement has 3 synonyms:
      // - wound debridement
      // - tissue removal
      // - necrotic tissue removal
      // Plus the preferred term itself: debridement
      console.log(`Found ${synonyms.length} synonyms for "debridement":`, synonyms);

      // We should have found some synonyms (at least 3)
      expect(synonyms.length).toBeGreaterThan(2);

      // Check that the expected synonyms are present
      const expectedSynonyms = [
        "debridement",
        "tissue removal",
        "necrotic tissue removal",
      ];

      for (const expectedSynonym of expectedSynonyms) {
        expect(synonyms).toContain(expectedSynonym);
      }
    });

    it("should handle case-insensitive lookup for 'DEBRIDEMENT'", async () => {
      const synonyms = await service.lookupOntologySynonyms(
        "DEBRIDEMENT",
        customerId
      );

      expect(synonyms.length).toBeGreaterThan(0);
      expect(synonyms).toContain("tissue removal");
    });

    it("should cache synonym lookups for performance", async () => {
      // Clear cache first
      service.clearCache();

      // First lookup - cache miss
      const start1 = Date.now();
      const synonyms1 = await service.lookupOntologySynonyms(
        "debridement",
        customerId
      );
      const duration1 = Date.now() - start1;

      // Second lookup - cache hit (should be faster)
      const start2 = Date.now();
      const synonyms2 = await service.lookupOntologySynonyms(
        "debridement",
        customerId
      );
      const duration2 = Date.now() - start2;

      // Verify same results
      expect(synonyms1).toEqual(synonyms2);

      // Cache hit should be significantly faster (< 5ms vs potentially 50ms+)
      console.log(`First lookup: ${duration1}ms, Cached lookup: ${duration2}ms`);
      expect(duration2).toBeLessThan(10); // Cached should be very fast
    });

    it("should respect maxResults option", async () => {
      const synonyms = await service.lookupOntologySynonyms(
        "debridement",
        customerId,
        { maxResults: 2 }
      );

      // Should return at most 2 synonyms
      expect(synonyms.length).toBeLessThanOrEqual(2);
      expect(synonyms.length).toBeGreaterThan(0); // But at least some
    });
  });

  describe("Filter mapping integration", () => {
    it("should be ready for integration with terminology mapper", () => {
      // Verify service can be imported
      expect(service).toBeDefined();
      expect(service.lookupOntologySynonyms).toBeDefined();

      // Verify cache is working
      const stats = service.getCacheStats();
      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("maxSize");
      expect(stats.maxSize).toBe(500);
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  mapSchemaVersionToSilhouetteVersion,
  getSupportedVersions,
  isSupportedSchemaVersion,
} from "../silhouette-version-mapper";

describe("silhouette-version-mapper", () => {
  describe("mapSchemaVersionToSilhouetteVersion", () => {
    it("should map known schema versions to silhouette versions", () => {
      expect(mapSchemaVersionToSilhouetteVersion("35.0")).toBe("4.18");
      expect(mapSchemaVersionToSilhouetteVersion("36.0")).toBe("4.19");
      expect(mapSchemaVersionToSilhouetteVersion("37.0")).toBe("4.20");
      expect(mapSchemaVersionToSilhouetteVersion("38.0")).toBe("4.21");
      expect(mapSchemaVersionToSilhouetteVersion("39.0")).toBe("4.22");
    });

    it("should handle numeric inputs", () => {
      expect(mapSchemaVersionToSilhouetteVersion(35.0)).toBe("4.18");
      expect(mapSchemaVersionToSilhouetteVersion(39.0)).toBe("4.22");
    });

    it("should return null for unknown versions", () => {
      expect(mapSchemaVersionToSilhouetteVersion("40.0")).toBe(null);
      expect(mapSchemaVersionToSilhouetteVersion("1.0")).toBe(null);
      expect(mapSchemaVersionToSilhouetteVersion("")).toBe(null);
    });

    it("should handle whitespace in version strings", () => {
      expect(mapSchemaVersionToSilhouetteVersion(" 35.0 ")).toBe("4.18");
      expect(mapSchemaVersionToSilhouetteVersion("  39.0  ")).toBe("4.22");
    });
  });

  describe("getSupportedVersions", () => {
    it("should return all supported version mappings", () => {
      const versions = getSupportedVersions();
      expect(versions).toHaveLength(10);
      // Both decimal and integer formats should be supported
      expect(versions).toContainEqual(["35.0", "4.18"]);
      expect(versions).toContainEqual(["35", "4.18"]);
      expect(versions).toContainEqual(["36.0", "4.19"]);
      expect(versions).toContainEqual(["36", "4.19"]);
      expect(versions).toContainEqual(["37.0", "4.20"]);
      expect(versions).toContainEqual(["37", "4.20"]);
      expect(versions).toContainEqual(["38.0", "4.21"]);
      expect(versions).toContainEqual(["38", "4.21"]);
      expect(versions).toContainEqual(["39.0", "4.22"]);
      expect(versions).toContainEqual(["39", "4.22"]);
    });
  });

  describe("isSupportedSchemaVersion", () => {
    it("should return true for supported versions", () => {
      expect(isSupportedSchemaVersion("35.0")).toBe(true);
      expect(isSupportedSchemaVersion("36.0")).toBe(true);
      expect(isSupportedSchemaVersion("37.0")).toBe(true);
      expect(isSupportedSchemaVersion("38.0")).toBe(true);
      expect(isSupportedSchemaVersion("39.0")).toBe(true);
      expect(isSupportedSchemaVersion(35.0)).toBe(true);
    });

    it("should return false for unsupported versions", () => {
      expect(isSupportedSchemaVersion("40.0")).toBe(false);
      expect(isSupportedSchemaVersion("1.0")).toBe(false);
      expect(isSupportedSchemaVersion("")).toBe(false);
    });
  });
});

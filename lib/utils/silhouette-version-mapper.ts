/**
 * Maps Silhouette database SchemaVersion to Silhouette Version.
 * Based on mapping provided in customer onboarding requirements.
 */

const SCHEMA_VERSION_MAP: Record<string, string> = {
  "35.0": "4.18",
  "35": "4.18",
  "36.0": "4.19",
  "36": "4.19",
  "37.0": "4.20",
  "37": "4.20",
  "38.0": "4.21",
  "38": "4.21",
  "39.0": "4.22",
  "39": "4.22",
};

/**
 * Convert a database SchemaVersion to a Silhouette Version string.
 * Returns null if the version is not recognized.
 */
export function mapSchemaVersionToSilhouetteVersion(
  schemaVersion: string | number
): string | null {
  const normalized = String(schemaVersion).trim();
  return SCHEMA_VERSION_MAP[normalized] ?? null;
}

/**
 * Get all supported schema versions as an array of [schemaVersion, silhouetteVersion] tuples.
 */
export function getSupportedVersions(): [string, string][] {
  return Object.entries(SCHEMA_VERSION_MAP);
}

/**
 * Check if a schema version is supported.
 */
export function isSupportedSchemaVersion(
  schemaVersion: string | number
): boolean {
  return mapSchemaVersionToSilhouetteVersion(schemaVersion) !== null;
}

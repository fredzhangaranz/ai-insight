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
  "40.0": "4.23",
  "40": "4.23",
  "41.0": "4.24",
  "41": "4.24",
  "42.0": "4.25",
  "42": "4.25",
  "43.0": "4.26",
  "43": "4.26",
  "44.0": "4.27",
  "44": "4.27",
  "45.0": "4.28",
  "45": "4.28",
  "46.0": "4.29",
  "46": "4.29",
};

/**
 * Convert a database SchemaVersion to a Silhouette Version string.
 * Returns null if the version is not recognized.
 */
export function mapSchemaVersionToSilhouetteVersion(
  schemaVersion: string | number,
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
  schemaVersion: string | number,
): boolean {
  return mapSchemaVersionToSilhouetteVersion(schemaVersion) !== null;
}

/**
 * Normalize JSON values from database or untrusted sources.
 * Handles both string-encoded JSON and already-parsed objects.
 * Returns empty object if parsing fails.
 */
export function normalizeJson(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  return value as Record<string, unknown>;
}

/**
 * Safely parse JSON string or return fallback value.
 * Logs warning if parsing fails.
 */
export function parseJsonSafe<T>(
  value: string | null | undefined,
  fallback: T
): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn(
      "[parseJsonSafe] Failed to parse JSON:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return fallback;
  }
}

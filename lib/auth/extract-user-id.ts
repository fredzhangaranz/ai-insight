/**
 * Extract and validate user ID from session.
 * Ensures consistent, type-safe user ID handling across routes.
 */

export function extractUserIdFromSession(session: any): number {
  if (!session?.user?.id) {
    throw new Error("No user ID in session");
  }

  const id = Number.parseInt(String(session.user.id), 10);

  if (Number.isNaN(id) || id <= 0) {
    throw new Error(`Invalid user ID format: ${session.user.id}`);
  }

  return id;
}

/**
 * Validate that a user ID is a positive integer.
 * Useful for input validation and guards.
 */
export function isValidUserId(id: unknown): id is number {
  return (
    typeof id === "number" &&
    Number.isInteger(id) &&
    id > 0 &&
    !Number.isNaN(id)
  );
}

/**
 * Form utilities for data generation
 */

/**
 * Returns true if the form is a wound assessment form (supports trajectory config).
 * Matches forms whose name contains "wound" (case-insensitive).
 */
export function isWoundAssessmentForm(formName: string): boolean {
  return /wound/i.test(formName);
}

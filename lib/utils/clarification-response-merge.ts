export type ClarificationResponses = Record<string, string>;

const PATIENT_SELECTION_KEY = "patient_resolution_select";
const PATIENT_CONFIRM_KEY = "patient_resolution_confirm";
const PATIENT_LOOKUP_KEY = "patient_lookup_input";

/**
 * Clarification submissions are sent one step at a time from the UI.
 * Merge the latest answers with previous answers so multi-step clarification
 * chains (patient -> date range -> execute) do not lose earlier decisions.
 */
export function mergeClarificationResponses(
  previous: ClarificationResponses,
  incoming: ClarificationResponses
): ClarificationResponses {
  const merged: ClarificationResponses = { ...previous };

  if (Object.prototype.hasOwnProperty.call(incoming, PATIENT_SELECTION_KEY)) {
    delete merged[PATIENT_CONFIRM_KEY];
    delete merged[PATIENT_LOOKUP_KEY];
  }

  if (Object.prototype.hasOwnProperty.call(incoming, PATIENT_CONFIRM_KEY)) {
    delete merged[PATIENT_SELECTION_KEY];
    delete merged[PATIENT_LOOKUP_KEY];
  }

  if (Object.prototype.hasOwnProperty.call(incoming, PATIENT_LOOKUP_KEY)) {
    delete merged[PATIENT_SELECTION_KEY];
    delete merged[PATIENT_CONFIRM_KEY];
  }

  return {
    ...merged,
    ...incoming,
  };
}

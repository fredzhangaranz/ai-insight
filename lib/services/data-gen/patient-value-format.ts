/**
 * Normalise patient field values for storage, SQL preview, and UI (DOB date-only, regional phones).
 */

import { getPatientPresetFieldKey } from "./patient-preset.service";

export function formatUtcDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Store DOB as `YYYY-MM-DD` (no time component in UI or SQL literals). */
export function normalizeDateOfBirthValue(value: unknown): unknown {
  if (value instanceof Date) return formatUtcDateOnly(value);
  return value;
}

function randDigits(count: number): string {
  let s = "";
  for (let i = 0; i < count; i++) {
    s += String(Math.floor(Math.random() * 10));
  }
  return s;
}

/** NZ mobile: 02X XXX XXXX */
function nzMobile(): string {
  const x = 1 + Math.floor(Math.random() * 7);
  return `02${x} ${randDigits(3)} ${randDigits(4)}`;
}

/** NZ Auckland-style landline: 09 XXX XXXX */
function nzLandline(): string {
  return `09 ${randDigits(3)} ${randDigits(4)}`;
}

/** AU mobile: 04XX XXX XXX */
function auMobile(): string {
  return `04${randDigits(2)} ${randDigits(3)} ${randDigits(3)}`;
}

/** AU Sydney-style landline: 02 XXXX XXXX */
function auLandline(): string {
  return `02 ${randDigits(4)} ${randDigits(4)}`;
}

/** Major US metro area codes (NYC, LA, Chicago, Bay Area, Seattle, Houston). */
const US_AREA_CODES = [
  212, 646, 917, 310, 323, 424, 312, 773, 415, 628, 206, 425, 713, 832,
];

/** US NANP-style: (AAA) EEE-LLLL (exchange first digit 2–9). */
function usPhone(): string {
  const area = US_AREA_CODES[Math.floor(Math.random() * US_AREA_CODES.length)];
  const exchange = 200 + Math.floor(Math.random() * 800);
  const line = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `(${area}) ${exchange}-${line}`;
}

const PHONE_COLUMNS = ["homePhone", "mobilePhone", "workPhone"] as const;

const REGIONAL_PRESET_IDS = new Set([
  "nz-urban",
  "au-coastal",
  "us-urban",
]);

/**
 * Replace generated phone values with NZ / AU / US shaped numbers when a regional preset is selected.
 */
export function applyRegionalPhoneNumbers(
  rowValues: Map<string, unknown>,
  presetId: string | undefined,
  doNotOverrideKeys: Set<string>,
): void {
  if (!presetId || !REGIONAL_PRESET_IDS.has(presetId)) return;

  for (const columnName of PHONE_COLUMNS) {
    const key = getPatientPresetFieldKey({ columnName });
    if (!key || doNotOverrideKeys.has(key) || !rowValues.has(key)) continue;

    if (presetId === "nz-urban") {
      rowValues.set(
        key,
        columnName === "mobilePhone" ? nzMobile() : nzLandline(),
      );
    } else if (presetId === "au-coastal") {
      rowValues.set(
        key,
        columnName === "mobilePhone" ? auMobile() : auLandline(),
      );
    } else {
      rowValues.set(key, usPhone());
    }
  }
}

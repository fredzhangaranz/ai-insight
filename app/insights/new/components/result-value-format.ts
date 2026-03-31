const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,7}))?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const BIRTH_DATE_COLUMN_PATTERN = /(dob|dateofbirth|birthdate|birthday)/i;
const DECIMAL_PATTERN = /^-?\d+\.\d+$/;

export function formatResultValue(value: unknown, columnName?: string): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return String(value);
    }

    if (isDateOnlyDate(value) || isBirthDateColumn(columnName)) {
      return formatDateFromDate(value);
    }

    return value.toLocaleString();
  }

  if (typeof value !== "string") {
    return String(value);
  }

  if (DECIMAL_PATTERN.test(value)) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue.toFixed(2);
    }
  }

  const datePrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isBirthDateColumn(columnName) && datePrefix) {
    return datePrefix[1];
  }

  if (DATE_ONLY_PATTERN.test(value)) {
    return value;
  }

  const dateTimeMatch = value.match(DATE_TIME_PATTERN);
  if (!dateTimeMatch) {
    return value;
  }

  const [, datePart, hours, minutes, seconds = "00", fraction = "0"] =
    dateTimeMatch;

  if (hasTimeComponent(hours, minutes, seconds, fraction)) {
    return value;
  }

  return datePart;
}

function isBirthDateColumn(columnName?: string): boolean {
  if (!columnName) {
    return false;
  }

  const normalized = columnName.replace(/[^a-z]/gi, "").toLowerCase();
  return BIRTH_DATE_COLUMN_PATTERN.test(normalized);
}

function hasTimeComponent(
  hours: string,
  minutes: string,
  seconds: string,
  fraction: string
): boolean {
  return [hours, minutes, seconds, fraction].some((part) => Number(part) !== 0);
}

function isDateOnlyDate(value: Date): boolean {
  return (
    hasZeroTime(
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds()
    ) ||
    hasZeroTime(
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  );
}

function hasZeroTime(
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number
): boolean {
  return hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0;
}

function formatDateFromDate(value: Date): string {
  if (
    hasZeroTime(
      value.getUTCHours(),
      value.getUTCMinutes(),
      value.getUTCSeconds(),
      value.getUTCMilliseconds()
    )
  ) {
    return formatDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  return formatDateParts(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate()
  );
}

function formatDateParts(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

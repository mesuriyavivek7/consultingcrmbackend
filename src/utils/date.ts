/**
 * Day-boundary helpers for date filtering.
 *
 * Call logs are produced by the Flutter app in India, and the CRM renders every
 * timestamp in Asia/Kolkata. Server local time cannot be trusted for this (a
 * container usually runs on UTC), so day boundaries are resolved against a
 * fixed business-timezone offset instead. India has no DST, so a fixed offset
 * is exact; override it with APP_TIMEZONE_OFFSET_MINUTES for other regions.
 */

const DEFAULT_OFFSET_MINUTES = 330; // IST (+05:30)

const getOffsetMinutes = (): number => {
  const configured = Number(process.env.APP_TIMEZONE_OFFSET_MINUTES);
  return Number.isFinite(configured) ? configured : DEFAULT_OFFSET_MINUTES;
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnlyString = (value: string): boolean =>
  DATE_ONLY_PATTERN.test(value.trim());

/**
 * Returns the instant of 00:00:00.000 (business timezone) for a YYYY-MM-DD date,
 * or null when the string is not a real calendar date.
 */
export const startOfBusinessDay = (dateString: string): Date | null => {
  const trimmed = dateString.trim();
  if (!isDateOnlyString(trimmed)) {
    return null;
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const candidate = new Date(utcMidnight - getOffsetMinutes() * 60_000);

  // Rejects overflow dates like 2026-02-31 that Date.UTC silently rolls over.
  if (
    new Date(utcMidnight).getUTCFullYear() !== year ||
    new Date(utcMidnight).getUTCMonth() !== month - 1 ||
    new Date(utcMidnight).getUTCDate() !== day
  ) {
    return null;
  }

  return candidate;
};

/**
 * Returns the instant of 23:59:59.999 (business timezone) for a YYYY-MM-DD date.
 */
export const endOfBusinessDay = (dateString: string): Date | null => {
  const start = startOfBusinessDay(dateString);
  if (!start) {
    return null;
  }
  return new Date(start.getTime() + 24 * 60 * 60_000 - 1);
};

/**
 * Today's calendar date (business timezone) as YYYY-MM-DD.
 */
export const businessToday = (now: Date = new Date()): string => {
  const shifted = new Date(now.getTime() + getOffsetMinutes() * 60_000);
  return shifted.toISOString().slice(0, 10);
};

/**
 * Date format detection utility
 * Analyzes date patterns in uploaded files to detect US vs International format
 */

import { expandTwoDigitYear, normalizeTimestamp } from './earthquake-utils';

export type DateFormat = 'US' | 'International' | 'ISO' | 'Unknown';

export interface DateFormatDetectionResult {
  format: DateFormat;
  confidence: number; // 0-1 scale
  ambiguousCount: number;
  totalDatesAnalyzed: number;
  reasoning: string;
  /** Dates that can only be MM/DD (second field > 12) and only DD/MM (first field > 12). */
  usCount?: number;
  internationalCount?: number;
}

/**
 * Detect date format from a sample of date strings
 * Analyzes patterns to determine if dates are in US (MM/DD/YYYY) or International (DD/MM/YYYY) format
 */
export function detectDateFormat(dateStrings: string[], maxSamples: number = 50): DateFormatDetectionResult {
  const samples = dateStrings.slice(0, maxSamples);

  if (samples.length === 0) {
    return {
      format: 'Unknown',
      confidence: 0,
      ambiguousCount: 0,
      totalDatesAnalyzed: 0,
      reasoning: 'No date strings provided'
    };
  }

  let usFormatCount = 0;
  let internationalFormatCount = 0;
  let isoFormatCount = 0;
  let ambiguousCount = 0;
  let analyzedCount = 0;

  // Regex patterns for different date formats. The slash form also carries two-digit
  // years (05/03/24), which normalizeTimestamp reads with the same day/month order.
  const slashDatePattern = /^(\d{1,2})\/(\d{1,2})\/(?:\d{4}|\d{2})(?!\d)/;
  const dashDatePattern = /^(\d{1,2})-(\d{1,2})-(\d{4})/;
  const isoPattern = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;

  for (const dateStr of samples) {
    const trimmed = dateStr.trim();

    // Check for ISO format (YYYY-MM-DD or YYYY/MM/DD, YYYY.MM.DD): year first, so the
    // month is always second.
    const isoMatch = trimmed.match(isoPattern);
    if (isoMatch) {
      isoFormatCount++;
      analyzedCount++;
      continue;
    }

    // Check for slash-separated dates (MM/DD/YYYY or DD/MM/YYYY)
    const slashMatch = trimmed.match(slashDatePattern);
    if (slashMatch) {
      const first = parseInt(slashMatch[1]);
      const second = parseInt(slashMatch[2]);

      analyzedCount++;

      // Unambiguous cases
      if (first > 12 && second <= 12) {
        // First value > 12, must be day (International format: DD/MM/YYYY)
        internationalFormatCount++;
      } else if (first <= 12 && second > 12) {
        // Second value > 12, must be day (US format: MM/DD/YYYY)
        usFormatCount++;
      } else if (first > 12 && second > 12) {
        // Both > 12, invalid date - skip
        continue;
      } else {
        // Both <= 12, ambiguous
        ambiguousCount++;
      }
      continue;
    }

    // Check for dash-separated dates (MM-DD-YYYY or DD-MM-YYYY)
    const dashMatch = trimmed.match(dashDatePattern);
    if (dashMatch) {
      const first = parseInt(dashMatch[1]);
      const second = parseInt(dashMatch[2]);

      analyzedCount++;

      // Unambiguous cases
      if (first > 12 && second <= 12) {
        // First value > 12, must be day (International format: DD-MM-YYYY)
        internationalFormatCount++;
      } else if (first <= 12 && second > 12) {
        // Second value > 12, must be day (US format: MM-DD-YYYY)
        usFormatCount++;
      } else if (first > 12 && second > 12) {
        // Both > 12, invalid date - skip
        continue;
      } else {
        // Both <= 12, ambiguous
        ambiguousCount++;
      }
    }
  }

  // Determine format based on counts
  let format: DateFormat = 'Unknown';
  let confidence = 0;
  let reasoning = '';

  const unambiguousCount = usFormatCount + internationalFormatCount + isoFormatCount;

  if (isoFormatCount > unambiguousCount * 0.8) {
    // Majority are ISO format
    format = 'ISO';
    confidence = isoFormatCount / analyzedCount;
    reasoning = `${isoFormatCount} of ${analyzedCount} dates are in ISO format (YYYY-MM-DD)`;
  } else if (usFormatCount > internationalFormatCount) {
    // More evidence for US format
    format = 'US';
    confidence = unambiguousCount > 0 ? usFormatCount / unambiguousCount : 0;
    reasoning = `${usFormatCount} dates clearly in US format (MM/DD/YYYY) vs ${internationalFormatCount} in International format (DD/MM/YYYY)`;

    if (ambiguousCount > usFormatCount) {
      confidence *= 0.7; // Reduce confidence if many ambiguous dates
      reasoning += `. ${ambiguousCount} ambiguous dates reduce confidence.`;
    }
  } else if (internationalFormatCount > usFormatCount) {
    // More evidence for International format
    format = 'International';
    confidence = unambiguousCount > 0 ? internationalFormatCount / unambiguousCount : 0;
    reasoning = `${internationalFormatCount} dates clearly in International format (DD/MM/YYYY) vs ${usFormatCount} in US format (MM/DD/YYYY)`;

    if (ambiguousCount > internationalFormatCount) {
      confidence *= 0.7; // Reduce confidence if many ambiguous dates
      reasoning += `. ${ambiguousCount} ambiguous dates reduce confidence.`;
    }
  } else if (unambiguousCount === 0 && ambiguousCount > 0) {
    // All dates are ambiguous - default to International (safer for most of the world)
    format = 'International';
    confidence = 0.3; // Low confidence
    reasoning = `All ${ambiguousCount} dates are ambiguous (both values ≤ 12). Defaulting to International format (DD/MM/YYYY).`;
  } else {
    format = 'Unknown';
    confidence = 0;
    reasoning = 'Unable to determine date format from samples';
  }

  return {
    format,
    confidence,
    ambiguousCount,
    totalDatesAnalyzed: analyzedCount,
    reasoning,
    usCount: usFormatCount,
    internationalCount: internationalFormatCount,
  };
}

/**
 * Parse a date string with a specified format preference.
 *
 * The result is the UTC instant: origin times are UTC, and building an offset-less ISO
 * string for new Date() (as this used to) read it in the server's local time. The
 * string is read by normalizeTimestamp, with `format` deciding an ambiguous day/month
 * order (DD/MM for 'International', 'ISO' and 'Unknown').
 */
export function parseDateWithFormat(dateStr: string, format: DateFormat): Date | null {
  const hint = format === 'US' ? 'US' : format === 'International' ? 'International' : undefined;
  // A declared order also settles a two-digit year's place (see decideFileDateFormat).
  const iso = normalizeTimestamp(dateStr, hint, { twoDigitYears: hint !== undefined });
  return iso === null ? null : new Date(iso);
}

/** An order a numeric date with a two-digit year can be read in. */
export type TwoDigitYearOrder = 'DMY' | 'MDY' | 'YMD';

const TWO_DIGIT_YEAR_DATE = /^(\d{1,2})([/.])(\d{1,2})\2(\d{2})(?![\d/.])/;

function isCalendarDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * The orders in which a numeric date with a two-digit year names a real day, or null
 * when the value is not such a date. '20/05/17' is 20 May 2017 or 17 May 2020;
 * '25/12/99' can only be 25 December 1999. The dotted form is never month-first.
 */
export function twoDigitYearReadings(value: string): TwoDigitYearOrder[] | null {
  const m = value.trim().match(TWO_DIGIT_YEAR_DATE);
  if (!m) return null;
  const first = Number(m[1]);
  const second = Number(m[3]);
  const last = Number(m[4]);
  const readings: TwoDigitYearOrder[] = [];
  if (isCalendarDay(expandTwoDigitYear(last), second, first)) readings.push('DMY');
  if (m[2] === '/' && isCalendarDay(expandTwoDigitYear(last), first, second)) readings.push('MDY');
  if (isCalendarDay(expandTwoDigitYear(first), second, last)) readings.push('YMD');
  return readings;
}

/** How a two-digit year is read, for messages ('00-26 as 2000-2026, 27-99 as 1927-1999'). */
export function twoDigitYearRule(): string {
  const current = new Date().getUTCFullYear();
  const yy = current % 100;
  const pad = (n: number) => String(n).padStart(2, '0');
  const recent = `00–${pad(yy)} as ${current - yy}–${current}`;
  return yy === 99 ? recent : `${recent}, ${pad(yy + 1)}–99 as ${current - 99}–${current - yy - 1}`;
}

/** The day/month order a file is read with, decided once from all its time cells. */
export interface FileDateFormatDecision {
  dateFormat?: DateFormat;
  dateFormatSource?: 'declared' | 'detected';
  /** Whether numeric dates with a two-digit year are read (normalizeTimestamp twoDigitYears). */
  twoDigitYears: boolean;
  /** File-level messages: the detection's confidence, and how two-digit years were treated. */
  warnings: string[];
}

/**
 * Decide the day/month order ONCE for a whole file, from every non-empty cell of its
 * time columns: the order is a property of the file, and one day > 12 anywhere settles it
 * for every row (a sample of the first rows split a time-sorted US catalogue whose
 * sequence reached day 13 after row 50 between two calendars).
 *
 * A numeric date with a two-digit year has a third reading, YY/MM/DD, so those dates are
 * read only when the order is declared, or when the file's own two-digit-year dates rule
 * out every order but one (and agree with its four-digit dates). Either way the file is
 * told how they were read, or why they were not.
 */
export function decideFileDateFormat(cells: unknown[], declared?: DateFormat): FileDateFormatDecision {
  const warnings: string[] = [];
  const dateStrings = cells.filter((cell): cell is string => typeof cell === 'string' && cell.trim().length > 0);

  // Two-digit-year dates are weighed separately: their first field may be the year.
  let twoDigitCount = 0;
  const possible = new Set<TwoDigitYearOrder>(['DMY', 'MDY', 'YMD']);
  const otherDates: string[] = [];
  for (const value of dateStrings) {
    const readings = twoDigitYearReadings(value);
    if (readings === null) {
      otherDates.push(value);
      continue;
    }
    twoDigitCount += 1;
    possible.forEach((order) => { if (!readings.includes(order)) possible.delete(order); });
  }

  let dateFormat: DateFormat | undefined;
  let dateFormatSource: 'declared' | 'detected' | undefined;
  let detection: DateFormatDetectionResult | null = null;
  if (declared && declared !== 'Unknown') {
    dateFormat = declared;
    dateFormatSource = 'declared';
  } else if (otherDates.length > 0) {
    detection = detectDateFormat(otherDates, otherDates.length);
    dateFormat = detection.format;
    dateFormatSource = 'detected';
  }
  const detectedEvidence = (detection?.usCount ?? 0) + (detection?.internationalCount ?? 0) > 0;

  let twoDigitYears = false;
  let twoDigitMessage: string | null = null;
  if (twoDigitCount > 0) {
    let order: 'DMY' | 'MDY' | null = null;
    let reason = 'YY/MM/DD fits them as well as DD/MM/YY or MM/DD/YY';
    if (dateFormatSource === 'declared') {
      if (dateFormat === 'US' || dateFormat === 'International') order = dateFormat === 'US' ? 'MDY' : 'DMY';
      else reason = 'the declared format does not say whether the day or the month comes first';
    } else if (possible.size === 1 && !possible.has('YMD')) {
      const only: 'DMY' | 'MDY' = possible.has('DMY') ? 'DMY' : 'MDY';
      if (!detectedEvidence) {
        // Nothing else in the file speaks to the order: the two-digit dates settle it.
        order = only;
        dateFormat = only === 'MDY' ? 'US' : 'International';
        dateFormatSource = 'detected';
        detection = null;
      } else if ((only === 'MDY') === (dateFormat === 'US')) {
        order = only;
      } else {
        reason = "their order disagrees with the file's four-digit dates";
      }
    } else if (possible.size === 0) {
      reason = 'no single order fits all of them';
    }
    twoDigitYears = order !== null;
    twoDigitMessage = order
      ? `${twoDigitCount} date(s) with a two-digit year were read as ${order === 'DMY' ? 'DD/MM/YY' : 'MM/DD/YY'}; ` +
        `a two-digit year is taken as the latest year with those digits that is not in the future (${twoDigitYearRule()}).`
      : `${twoDigitCount} date(s) with a two-digit year were not read: the day, month and year order is not certain ` +
        `(${reason}). Declare the date format (US or International) to read them as MM/DD/YY or DD/MM/YY.`;
  }

  if (detection) {
    if (detection.confidence < 0.5) {
      // Only a file with dates that depend on the order needs to hear about it.
      if (detection.ambiguousCount > 0) {
        warnings.push(`Low confidence date format detection (${Math.round(detection.confidence * 100)}%). ${detection.reasoning}`);
      }
    } else if (detection.format !== 'ISO' && detection.format !== 'Unknown') {
      warnings.push(`Detected ${detection.format} date format. ${detection.reasoning}`);
    }
  }
  if (twoDigitMessage) warnings.push(twoDigitMessage);

  return { dateFormat, dateFormatSource, twoDigitYears, warnings };
}

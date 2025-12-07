/**
 * Date format detection utility
 * Analyzes date patterns in uploaded files to detect US vs International format
 */

export type DateFormat = 'US' | 'International' | 'ISO' | 'Unknown';

export interface DateFormatDetectionResult {
  format: DateFormat;
  confidence: number; // 0-1 scale
  ambiguousCount: number;
  totalDatesAnalyzed: number;
  reasoning: string;
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

  // Regex patterns for different date formats
  const slashDatePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
  const dashDatePattern = /^(\d{1,2})-(\d{1,2})-(\d{4})/;
  const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;

  for (const dateStr of samples) {
    const trimmed = dateStr.trim();
    
    // Check for ISO format (YYYY-MM-DD or YYYY/MM/DD)
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
    reasoning
  };
}

/**
 * Parse a date string with a specified format preference
 */
export function parseDateWithFormat(dateStr: string, format: DateFormat): Date | null {
  const trimmed = dateStr.trim();
  
  // Try ISO format first (unambiguous)
  const isoPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
  const isoMatch = trimmed.match(isoPattern);
  if (isoMatch) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Handle slash or dash separated dates
  const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/;
  const dashPattern = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(.+))?$/;
  
  let match = trimmed.match(slashPattern) || trimmed.match(dashPattern);
  
  if (match) {
    const [, first, second, year, timePart] = match;
    let month: string;
    let day: string;
    
    if (format === 'US') {
      month = first;
      day = second;
    } else {
      // International or Unknown - default to DD/MM/YYYY
      day = first;
      month = second;
    }
    
    // Build ISO string
    const timeStr = timePart || '00:00:00';
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr}`;
    
    const date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Fallback to standard Date parsing
  const date = new Date(trimmed);
  return !isNaN(date.getTime()) ? date : null;
}


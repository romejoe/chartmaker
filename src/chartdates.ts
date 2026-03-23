/**
 * FAA chart publication cycle date logic.
 *
 * The FAA publishes chart updates on a 56-day cycle.
 * This module finds the current active chart date from chartdates.json.
 */

import { join } from "@std/path";
import { log } from "./logger.ts";

/** Window boundaries for selecting a chart date (in days). */
const WINDOW_BEFORE = 20;
const WINDOW_AFTER = 36;

interface ChartDateResult {
  /** The active chart date formatted as MM-DD-YYYY. */
  readonly chartDate: string;
  /** The next expiration date formatted as MM-DD-YYYY. */
  readonly expireDate: string;
  /** The raw Date object for the active chart date. */
  readonly dateObj: Date;
}

/**
 * Parse an MM-DD-YYYY date string into a Date object.
 */
function parseDateString(dateStr: string): Date {
  const [month, day, year] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date object as MM-DD-YYYY.
 */
function formatDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = date.getFullYear();
  return `${m}-${d}-${y}`;
}

/**
 * Load chart dates from chartdates.json and find the best match.
 *
 * A chart date is selected if today falls within [-WINDOW_BEFORE, +WINDOW_AFTER]
 * days of that publication date. Dates are searched from newest to oldest.
 *
 * @param appDir - The application root directory containing chartdates.json.
 * @returns The active chart date and expiration date.
 * @throws If no suitable chart date is found.
 */
export function getBestChartDate(appDir: string): ChartDateResult {
  const filePath = join(appDir, "chartdates.json");
  const raw = Deno.readTextFileSync(filePath);
  const data = JSON.parse(raw) as { ChartDates: string[] };

  const now = Date.now();
  const msPerDay = 1000 * 3600 * 24;

  // Parse and sort dates descending (newest first)
  const dates = data.ChartDates
    .map(parseDateString)
    .sort((a, b) => b.getTime() - a.getTime());

  let selectedDate: Date | null = null;
  let expireDate: Date | null = null;

  for (let i = 0; i < dates.length; i++) {
    const diffDays = Math.round((now - dates[i].getTime()) / msPerDay);

    if (diffDays >= -WINDOW_BEFORE && diffDays <= WINDOW_AFTER) {
      selectedDate = dates[i];
      // The expire date is the next newer date in the sorted list
      // (which is the previous index since we sorted descending)
      if (i > 0) {
        expireDate = dates[i - 1];
      }
      break;
    }
  }

  if (!selectedDate) {
    throw new Error(
      "No suitable FAA chart date found in chartdates.json. " +
      "The chart date list may need to be updated.",
    );
  }

  const result: ChartDateResult = {
    chartDate: formatDate(selectedDate),
    expireDate: expireDate ? formatDate(expireDate) : "unknown",
    dateObj: selectedDate,
  };

  log.info(`Active chart date: ${result.chartDate} (expires: ${result.expireDate})`);
  return result;
}

/**
 * Get all chart dates from chartdates.json for listing.
 */
export function getAllChartDates(appDir: string): string[] {
  const filePath = join(appDir, "chartdates.json");
  const raw = Deno.readTextFileSync(filePath);
  const data = JSON.parse(raw) as { ChartDates: string[] };
  return data.ChartDates;
}

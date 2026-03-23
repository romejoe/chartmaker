/**
 * Timing and duration utilities.
 */

import type { ProcessTiming } from "../types.ts";

/** Create a new timing tracker for a chart. */
export function startTiming(chartName: string): ProcessTiming {
  return {
    chartName,
    startTime: Date.now(),
  };
}

/** Finalize a timing tracker and compute elapsed time. */
export function finishTiming(timing: ProcessTiming): ProcessTiming {
  const endTime = Date.now();
  const elapsed = formatDuration(endTime - timing.startTime);
  return { ...timing, endTime, elapsed };
}

/** Format milliseconds into HH:MM:SS. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

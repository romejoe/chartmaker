/**
 * 'list' command handler.
 * Lists available chart names or FAA chart cycle dates.
 */

import type { Settings } from "../types.ts";
import { getAllChartNames } from "../config.ts";
import { getAllChartDates } from "../chartdates.ts";

/**
 * List all available chart names (area + full).
 */
export function listCharts(settings: Settings): void {
  const { areas, full } = getAllChartNames(settings);

  console.log("\nFull Chart Types:");
  console.log("─".repeat(40));
  full.forEach((name, i) => {
    console.log(`  ${String(i).padStart(2)}  ${name.replaceAll("_", " ")}`);
  });

  console.log(`\nVFR Area Charts (${areas.length} total):`);
  console.log("─".repeat(40));
  areas.forEach((name, i) => {
    console.log(`  ${String(i).padStart(2)}  ${name.replaceAll("_", " ")}`);
  });

  console.log();
}

/**
 * List upcoming FAA chart cycle dates.
 */
export function listDates(appDir: string): void {
  const dates = getAllChartDates(appDir);
  const now = new Date();

  console.log("\nFAA Chart Publication Cycle Dates:");
  console.log("─".repeat(40));

  for (const dateStr of dates) {
    const [month, day, year] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    const isPast = date < now;
    const marker = isPast ? "  " : " *";
    console.log(`${marker} ${dateStr}`);
  }

  console.log("\n  * = upcoming\n");
}

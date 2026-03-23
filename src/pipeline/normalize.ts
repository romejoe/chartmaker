/**
 * File name normalization stage.
 * Cleans up chart TIF/TFW file names by converting to lowercase,
 * replacing spaces/dashes with underscores, and removing suffixes.
 */

import { join } from "@std/path";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { listFiles } from "../util/fs.ts";

/** File extensions that need normalization. */
const NORMALIZE_EXTENSIONS = [".tif", ".tfw", ".tfwx"];

/**
 * Normalize a file name:
 * - Convert to lowercase
 * - Replace spaces and dashes with underscores
 * - Remove apostrophes
 * - Remove chart type suffixes (_sec, _tac, _chart)
 * - Normalize "u.s." to "us"
 */
export function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("'", "")
    .replaceAll("-", "_")
    .replaceAll("_sec", "")
    .replaceAll("_tac", "")
    .replaceAll("_chart", "")
    .replaceAll("u.s.", "us");
}

/**
 * Normalize all chart file names in the unzipped directory.
 * Renames TIF/TFW/TFWX files to a consistent format.
 */
export async function normalizeChartNames(ctx: ChartContext): Promise<void> {
  const { dirs } = ctx;

  log.info("Normalizing chart file names");

  const files = await listFiles(dirs.unzipped);
  let renamed = 0;

  for (const file of files) {
    const lowerFile = file.toLowerCase();
    if (!NORMALIZE_EXTENSIONS.some((ext) => lowerFile.endsWith(ext))) continue;

    const newName = normalizeFileName(file);
    if (newName !== file) {
      const oldPath = join(dirs.unzipped, file);
      const newPath = join(dirs.unzipped, newName);
      await Deno.rename(oldPath, newPath);
      renamed++;
      log.debug(`Renamed: ${file} -> ${newName}`);
    }
  }

  log.info(`Normalized ${renamed} file name(s)`);
}

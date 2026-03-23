/**
 * ZIP extraction stage.
 * Extracts downloaded chart ZIP files using fflate.
 * Replaces the unzip shell command from the original code.
 */

import { join, basename } from "@std/path";
import { unzipSync } from "fflate";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { ensureDir, listFiles, removeFile } from "../util/fs.ts";

/** File extensions to skip during extraction. */
const SKIP_EXTENSIONS = [".pdf", ".htm", ".html"];

/** Files to explicitly remove after extraction. */
const REMOVE_FILES = ["Caribbean Planning Chart.tif"];

/**
 * Extract the chart ZIP file into the unzipped work directory.
 * Handles IFR charts that contain nested ZIP files.
 */
export async function extractChart(
  ctx: ChartContext,
  zipPath: string,
): Promise<void> {
  const { identity, dirs } = ctx;

  await ensureDir(dirs.unzipped);

  log.info(`Extracting: ${zipPath}`);

  // Read the ZIP file
  const zipData = await Deno.readFile(zipPath);
  const entries = unzipSync(zipData);

  // Extract entries
  let extractedCount = 0;
  for (const [name, data] of Object.entries(entries)) {
    // Skip directories (entries ending with /)
    if (name.endsWith("/")) continue;

    // Skip unwanted file types
    const lowerName = name.toLowerCase();
    if (SKIP_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) continue;

    // Get just the filename, not the directory structure
    const fileName = basename(name);
    const destPath = join(dirs.unzipped, fileName);

    await Deno.writeFile(destPath, data);
    extractedCount++;
  }

  log.info(`Extracted ${extractedCount} files`);

  // For IFR charts: extract inner ZIP files matching the chart type
  if (identity.isIfr) {
    await extractIfrInnerZips(ctx);
  }

  // Remove known problematic files
  for (const removeFile_ of REMOVE_FILES) {
    const filePath = join(dirs.unzipped, removeFile_);
    await removeFile(filePath);
  }

  // Clean up any remaining ZIP files in the unzipped directory
  const files = await listFiles(dirs.unzipped);
  for (const file of files) {
    if (file.toLowerCase().endsWith(".zip")) {
      await removeFile(join(dirs.unzipped, file));
    }
  }
}

/**
 * For IFR charts (Enroute Low/High), the main ZIP contains inner ZIP files.
 * Extract only the ones matching the chart type (ENR_H or ENR_L).
 */
async function extractIfrInnerZips(ctx: ChartContext): Promise<void> {
  const { identity, dirs } = ctx;
  const searchPrefix = identity.name === "Enroute_High" ? "ENR_H" : "ENR_L";

  log.info(`Extracting IFR inner ZIPs matching: ${searchPrefix}`);

  const files = await listFiles(dirs.unzipped);
  for (const file of files) {
    if (file.toUpperCase().includes(searchPrefix) && file.toLowerCase().endsWith(".zip")) {
      const innerZipPath = join(dirs.unzipped, file);
      log.debug(`Extracting inner ZIP: ${file}`);

      const innerData = await Deno.readFile(innerZipPath);
      const innerEntries = unzipSync(innerData);

      for (const [name, data] of Object.entries(innerEntries)) {
        if (name.endsWith("/")) continue;
        const fileName = basename(name);
        const lowerName = fileName.toLowerCase();
        if (SKIP_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) continue;

        await Deno.writeFile(join(dirs.unzipped, fileName), data);
      }
    }
  }
}

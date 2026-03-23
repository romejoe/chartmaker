/**
 * Chart download stage.
 * Downloads FAA chart ZIP files using native fetch() with streaming.
 * Replaces the curl shell command from the original code.
 */

import { join } from "@std/path";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { ensureDir, exists, listFiles, removeFile } from "../util/fs.ts";

/**
 * Download the chart ZIP file from FAA servers.
 * Uses caching: skips download if a file with the matching date already exists.
 * Removes stale cached versions of the same chart.
 */
export async function downloadChart(ctx: ChartContext): Promise<string> {
  const { identity, cacheDir, options } = ctx;
  const zipFileName = `${identity.workName}-current.zip`;
  const zipPath = join(cacheDir, zipFileName);

  await ensureDir(cacheDir);

  // Check cache (unless --no-cache)
  if (!options.noCache && await exists(zipPath)) {
    log.info(`Using cached: ${zipPath}`);
    return zipPath;
  }

  // Remove any stale cached versions of this chart
  const existingFiles = await listFiles(cacheDir);
  for (const file of existingFiles) {
    if (file.startsWith(identity.workName)) {
      await removeFile(join(cacheDir, file));
      log.debug(`Removed stale cache: ${file}`);
    }
  }

  log.info(`Downloading: ${identity.url}`);
  log.info(`Destination: ${zipPath}`);

  const response = await fetch(identity.url);

  if (!response.ok) {
    throw new Error(
      `Download failed: HTTP ${response.status} ${response.statusText} for ${identity.url}`,
    );
  }

  if (!response.body) {
    throw new Error(`No response body for ${identity.url}`);
  }

  // Stream the response body directly to a file
  const file = await Deno.open(zipPath, {
    write: true,
    create: true,
    truncate: true,
  });

  try {
    const contentLength = response.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
    let downloadedBytes = 0;
    let lastProgressPct = -1;

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await file.write(value);
      downloadedBytes += value.byteLength;

      // Log progress every 10%
      if (totalBytes && totalBytes > 0) {
        const pct = Math.floor((downloadedBytes / totalBytes) * 100 / 10) * 10;
        if (pct > lastProgressPct) {
          lastProgressPct = pct;
          log.debug(
            `Download progress: ${pct}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`,
          );
        }
      }
    }

    const mbSize = (downloadedBytes / 1024 / 1024).toFixed(1);
    log.info(`Downloaded ${mbSize} MB -> ${zipPath}`);
  } finally {
    file.close();
  }

  return zipPath;
}

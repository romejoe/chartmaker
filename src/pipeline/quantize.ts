/**
 * Tile image optimization stage.
 * Uses sharp to optimize tile images, replacing the external pngquant tool.
 *
 * For PNG tiles: converts to palette-based PNG with quality control.
 * For WebP/JPEG tiles: re-encodes at the configured quality level.
 */

import { join } from "@std/path";
import sharp from "sharp";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { ensureDir, isDirectory, listFiles } from "../util/fs.ts";

/**
 * Optimize all tiles in the merged directory.
 * Output goes to the quantized directory.
 *
 * - PNG tiles: quantized to palette-based PNG at the given quality
 * - WebP tiles: re-encoded at the given quality
 * - JPEG tiles: re-encoded at the given quality
 *
 * If quality is 100, this stage is skipped (no optimization needed).
 */
export async function quantizeTiles(ctx: ChartContext): Promise<void> {
  const { dirs, options } = ctx;

  if (options.quality >= 100) {
    log.debug("Skipping optimization (quality is 100%)");
    return;
  }

  await ensureDir(dirs.quantized);

  log.info(
    `Optimizing ${options.tileFormat.toUpperCase()} tiles at ${options.quality}% quality`,
  );

  const filePairs = await buildFilePairs(dirs.merged, dirs.quantized);
  log.info(`Processing ${filePairs.length} tile images`);

  let processed = 0;
  let errors = 0;

  for (const [srcPath, destPath] of filePairs) {
    try {
      const pipeline = sharp(srcPath);

      switch (options.tileFormat) {
        case "png":
          // palette: true enables palette-based quantization (like pngquant)
          // quality sets the minimum quality threshold for palette generation
          pipeline.png({
            palette: true,
            quality: options.quality,
            effort: 7,
            compressionLevel: 9,
          });
          break;

        case "webp":
          pipeline.webp({
            quality: options.quality,
            effort: 4,
          });
          break;

        case "jpeg":
          pipeline.jpeg({
            quality: options.quality,
            mozjpeg: true,
          });
          break;
      }

      await pipeline.toFile(destPath);
    } catch {
      // If optimization fails, copy the original unchanged
      await Deno.copyFile(srcPath, destPath);
      errors++;
    }

    processed++;
    if (processed % 1000 === 0) {
      log.info(`  ${processed} of ${filePairs.length} images processed`);
    }
  }

  log.info(
    `Optimization complete: ${processed} processed, ${errors} copied as-is`,
  );
}

/**
 * Build the list of [source, destination] paths for optimization.
 * Mirrors the z/x/y directory structure from merged to quantized.
 */
async function buildFilePairs(
  mergedDir: string,
  quantizedDir: string,
): Promise<[string, string][]> {
  const pairs: [string, string][] = [];

  const zoomLevels = await listFiles(mergedDir);

  for (const zoom of zoomLevels) {
    const zoomDir = join(mergedDir, zoom);
    if (!await isDirectory(zoomDir)) continue;

    const qZoomDir = join(quantizedDir, zoom);
    await ensureDir(qZoomDir);

    const xDirs = await listFiles(zoomDir);

    for (const x of xDirs) {
      const xDir = join(zoomDir, x);
      if (!await isDirectory(xDir)) continue;

      const qXDir = join(qZoomDir, x);
      await ensureDir(qXDir);

      const tiles = await listFiles(xDir);

      for (const tile of tiles) {
        pairs.push([
          join(xDir, tile),
          join(qXDir, tile),
        ]);
      }
    }
  }

  return pairs;
}

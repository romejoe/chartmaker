/**
 * Tile merging stage.
 * Merges individual chart area tile sets into a single unified tile set.
 *
 * This is a TypeScript rewrite of the Perl mergetiles.pl script.
 * Uses sharp for image compositing when tiles overlap, eliminating
 * the ImageMagick external dependency.
 */

import { join } from "@std/path";
import sharp from "sharp";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { ensureDir, exists, listFiles, isDirectory, moveFile } from "../util/fs.ts";

/**
 * Merge all tiled chart areas from dirs.tiled into dirs.merged.
 *
 * For each area subdirectory in the tiled folder:
 * - Iterate through z/x/y tile structure
 * - If a tile already exists in merged, composite with sharp
 * - If not, move the tile to merged
 */
export async function mergeTiles(ctx: ChartContext): Promise<void> {
  const { dirs } = ctx;

  await ensureDir(dirs.merged);

  const areas = await listFiles(dirs.tiled);
  log.info(`Merging tiles from ${areas.length} area(s)`);

  let totalTiles = 0;
  let compositedTiles = 0;

  for (const area of areas) {
    const overlayDir = join(dirs.tiled, area);
    if (!await isDirectory(overlayDir)) continue;

    log.info(`  Merging: ${area}`);

    // Get zoom level directories
    const zoomLevels = await listFiles(overlayDir);

    for (const zoomLevel of zoomLevels) {
      const overlayZoomDir = join(overlayDir, zoomLevel);
      if (!await isDirectory(overlayZoomDir)) continue;

      const baseZoomDir = join(dirs.merged, zoomLevel);
      await ensureDir(baseZoomDir);

      // Get X directories
      const xDirs = await listFiles(overlayZoomDir);

      for (const x of xDirs) {
        const overlayXDir = join(overlayZoomDir, x);
        if (!await isDirectory(overlayXDir)) continue;

        const baseXDir = join(baseZoomDir, x);
        await ensureDir(baseXDir);

        // Get Y tile files
        const yTiles = await listFiles(overlayXDir);

        for (const y of yTiles) {
          const overlayTile = join(overlayXDir, y);
          const baseTile = join(baseXDir, y);
          totalTiles++;

          if (await exists(baseTile)) {
            // Both tiles exist: composite them with sharp
            await compositeTiles(baseTile, overlayTile, baseTile);
            compositedTiles++;
          } else {
            // Only overlay exists: move it
            await moveFile(overlayTile, baseTile);
          }
        }
      }
    }
  }

  log.info(
    `Merge complete: ${totalTiles} tiles processed, ${compositedTiles} composited`,
  );
}

/**
 * Composite two tile images using sharp.
 * The overlay is placed on top of the base image and the result
 * is written to the output path.
 */
async function compositeTiles(
  basePath: string,
  overlayPath: string,
  outputPath: string,
): Promise<void> {
  try {
    await sharp(basePath)
      .composite([{ input: overlayPath, blend: "over" }])
      .toFile(outputPath + ".tmp");

    // Atomic replace: write to temp then rename
    await Deno.rename(outputPath + ".tmp", outputPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to composite tiles: ${basePath} + ${overlayPath}: ${msg}`);
  }
}

/**
 * Pipeline orchestrator.
 * Runs each processing stage in sequence for a chart context.
 */

import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { ensureDir, cleanDir, removeDir } from "../util/fs.ts";
import { downloadChart } from "./download.ts";
import { extractChart } from "./extract.ts";
import { normalizeChartNames } from "./normalize.ts";
import { processGdal } from "./gdal.ts";
import { mergeTiles } from "./merge.ts";
import { quantizeTiles } from "./quantize.ts";
import { writeMbtiles } from "../output/mbtiles.ts";
import { writeTarGz } from "../output/targz.ts";

/**
 * Run the full processing pipeline for a single chart.
 *
 * Pipeline stages:
 * 1. Download chart ZIP from FAA
 * 2. Extract ZIP contents
 * 3. Normalize file names
 * 4. GDAL processing (translate, warp, overview, tile)
 * 5. Merge tile sets
 * 6. Quantize PNG tiles (if applicable)
 * 7. Generate output (MBTiles and/or tar.gz)
 * 8. Cleanup work directories (if configured)
 */
export async function runPipeline(
  ctx: ChartContext,
  appDir: string,
): Promise<void> {
  const { identity, options, dirs, workDir, outputDir } = ctx;

  // Ensure work directories exist
  await cleanDir(workDir);
  await ensureDir(dirs.unzipped);
  await ensureDir(dirs.expanded);
  await ensureDir(dirs.clipped);
  await ensureDir(dirs.tiled);
  await ensureDir(dirs.merged);
  await ensureDir(dirs.quantized);
  await ensureDir(outputDir);

  // Stage 1: Download
  log.info("\n--- Stage 1: Download ---");
  const zipPath = await downloadChart(ctx);

  // Stage 2: Extract
  log.info("\n--- Stage 2: Extract ---");
  await extractChart(ctx, zipPath);

  // Stage 3: Normalize file names
  log.info("\n--- Stage 3: Normalize ---");
  await normalizeChartNames(ctx);

  // Stage 4: GDAL processing
  log.info("\n--- Stage 4: GDAL Processing ---");
  const bounds = await processGdal(ctx, appDir);

  // Stage 5: Merge tiles
  log.info("\n--- Stage 5: Merge Tiles ---");
  await mergeTiles(ctx);

  // Stage 6: Optimize tiles (quality < 100)
  log.info("\n--- Stage 6: Optimize Tiles ---");
  await quantizeTiles(ctx);

  // Stage 7: Generate output
  log.info("\n--- Stage 7: Output ---");

  // Determine the source folder for output generation
  const sourceDir = options.quality < 100
    ? dirs.quantized
    : dirs.merged;

  // Build metadata for the chart
  const metadata = buildMetadata(ctx, bounds);

  if (options.outputFormat === "mbtiles" || options.outputFormat === "both") {
    const dbPath = `${identity.name}.${options.dbExtension}`;
    await writeMbtiles(sourceDir, outputDir, dbPath, metadata, options);
    log.info(`MBTiles written: ${dbPath}`);
  }

  if (options.outputFormat === "tar.gz" || options.outputFormat === "both") {
    const tarPath = `${identity.name}.tar.gz`;
    await writeTarGz(sourceDir, outputDir, tarPath);
    log.info(`tar.gz written: ${tarPath}`);
  }

  // Stage 8: Cleanup
  if (options.cleanWorkarea) {
    log.info("\n--- Stage 8: Cleanup ---");
    await removeDir(workDir);
    log.info("Work directory cleaned");
  }
}

/**
 * Build metadata object for the chart database.
 */
function buildMetadata(
  ctx: ChartContext,
  bounds: number[][] | null,
): Record<string, string> {
  const { identity, options } = ctx;
  const zooms = options.zoomRange.split("-");
  const minZoom = zooms[0];
  const maxZoom = zooms.length > 1 ? zooms[1] : zooms[0];

  const meta: Record<string, string> = {
    name: identity.name,
    description: `${identity.name.replaceAll("_", " ")} Chart`,
    type: options.layerType,
    format: options.tileFormat,
    minzoom: minZoom,
    maxzoom: maxZoom,
    attribution: options.attribution,
  };

  // Add bounds if available
  if (bounds && bounds.length >= 3) {
    try {
      const lngDiff =
        (Math.abs(bounds[0][0]) - Math.abs(bounds[2][0])) / 2;
      const latDiff =
        (Math.abs(bounds[0][1]) - Math.abs(bounds[2][1])) / 2;
      const centerLng = bounds[0][0] + lngDiff;
      const centerLat = bounds[0][1] - latDiff;

      meta.bounds = `${bounds[0][0]},${bounds[0][1]},${bounds[2][0]},${bounds[2][1]}`;
      meta.center = `${centerLng},${centerLat},${options.centerZoomLevel}`;
    } catch {
      log.debug("Could not calculate bounds for metadata");
    }
  }

  return meta;
}

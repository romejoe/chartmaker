/**
 * GDAL processing stage.
 * Runs gdal_translate, gdalwarp, gdaladdo, and gdal2tiles.py on chart images.
 *
 * Uses Deno.Command with array args to prevent shell injection.
 */

import { join } from "@std/path";
import type { ChartContext } from "../types.ts";
import { log } from "../logger.ts";
import { execOrThrow, exec } from "../util/exec.ts";
import { listFiles, ensureDir } from "../util/fs.ts";

/** Coordinates from gdalinfo WGS84 extent. */
interface Wgs84Bounds {
  coordinates: number[][][];
}

interface GdalInfo {
  bands: unknown[];
  wgs84Extent: Wgs84Bounds;
}

/**
 * Build the list of chart area names to process from the unzipped TIF files.
 * Excludes flyway charts and the "new_york_vfr_plannings_" file.
 */
export async function buildChartAreas(ctx: ChartContext): Promise<string[]> {
  const files = await listFiles(ctx.dirs.unzipped);
  const areas: string[] = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    if (!lower.endsWith(".tif")) continue;
    if (lower.includes("fly")) continue;
    if (lower.includes("new_york_vfr_plannings_")) continue;

    areas.push(lower.replace(".tif", ""));
  }

  log.info(`Found ${areas.length} chart area(s) to process`);
  return areas;
}

/**
 * Process all chart images through the GDAL pipeline:
 * 1. gdal_translate - expand color table to RGB/RGBA
 * 2. gdalwarp - reproject to EPSG:3857 and clip to shapefile
 * 3. gdaladdo - generate overviews (optional)
 * 4. gdal2tiles.py - generate XYZ tile pyramid
 *
 * Returns the WGS84 bounds from the last processed chart (for metadata).
 */
export async function processGdal(
  ctx: ChartContext,
  _appDir: string,
): Promise<number[][] | null> {
  const { dirs, options, identity } = ctx;
  const areas = await buildChartAreas(ctx);

  if (areas.length === 0) {
    throw new Error("No chart TIF files found after extraction and normalization");
  }

  // Ensure work directories exist
  await ensureDir(dirs.expanded);
  await ensureDir(dirs.clipped);
  await ensureDir(dirs.tiled);

  let lastBounds: number[][] | null = null;

  for (const area of areas) {
    log.info(`Processing area: ${area}`);

    const srcTif = join(dirs.unzipped, `${area}.tif`);
    const expandedVrt = join(dirs.expanded, `${area}.vrt`);
    const clippedVrt = join(dirs.clipped, `${area}.vrt`);
    const shapefile = join(identity.clipShapeDir, `${area}.shp`);
    const tiledDir = join(dirs.tiled, area);

    // 1. Determine if RGB expansion is needed
    const expandOpt = await getExpandOption(srcTif, options.grayscale);
    lastBounds = await getWgs84Bounds(srcTif);

    // 2. gdal_translate: expand color palette to VRT
    log.info(`  gdal_translate: ${area}`);
    const translateArgs = [
      "-strict", "-of", "vrt", "-ovr", "NONE",
      ...expandOpt,
      srcTif, expandedVrt,
    ];
    await execOrThrow("gdal_translate", translateArgs, { verbose: options.verbose });

    // 3. gdalwarp: reproject and clip
    log.info(`  gdalwarp: clipping ${area}`);
    const warpArgs = [
      "-t_srs", "EPSG:3857",
      "-dstalpha",
      "--config", "GDAL_CACHEMAX", "256",
      "-multi",
      "-cblend", String(options.blendPixels),
      "-cutline", shapefile,
      "-crop_to_cutline",
      expandedVrt, clippedVrt,
    ];
    await execOrThrow("gdalwarp", warpArgs, { verbose: options.verbose });

    // Resolve effective image format (grayscale forces png over webp)
    let effectiveFormat = options.tileFormat;
    if (options.grayscale && effectiveFormat === "webp") {
      effectiveFormat = "png";
    }

    // 4. gdaladdo: generate overviews (optional)
    if (options.addOverviews) {
      log.info(`  gdaladdo: adding overviews for ${area}`);
      const overviewArgs = buildOverviewArgs(effectiveFormat, options.quality, clippedVrt);
      await execOrThrow("gdaladdo", overviewArgs, { verbose: options.verbose });
    }

    // 5. gdal2tiles.py: generate tile pyramid
    log.info(`  gdal2tiles: tiling ${area}`);
    const tilesArgs = buildTilesArgs(effectiveFormat, options, clippedVrt, tiledDir);
    await execOrThrow("gdal2tiles.py", tilesArgs, { verbose: options.verbose });
  }

  return lastBounds;
}

/**
 * Query gdalinfo to determine the band count and expansion mode.
 */
async function getExpandOption(
  tifPath: string,
  grayscale: boolean,
): Promise<string[]> {
  const result = await exec("gdalinfo", ["-json", tifPath]);
  if (!result.success) {
    log.warn(`gdalinfo failed for ${tifPath}, assuming no expansion needed`);
    return [];
  }

  try {
    const info = JSON.parse(result.stdout) as GdalInfo;
    if (info.bands.length === 1) {
      return ["-expand", grayscale ? "gray" : "rgb"];
    }
  } catch {
    log.warn(`Failed to parse gdalinfo output for ${tifPath}`);
  }

  return [];
}

/**
 * Query gdalinfo for WGS84 bounds.
 */
async function getWgs84Bounds(tifPath: string): Promise<number[][] | null> {
  const result = await exec("gdalinfo", ["-json", tifPath]);
  if (!result.success) return null;

  try {
    const info = JSON.parse(result.stdout) as GdalInfo;
    return info.wgs84Extent?.coordinates?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Build gdaladdo arguments based on tile format.
 */
function buildOverviewArgs(
  format: string,
  quality: number,
  inputPath: string,
): string[] {
  const args: string[] = [];

  switch (format) {
    case "webp":
      args.push(
        "--config", "WEBP_LOSSLESS_OVERVIEW", "YES",
        "--config", "WEBP_LEVEL_OVERVIEW", String(quality),
      );
      break;
    case "jpeg":
      args.push("--config", "JPEG_QUALITY_OVERVIEW", String(quality));
      break;
    // png: no quality config needed
  }

  args.push("--config", "GDAL_NUM_THREADS", "ALL_CPUS", inputPath);
  return args;
}

/**
 * Build gdal2tiles.py arguments.
 */
function buildTilesArgs(
  format: string,
  options: { zoomRange: string; quality: number },
  inputPath: string,
  outputDir: string,
): string[] {
  const args = [
    `--zoom=${options.zoomRange}`,
    `--tiledriver=${format.toUpperCase()}`,
  ];

  if (format === "webp") {
    args.push(`--webp-quality=${options.quality}`, "--webp-lossless");
  }

  args.push(
    "--tmscompatible",
    "--webviewer=none",
    inputPath,
    outputDir,
  );

  return args;
}

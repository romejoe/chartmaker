/**
 * 'generate' command handler.
 * Resolves chart selections and orchestrates the processing pipeline.
 */

import { join } from "@std/path";
import type {
  ChartContext,
  ChartIdentity,
  CliArgs,
  ProcessingOptions,
  Settings,
  WorkDirs,
} from "../types.ts";
import { buildProcessingOptions, resolveChart, resolveFullChart } from "../config.ts";
import { getBestChartDate } from "../chartdates.ts";
import { log } from "../logger.ts";
import { ensureDir, exists } from "../util/fs.ts";
import { startTiming, finishTiming } from "../util/time.ts";
import { runPipeline } from "../pipeline/mod.ts";

/**
 * Execute the generate command.
 * Returns exit code: 0 = success, 1 = failure.
 */
export async function generate(
  args: CliArgs,
  settings: Settings,
  appDir: string,
): Promise<number> {
  const { chartDate } = getBestChartDate(appDir);

  // Build processing options from settings + CLI overrides
  const options = buildProcessingOptions(settings, {
    zoomRange: args.zoom ?? settings.defaults.zoomRange,
    tileFormat: args.tileFormat ?? settings.defaults.tileFormat,
    quality: args.quality ?? settings.defaults.quality,
    outputFormat: args.format,
    cleanWorkarea: !args.noCleanup,
    noCache: args.noCache,
    force: args.force,
    verbose: args.verbose,
    dryRun: args.dryRun,
  });

  // Resolve output directory
  const outputDir = args.outputDir
    ? args.outputDir
    : join(appDir, settings.defaults.outputDir, chartDate);

  // Resolve which charts to process
  const charts = resolveChartSelection(args, settings, chartDate, appDir);

  if (charts.length === 0) {
    log.error("No charts resolved for processing.");
    return 1;
  }

  log.info(`Processing ${charts.length} chart(s) for date ${chartDate}`);
  if (options.dryRun) {
    log.info("[DRY RUN] The following charts would be processed:");
    for (const chart of charts) {
      log.info(`  - ${chart.name} (${chart.isArea ? "area" : "full"}) -> ${chart.url}`);
    }
    return 0;
  }

  // Ensure output directory exists
  await ensureDir(outputDir);

  const overallTiming = startTiming("overall");
  let failures = 0;

  for (const chart of charts) {
    const timing = startTiming(chart.name);
    log.info(`\n${"=".repeat(60)}`);
    log.info(`Processing: ${chart.name}`);
    log.info(`${"=".repeat(60)}`);

    // Check if output already exists
    const dbFile = join(outputDir, `${chart.name}.${options.dbExtension}`);
    if (!options.force && await exists(dbFile)) {
      log.info(`Output already exists: ${dbFile} (use --force to regenerate)`);
      continue;
    }

    // Build chart context
    const workDir = join(appDir, "workarea", chart.name);
    const ctx = buildContext(chart, workDir, join(appDir, "chartcache"), outputDir, options);

    try {
      await runPipeline(ctx, appDir);
      const finished = finishTiming(timing);
      log.info(`Completed ${chart.name} in ${finished.elapsed}`);
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to process ${chart.name}: ${msg}`);
      if (options.verbose && err instanceof Error && err.stack) {
        log.error(err.stack);
      }
    }
  }

  const finished = finishTiming(overallTiming);
  log.info(`\nAll processing complete. Total time: ${finished.elapsed}`);

  if (failures > 0) {
    log.error(`${failures} chart(s) failed to process.`);
    return 1;
  }

  return 0;
}

/**
 * Resolve the chart selection from CLI args into ChartIdentity objects.
 */
function resolveChartSelection(
  args: CliArgs,
  settings: Settings,
  chartDate: string,
  appDir: string,
): ChartIdentity[] {
  const charts: ChartIdentity[] = [];
  const seen = new Set<string>();

  const addChart = (chart: ChartIdentity) => {
    if (!seen.has(chart.name)) {
      seen.add(chart.name);
      charts.push(chart);
    }
  };

  // --all: everything
  if (args.all) {
    for (const fc of settings.fullCharts) {
      addChart(resolveFullChart(fc, settings, chartDate, appDir));
    }
    for (const areaName of settings.areaCharts) {
      addChart(resolveChart(areaName, settings, chartDate, appDir));
    }
    return charts;
  }

  // --all-full: all full chart types
  if (args.allFull) {
    for (const fc of settings.fullCharts) {
      addChart(resolveFullChart(fc, settings, chartDate, appDir));
    }
  }

  // --all-areas: all 53 VFR area charts
  if (args.allAreas) {
    for (const areaName of settings.areaCharts) {
      addChart(resolveChart(areaName, settings, chartDate, appDir));
    }
  }

  // --chart <name>: specific charts by name
  for (const name of args.charts) {
    try {
      addChart(resolveChart(name, settings, chartDate, appDir));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(msg);
    }
  }

  return charts;
}

/**
 * Build a ChartContext for pipeline processing.
 */
function buildContext(
  identity: ChartIdentity,
  workDir: string,
  cacheDir: string,
  outputDir: string,
  options: ProcessingOptions,
): ChartContext {
  const dirs: WorkDirs = {
    unzipped: join(workDir, "1_unzipped"),
    expanded: join(workDir, "2_expanded"),
    clipped: join(workDir, "3_clipped"),
    tiled: join(workDir, "4_tiled"),
    merged: join(workDir, "5_merged"),
    quantized: join(workDir, "6_quantized"),
  };

  return {
    identity,
    workDir,
    cacheDir,
    outputDir,
    dirs,
    options,
  };
}

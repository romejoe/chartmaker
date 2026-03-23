/**
 * Configuration loading, validation, and defaults.
 */

import { join } from "@std/path";
import type {
  ChartIdentity,
  ChartType,
  FullChartDef,
  LayerType,
  ProcessingOptions,
  Settings,
  TileFormat,
} from "./types.ts";
import { log } from "./logger.ts";

/** Default settings applied when values are missing from settings.json. */
const DEFAULTS: Settings = {
  attribution:
    "Aviation charts <a href='https://github.com/n129bz/chartmaker'>github.com/n129bz/chartmaker</a>",
  urls: {
    vfr: "https://aeronav.faa.gov/visual/<chartdate>/All_Files/<charttype>.zip",
    vfrIndividual:
      "https://aeronav.faa.gov/visual/<chartdate>/sectional-files/<charttype>.zip",
    ifr: "https://aeronav.faa.gov/enroute/<chartdate>/<charttype>.zip",
    wallPlanning:
      "https://aeronav.faa.gov/visual/<chartdate>/Planning/US_WallPlan.zip",
  },
  defaults: {
    zoomRange: "5-11",
    tileFormat: "webp",
    quality: 25,
    outputFormat: "mbtiles",
    outputDir: "output",
    blendPixels: 30,
    addOverviews: true,
    grayscale: false,
    cleanWorkarea: true,
    layerType: "baselayer",
    centerZoomLevel: "7",
    dbExtension: "mbtiles",
    logToFile: false,
    timezone: "America/Chicago",
  },
  fullCharts: [],
  areaCharts: [],
};

/**
 * Raw settings.json shape (matches the legacy format for backwards compat).
 */
interface RawSettings {
  settings: {
    attribution?: string;
    vfrdownloadtemplate?: string;
    vfrindividualtemplate?: string;
    ifrdownloadtemplate?: string;
    usvfrwallplanningtemplate?: string;
    zoomrange?: string;
    tileimagequality?: number;
    blendpixels?: number;
    addoverviews?: boolean;
    outputgrayscale?: boolean;
    cleanprocessfolders?: boolean;
    centerzoomlevel?: string;
    dbextension?: string;
    logtofile?: boolean;
    timezone?: string;
    tiledriverindex?: number;
    tiledrivers?: string[];
    layertypeindex?: number;
    layertypes?: string[];
    fullchartlist?: string[][];
    areachartlist?: string[];
    [key: string]: unknown;
  };
}

/**
 * Load and validate settings from settings.json.
 *
 * Search order:
 * 1. `configPath` if explicitly provided (warns on failure)
 * 2. `settings.json` in the current working directory (silent fallback)
 * 3. Embedded DEFAULTS
 */
export function loadSettings(configPath?: string): Settings {
  const explicit = configPath !== undefined;
  const filePath = explicit ? configPath : join(Deno.cwd(), "settings.json");
  let raw: RawSettings;

  try {
    const text = Deno.readTextFileSync(filePath);
    raw = JSON.parse(text);
  } catch (e) {
    if (explicit) {
      log.warn(`Could not load settings from ${filePath}: ${e instanceof Error ? e.message : e}`);
    }
    return DEFAULTS;
  }

  const s = raw.settings;

  const tileDrivers = s.tiledrivers ?? ["png", "jpeg", "webp"];
  const tileDriverIndex = s.tiledriverindex ?? 2;
  const tileFormat = (tileDrivers[tileDriverIndex] ?? "webp") as TileFormat;

  const layerTypes = s.layertypes ?? ["baselayer", "overlay"];
  const layerTypeIndex = s.layertypeindex ?? 0;
  const layerType = (layerTypes[layerTypeIndex] ?? "baselayer") as LayerType;

  const fullCharts: FullChartDef[] = (s.fullchartlist ?? []).map(
    (entry: string[]) => ({
      downloadName: entry[0] ?? "",
      chartType: (entry[1] ?? "vfr") as ChartType,
      alias: entry[2] ?? "",
    }),
  );

  return {
    attribution: s.attribution ?? DEFAULTS.attribution,
    urls: {
      vfr: s.vfrdownloadtemplate ?? DEFAULTS.urls.vfr,
      vfrIndividual: s.vfrindividualtemplate ?? DEFAULTS.urls.vfrIndividual,
      ifr: s.ifrdownloadtemplate ?? DEFAULTS.urls.ifr,
      wallPlanning: s.usvfrwallplanningtemplate ?? DEFAULTS.urls.wallPlanning,
    },
    defaults: {
      zoomRange: s.zoomrange ?? DEFAULTS.defaults.zoomRange,
      tileFormat,
      quality: s.tileimagequality ?? DEFAULTS.defaults.quality,
      outputFormat: DEFAULTS.defaults.outputFormat,
      outputDir: DEFAULTS.defaults.outputDir,
      blendPixels: s.blendpixels ?? DEFAULTS.defaults.blendPixels,
      addOverviews: s.addoverviews ?? DEFAULTS.defaults.addOverviews,
      grayscale: s.outputgrayscale ?? DEFAULTS.defaults.grayscale,
      cleanWorkarea: s.cleanprocessfolders ?? DEFAULTS.defaults.cleanWorkarea,
      layerType,
      centerZoomLevel: s.centerzoomlevel ?? DEFAULTS.defaults.centerZoomLevel,
      dbExtension: s.dbextension ?? DEFAULTS.defaults.dbExtension,
      logToFile: s.logtofile ?? DEFAULTS.defaults.logToFile,
      timezone: s.timezone ?? DEFAULTS.defaults.timezone,
    },
    fullCharts,
    areaCharts: s.areachartlist ?? [],
  };
}

/**
 * Build a download URL from a template and parameters.
 */
export function buildChartUrl(
  template: string,
  chartDate: string,
  chartType: string,
): string {
  return template
    .replace("<chartdate>", chartDate)
    .replace("<charttype>", chartType);
}

/**
 * Resolve a chart name to its full identity for processing.
 * Handles both area charts and full charts.
 */
export function resolveChart(
  name: string,
  settings: Settings,
  chartDate: string,
  appDir: string,
): ChartIdentity {
  // Check if it's an area chart
  const areaIndex = settings.areaCharts.findIndex(
    (a) => a.toLowerCase() === name.toLowerCase(),
  );
  if (areaIndex >= 0) {
    const areaName = settings.areaCharts[areaIndex];
    return {
      name: areaName,
      workName: areaName,
      url: buildChartUrl(settings.urls.vfrIndividual, chartDate, areaName),
      clipShapeDir: join(appDir, "clipshapes", "sectional"),
      isIfr: false,
      isArea: true,
    };
  }

  // Check if it's a full chart
  const fullChart = settings.fullCharts.find((fc) => {
    const matchName = fc.alias || fc.downloadName;
    return matchName.toLowerCase() === name.toLowerCase();
  });

  if (fullChart) {
    return resolveFullChart(fullChart, settings, chartDate, appDir);
  }

  throw new Error(
    `Unknown chart name: "${name}". Use 'chartmaker list charts' to see available names.`,
  );
}

/**
 * Resolve a full chart definition to a chart identity.
 */
export function resolveFullChart(
  chart: FullChartDef,
  settings: Settings,
  chartDate: string,
  appDir: string,
): ChartIdentity {
  if (chart.chartType === "ifr") {
    const lcAlias = chart.alias.toLowerCase();
    return {
      name: chart.alias,
      workName: chart.downloadName,
      url: buildChartUrl(settings.urls.ifr, chartDate, chart.downloadName),
      clipShapeDir: join(appDir, "clipshapes", lcAlias),
      isIfr: true,
      isArea: false,
    };
  }

  const lcName = chart.downloadName.toLowerCase();
  let url: string;

  if (lcName === "us_vfr_wall_planning") {
    url = buildChartUrl(settings.urls.wallPlanning, chartDate, chart.downloadName);
  } else {
    url = buildChartUrl(settings.urls.vfr, chartDate, chart.downloadName);
  }

  return {
    name: chart.downloadName,
    workName: chart.downloadName,
    url,
    clipShapeDir: join(appDir, "clipshapes", lcName),
    isIfr: false,
    isArea: false,
  };
}

/**
 * Merge CLI flags with loaded settings to produce final processing options.
 */
export function buildProcessingOptions(
  settings: Settings,
  overrides: Partial<ProcessingOptions> = {},
): ProcessingOptions {
  return {
    zoomRange: overrides.zoomRange ?? settings.defaults.zoomRange,
    tileFormat: overrides.tileFormat ?? settings.defaults.tileFormat,
    quality: overrides.quality ?? settings.defaults.quality,
    outputFormat: overrides.outputFormat ?? settings.defaults.outputFormat,
    layerType: overrides.layerType ?? settings.defaults.layerType,
    addOverviews: overrides.addOverviews ?? settings.defaults.addOverviews,
    blendPixels: overrides.blendPixels ?? settings.defaults.blendPixels,
    grayscale: overrides.grayscale ?? settings.defaults.grayscale,
    cleanWorkarea: overrides.cleanWorkarea ?? settings.defaults.cleanWorkarea,
    noCache: overrides.noCache ?? false,
    force: overrides.force ?? false,
    verbose: overrides.verbose ?? false,
    dryRun: overrides.dryRun ?? false,
    logToFile: overrides.logToFile ?? settings.defaults.logToFile,
    attribution: overrides.attribution ?? settings.attribution,
    centerZoomLevel: overrides.centerZoomLevel ?? settings.defaults.centerZoomLevel,
    dbExtension: overrides.dbExtension ?? settings.defaults.dbExtension,
  };
}

/**
 * Get all available chart names (area + full).
 */
export function getAllChartNames(settings: Settings): { areas: string[]; full: string[] } {
  const full = settings.fullCharts.map((fc) =>
    fc.alias || fc.downloadName
  );
  return {
    areas: [...settings.areaCharts],
    full,
  };
}

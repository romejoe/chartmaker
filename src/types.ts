/**
 * Core type definitions for chartmaker.
 */

/** Supported tile image formats. */
export type TileFormat = "webp" | "png" | "jpeg";

/** Supported output packaging formats. */
export type OutputFormat = "mbtiles" | "tar.gz" | "both";

/** Chart category: VFR or IFR. */
export type ChartType = "vfr" | "ifr";

/** Map layer type. */
export type LayerType = "baselayer" | "overlay";

/**
 * Definition of a full chart (Sectional, Terminal, Enroute, etc.)
 * as defined in settings.json's fullchartlist.
 */
export interface FullChartDef {
  /** The download name used in the FAA URL (e.g., "Sectional", "DDECUS"). */
  readonly downloadName: string;
  /** VFR or IFR. */
  readonly chartType: ChartType;
  /** Alias name for IFR charts (e.g., "Enroute_Low"). Empty for VFR. */
  readonly alias: string;
}

/**
 * Resolved chart identity ready for processing.
 * This replaces the scattered global variables in the original code.
 */
export interface ChartIdentity {
  /** Human-readable chart name (e.g., "Sectional", "Enroute_Low", "Albuquerque"). */
  readonly name: string;
  /** Working name for downloads/folders (e.g., "Sectional", "DDECUS", "Albuquerque"). */
  readonly workName: string;
  /** Download URL for this chart. */
  readonly url: string;
  /** Path to the clipshapes folder for this chart. */
  readonly clipShapeDir: string;
  /** Whether this is an IFR chart (affects unzip behavior). */
  readonly isIfr: boolean;
  /** Whether this is an individual area chart. */
  readonly isArea: boolean;
}

/**
 * Processing context for a single chart run.
 * Replaces all mutable global state from the original code.
 */
export interface ChartContext {
  readonly identity: ChartIdentity;
  readonly workDir: string;
  readonly cacheDir: string;
  readonly outputDir: string;
  readonly dirs: WorkDirs;
  readonly options: ProcessingOptions;
}

/** Working directory paths for each pipeline stage. */
export interface WorkDirs {
  readonly unzipped: string;
  readonly expanded: string;
  readonly clipped: string;
  readonly tiled: string;
  readonly merged: string;
  readonly quantized: string;
}

/** User-specified processing options (from CLI flags + settings). */
export interface ProcessingOptions {
  readonly zoomRange: string;
  readonly tileFormat: TileFormat;
  readonly quality: number;
  readonly outputFormat: OutputFormat;
  readonly layerType: LayerType;
  readonly addOverviews: boolean;
  readonly blendPixels: number;
  readonly grayscale: boolean;
  readonly cleanWorkarea: boolean;
  readonly noCache: boolean;
  readonly force: boolean;
  readonly verbose: boolean;
  readonly dryRun: boolean;
  readonly logToFile: boolean;
  readonly attribution: string;
  readonly centerZoomLevel: string;
  readonly dbExtension: string;
}

/** Parsed CLI arguments. */
export interface CliArgs {
  command: "generate" | "list" | "info" | "help";
  subcommand?: string;
  charts: string[];
  all: boolean;
  allAreas: boolean;
  allFull: boolean;
  format: OutputFormat;
  outputDir?: string;
  zoom?: string;
  tileFormat?: TileFormat;
  quality?: number;
  noCache: boolean;
  noCleanup: boolean;
  force: boolean;
  verbose: boolean;
  dryRun: boolean;
  configPath?: string;
}

/** Settings loaded from settings.json. */
export interface Settings {
  readonly attribution: string;
  readonly urls: {
    readonly vfr: string;
    readonly vfrIndividual: string;
    readonly ifr: string;
    readonly wallPlanning: string;
  };
  readonly defaults: {
    readonly zoomRange: string;
    readonly tileFormat: TileFormat;
    readonly quality: number;
    readonly outputFormat: OutputFormat;
    readonly outputDir: string;
    readonly blendPixels: number;
    readonly addOverviews: boolean;
    readonly grayscale: boolean;
    readonly cleanWorkarea: boolean;
    readonly layerType: LayerType;
    readonly centerZoomLevel: string;
    readonly dbExtension: string;
    readonly logToFile: boolean;
    readonly timezone: string;
  };
  readonly fullCharts: FullChartDef[];
  readonly areaCharts: string[];
}

/** Timing result for a processed chart. */
export interface ProcessTiming {
  readonly chartName: string;
  readonly startTime: number;
  endTime?: number;
  elapsed?: string;
}

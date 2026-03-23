/**
 * CLI argument parsing and validation.
 *
 * Follows POSIX CLI conventions:
 * - Subcommands: generate, list, info
 * - Long flags: --chart, --all, --format, etc.
 * - Short aliases: -c, -a, -f, -v, etc.
 */

import { parseArgs } from "jsr:@std/cli@^1/parse-args";
import type { CliArgs, OutputFormat, TileFormat } from "./types.ts";

const VERSION = "2.0.0";

const HELP_TEXT = `
chartmaker v${VERSION} - Generate FAA aviation chart tile databases

USAGE:
  chartmaker <command> [options]

COMMANDS:
  generate      Generate chart tiles and package them
  list          List available charts or chart cycle dates
  info          Show current settings and active chart date

GLOBAL OPTIONS:
      --config <path>      Path to settings.json (default: ./settings.json)

GENERATE OPTIONS:
  -c, --chart <name>      Chart to process (repeatable by name)
  -a, --all               Process all charts (full + area)
      --all-areas          Process all 53 VFR area charts
      --all-full           Process all full chart types
  -f, --format <fmt>      Output: mbtiles (default), tar.gz, both
  -o, --output <dir>      Output directory (default: ./output/<date>)
  -z, --zoom <range>      Zoom range (default: 5-11)
  -t, --tile-format <f>   Tile image: webp (default), png, jpeg
  -q, --quality <n>       Image quality 1-100 (default: 25)
      --no-cache           Force re-download even if cached
      --no-cleanup         Keep work directories after processing
      --force              Regenerate even if output already exists
  -v, --verbose            Verbose logging
      --dry-run            Show what would be processed, don't execute

LIST SUBCOMMANDS:
  charts                   List all available chart names
  dates                    List upcoming FAA chart cycle dates

EXAMPLES:
  chartmaker generate --all
  chartmaker generate --chart Sectional --chart Terminal
  chartmaker generate --chart Albuquerque --format tar.gz
  chartmaker generate --all --format both --output /data/charts
  chartmaker list charts
  chartmaker list dates
  chartmaker info

CRON EXAMPLES:
  # Weekly: regenerate all charts
  0 2 * * 0 chartmaker generate --all --format mbtiles

  # Specific charts only
  0 2 * * 0 chartmaker generate --chart Sectional --chart Terminal --format both
`.trim();

/**
 * Parse command-line arguments into a structured CliArgs object.
 */
export function parseCli(args: string[]): CliArgs {
  // Handle --help and --version before anything else
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printHelp();
    Deno.exit(0);
  }

  if (args.includes("--version") || args.includes("-V")) {
    console.log(`chartmaker v${VERSION}`);
    Deno.exit(0);
  }

  // Pre-scan for --config <path> and strip it from args before subcommand dispatch
  let configPath: string | undefined;
  const filteredArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config" && i + 1 < args.length) {
      configPath = args[i + 1];
      i++; // skip the value too
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const command = filteredArgs[0];
  const restArgs = filteredArgs.slice(1);

  let result: CliArgs;
  switch (command) {
    case "generate":
      result = parseGenerateArgs(restArgs);
      break;
    case "list":
      result = parseListArgs(restArgs);
      break;
    case "info":
      result = {
        command: "info",
        charts: [],
        all: false,
        allAreas: false,
        allFull: false,
        format: "mbtiles",
        noCache: false,
        noCleanup: false,
        force: false,
        verbose: false,
        dryRun: false,
      };
      break;
    default:
      console.error(`Unknown command: "${command}"\n`);
      printHelp();
      Deno.exit(2);
  }

  if (configPath) {
    result.configPath = configPath;
  }
  return result;
}

function parseGenerateArgs(args: string[]): CliArgs {
  const parsed = parseArgs(args, {
    string: ["chart", "format", "output", "zoom", "tile-format", "quality"],
    boolean: [
      "all",
      "all-areas",
      "all-full",
      "no-cache",
      "no-cleanup",
      "force",
      "verbose",
      "dry-run",
      "help",
    ],
    alias: {
      c: "chart",
      a: "all",
      f: "format",
      o: "output",
      z: "zoom",
      t: "tile-format",
      q: "quality",
      v: "verbose",
      h: "help",
    },
    collect: ["chart"],
    default: {
      format: "mbtiles",
      verbose: false,
    },
  });

  if (parsed.help) {
    printHelp();
    Deno.exit(0);
  }

  // Validate format
  const format = parsed.format as string;
  if (!["mbtiles", "tar.gz", "both"].includes(format)) {
    console.error(`Invalid format: "${format}". Must be: mbtiles, tar.gz, or both`);
    Deno.exit(2);
  }

  // Validate tile format if provided
  const tileFormat = parsed["tile-format"] as string | undefined;
  if (tileFormat && !["webp", "png", "jpeg"].includes(tileFormat)) {
    console.error(`Invalid tile format: "${tileFormat}". Must be: webp, png, or jpeg`);
    Deno.exit(2);
  }

  // Validate quality if provided
  const qualityStr = parsed.quality as string | undefined;
  let quality: number | undefined;
  if (qualityStr) {
    quality = parseInt(qualityStr, 10);
    if (isNaN(quality) || quality < 1 || quality > 100) {
      console.error(`Invalid quality: "${qualityStr}". Must be 1-100`);
      Deno.exit(2);
    }
  }

  // Collect chart names from --chart flags
  const charts: string[] = (parsed.chart as string[] | undefined) ?? [];

  // Ensure at least one selection method is provided
  const hasSelection =
    parsed.all || parsed["all-areas"] || parsed["all-full"] || charts.length > 0;

  if (!hasSelection) {
    console.error(
      "No charts specified. Use --chart <name>, --all, --all-areas, or --all-full\n",
    );
    printHelp();
    Deno.exit(2);
  }

  return {
    command: "generate",
    charts,
    all: parsed.all as boolean,
    allAreas: parsed["all-areas"] as boolean,
    allFull: parsed["all-full"] as boolean,
    format: format as OutputFormat,
    outputDir: parsed.output as string | undefined,
    zoom: parsed.zoom as string | undefined,
    tileFormat: tileFormat as TileFormat | undefined,
    quality,
    noCache: parsed["no-cache"] as boolean,
    noCleanup: parsed["no-cleanup"] as boolean,
    force: parsed.force as boolean,
    verbose: parsed.verbose as boolean,
    dryRun: parsed["dry-run"] as boolean,
  };
}

function parseListArgs(args: string[]): CliArgs {
  const subcommand = args[0];
  if (!subcommand || !["charts", "dates"].includes(subcommand)) {
    console.error('Usage: chartmaker list <charts|dates>\n');
    Deno.exit(2);
  }

  return {
    command: "list",
    subcommand,
    charts: [],
    all: false,
    allAreas: false,
    allFull: false,
    format: "mbtiles",
    noCache: false,
    noCleanup: false,
    force: false,
    verbose: false,
    dryRun: false,
  };
}

export function printHelp(): void {
  console.log(HELP_TEXT);
}

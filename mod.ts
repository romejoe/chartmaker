/**
 * chartmaker - Generate FAA aviation chart tile databases
 *
 * Entry point. Parses CLI args, loads config, and dispatches to the
 * appropriate command handler.
 */

import { dirname, fromFileUrl } from "@std/path";
import { parseCli } from "./src/cli.ts";
import { loadSettings } from "./src/config.ts";
import { log, setLogLevel, openLogFile, closeLogFile } from "./src/logger.ts";
import { generate } from "./src/commands/generate.ts";
import { listCharts, listDates } from "./src/commands/list.ts";
import { showInfo } from "./src/commands/info.ts";

/**
 * Resolve the application root directory.
 * When running from source: directory containing mod.ts
 * When compiled: Deno.cwd() or directory of the executable
 */
function getAppDir(): string {
  try {
    return dirname(fromFileUrl(import.meta.url));
  } catch {
    return Deno.cwd();
  }
}

async function main(): Promise<void> {
  const appDir = getAppDir();
  const args = parseCli(Deno.args);

  // Load settings
  const settings = loadSettings(args.configPath);

  // Set log level based on verbose flag
  if (args.verbose) {
    setLogLevel("debug");
  }

  // Set timezone if configured
  if (settings.defaults.timezone) {
    // Deno respects TZ env var
    Deno.env.set("TZ", settings.defaults.timezone);
  }

  // Open log file if configured
  if (settings.defaults.logToFile) {
    await openLogFile("chartmaker.log");
  }

  try {
    switch (args.command) {
      case "generate": {
        const exitCode = await generate(args, settings, appDir);
        Deno.exit(exitCode);
        break;
      }

      case "list": {
        if (args.subcommand === "charts") {
          listCharts(settings);
        } else if (args.subcommand === "dates") {
          listDates(appDir);
        }
        break;
      }

      case "info": {
        showInfo(settings, appDir);
        break;
      }

      default: {
        log.error(`Unknown command: ${args.command}`);
        Deno.exit(2);
      }
    }
  } finally {
    closeLogFile();
  }
}

// Handle SIGINT for graceful shutdown
Deno.addSignalListener("SIGINT", () => {
  log.info("\nReceived SIGINT. Cleaning up...");
  closeLogFile();
  Deno.exit(0);
});

await main();

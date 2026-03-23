/**
 * Structured logging with levels, timestamps, and optional file output.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

let minLevel: LogLevel = "info";
let logFile: Deno.FsFile | null = null;

/** Configure the minimum log level. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/** Open a file for log output. Logs go to both console and file. */
export async function openLogFile(path: string): Promise<void> {
  logFile = await Deno.open(path, { write: true, create: true, truncate: true });
}

/** Close the log file if open. */
export function closeLogFile(): void {
  if (logFile) {
    logFile.close();
    logFile = null;
  }
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function writeLog(level: LogLevel, message: string): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const line = `[${formatTimestamp()}] ${LEVEL_LABELS[level]} ${message}`;

  switch (level) {
    case "error":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    default:
      console.log(line);
      break;
  }

  if (logFile) {
    const encoder = new TextEncoder();
    logFile.writeSync(encoder.encode(line + "\n"));
  }
}

export const log = {
  debug: (msg: string) => writeLog("debug", msg),
  info: (msg: string) => writeLog("info", msg),
  warn: (msg: string) => writeLog("warn", msg),
  error: (msg: string) => writeLog("error", msg),
};

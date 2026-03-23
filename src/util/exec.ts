/**
 * Subprocess execution wrapper using Deno.Command.
 * Uses array args to prevent shell injection.
 */

import { log } from "../logger.ts";

export interface ExecResult {
  readonly success: boolean;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Execute a command with arguments.
 * @param cmd - The command to run.
 * @param args - Array of arguments (NOT a shell string).
 * @param options - Optional: cwd, verbose logging.
 */
export async function exec(
  cmd: string,
  args: string[],
  options: { cwd?: string; verbose?: boolean } = {},
): Promise<ExecResult> {
  const cmdStr = [cmd, ...args].join(" ");
  log.debug(`exec: ${cmdStr}`);

  const command = new Deno.Command(cmd, {
    args,
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const process = await command.output();
  const stdout = new TextDecoder().decode(process.stdout);
  const stderr = new TextDecoder().decode(process.stderr);

  if (options.verbose && stdout.trim()) {
    log.debug(stdout.trim());
  }

  if (!process.success) {
    log.error(`Command failed (exit ${process.code}): ${cmdStr}`);
    if (stderr.trim()) {
      log.error(stderr.trim());
    }
  }

  return {
    success: process.success,
    code: process.code,
    stdout,
    stderr,
  };
}

/**
 * Execute a command and throw on failure.
 */
export async function execOrThrow(
  cmd: string,
  args: string[],
  options: { cwd?: string; verbose?: boolean } = {},
): Promise<ExecResult> {
  const result = await exec(cmd, args, options);
  if (!result.success) {
    throw new Error(
      `Command failed (exit ${result.code}): ${cmd} ${args.join(" ")}\n${result.stderr}`,
    );
  }
  return result;
}

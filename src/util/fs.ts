/**
 * Cross-platform file system helpers using Deno APIs.
 */

import { join } from "@std/path";
import { log } from "../logger.ts";

/** Ensure a directory exists, creating it (and parents) if needed. */
export async function ensureDir(path: string): Promise<void> {
  try {
    await Deno.mkdir(path, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
  }
}

/** Remove a directory and all contents. No-op if it doesn't exist. */
export async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

/** Remove a file. No-op if it doesn't exist. */
export async function removeFile(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
}

/** Check if a path exists (file or directory). */
export async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Check if a path is a directory. */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(path);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

/** List files in a directory (non-recursive). */
export async function listFiles(dir: string): Promise<string[]> {
  const entries: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      entries.push(entry.name);
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return entries;
}

/** List files matching a filter. */
export async function listFilesFiltered(
  dir: string,
  filter: (name: string) => boolean,
): Promise<string[]> {
  const files = await listFiles(dir);
  return files.filter(filter);
}

/**
 * Recursively walk a directory, yielding relative paths to files.
 */
export async function* walkFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory) {
      yield* walkFiles(entryPath);
    } else if (entry.isFile) {
      yield entryPath;
    }
  }
}

/** Copy a file from src to dest, creating parent dirs as needed. */
export async function copyFile(src: string, dest: string): Promise<void> {
  const parentDir = dest.substring(0, dest.lastIndexOf(Deno.build.os === "windows" ? "\\" : "/"));
  await ensureDir(parentDir);
  await Deno.copyFile(src, dest);
}

/** Move a file from src to dest, creating parent dirs as needed. */
export async function moveFile(src: string, dest: string): Promise<void> {
  const sep = Deno.build.os === "windows" ? "\\" : "/";
  const parentDir = dest.substring(0, dest.lastIndexOf(sep));
  await ensureDir(parentDir);
  try {
    await Deno.rename(src, dest);
  } catch {
    // Cross-device move: copy then delete
    await Deno.copyFile(src, dest);
    await Deno.remove(src);
  }
}

/** Clean a directory by removing it and recreating it empty. */
export async function cleanDir(path: string): Promise<void> {
  await removeDir(path);
  await ensureDir(path);
  log.debug(`Cleaned directory: ${path}`);
}

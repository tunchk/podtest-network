import path from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Canonical persistent storage root (server-only).
 * Prefer STORAGE_ROOT in production (e.g. mounted volume `/data/podtest`).
 * Development default: `<cwd>/storage`.
 *
 * Do not log or expose this path to clients.
 */
export function getStorageRoot() {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.resolve(process.cwd(), "storage");
}

/** Private binaries / job inputs — outside public/ and never served statically. */
export function getPrivateStorageRoot() {
  return path.join(getStorageRoot(), "private");
}

/** Development-only mail sink directory (under storage root). */
export function getMailSinkDir() {
  return path.join(getStorageRoot(), "mail-sink");
}

export async function ensurePrivateDirs() {
  const root = getPrivateStorageRoot();
  await mkdir(path.join(root, "cvs"), { recursive: true });
  await mkdir(path.join(root, "job-inputs"), { recursive: true });
  return root;
}

export function cvFilePath(storedFilename: string) {
  return path.join(getPrivateStorageRoot(), "cvs", storedFilename);
}

export function jobInputPath(relativePath: string) {
  const root = getPrivateStorageRoot();
  const resolved = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

/** Retention: CV binaries kept until member deletes or soft-deleted after job failure cleanup window. */
export const CV_RETENTION = {
  maxUploadBytes: 5 * 1024 * 1024,
  maxExtractedChars: 50_000,
  failedJobInputKeepDays: 7,
  settledJobInputKeepDays: 30,
} as const;

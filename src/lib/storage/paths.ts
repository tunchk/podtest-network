import path from "node:path";
import { mkdir } from "node:fs/promises";

/** Private storage root — outside public/ and never served statically. */
export function getPrivateStorageRoot() {
  return path.resolve(process.cwd(), "storage", "private");
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
  if (!resolved.startsWith(root)) {
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

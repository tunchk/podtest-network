import path from "node:path";
import { config } from "dotenv";

/**
 * Load the same env files Next.js uses for local/dev:
 * `.env` then `.env.local` (local wins). Never loads test-only overrides.
 */
export function loadAppEnvironment() {
  const root = process.cwd();
  config({ path: path.resolve(root, ".env") });
  config({ path: path.resolve(root, ".env.local"), override: true });
}

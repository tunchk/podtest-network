import { config } from "dotenv";

// App-like base env for DB connectivity. Stub overrides are test-only and must
// not live in .env.local (so `npm run dev` cannot silently pick up stubs).
config({ path: ".env.local" });
config({ path: ".env" });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

// Deterministic AI stub only inside the Vitest process.
process.env.AI_PROVIDER = "stub";
process.env.AI_ALLOW_STUB = "true";
delete process.env.AI_DEMO_STUB;

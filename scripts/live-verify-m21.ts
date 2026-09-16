/**
 * Live M2.1 verification against running app+worker.
 * Does not print secrets or raw CV text.
 */
import { loadAppEnvironment } from "../src/lib/env/load-app-env";

loadAppEnvironment();

const BASE = process.env.LIVE_VERIFY_BASE_URL ?? "http://localhost:3000";
const suffix = Date.now().toString(36);
const email = `live-verify-${suffix}@example.invalid`;
const password = "LiveVerify1!";
const name = "Canlı Doğrulama";

const SYNTHETIC_CV = [
  "Ada Örnek",
  "Yazılım Kalite Mühendisi",
  "Beceri: Playwright, TypeScript, API testi",
  "Deneyim: Örnek şirketinde kalite güvence çalışmaları",
  "Eğitim: Örnek Üniversitesi, Bilgisayar Mühendisliği",
  "Konum: İstanbul",
].join("\n");

type Jar = Map<string, string>;

function storeCookies(jar: Jar, response: Response) {
  const anyHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : ([response.headers.get("set-cookie")].filter(Boolean) as string[]);
  for (const raw of list) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function api(jar: Jar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookies = cookieHeader(jar);
  if (cookies) headers.set("cookie", cookies);
  headers.set("origin", BASE);
  headers.set("referer", `${BASE}/`);
  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  storeCookies(jar, res);
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawLength: text.length };
  }
  return { res, json };
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function waitForReady(jar: Jar, jobId: string, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { res, json } = await api(jar, `/api/ai/profile-prepare?id=${jobId}`);
    assert(res.ok, `job poll failed: ${res.status}`);
    const status = json.job?.status;
    console.log(
      `poll status=${status} providerMode=${json.job?.providerMode} labeledStub=${json.job?.labeledStub}`,
    );
    if (status === "READY") return json.job;
    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(
        `job ended as ${status}: ${json.job?.safeErrorCode} ${json.job?.safeErrorMessage}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("timeout waiting for READY");
}

async function main() {
  const { prisma } = await import("../src/lib/db");
  const jar: Jar = new Map();
  console.log("base", BASE);
  console.log("email_domain", email.split("@")[1]);

  try {
    const signup = await api(jar, "/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    assert(signup.res.ok, `signup failed: ${signup.res.status}`);
    assert(signup.json?.user?.id, "missing user id");
    const userId = signup.json.user.id as string;
    console.log("signup_ok userId_prefix", userId.slice(0, 8));

    const status = await api(jar, "/api/ai/provider-status");
    assert(status.res.ok, "provider-status failed");
    console.log("provider_status", {
      mode: status.json.mode,
      demoStub: status.json.demoStub,
      hasOpenAiKey: status.json.hasOpenAiKey,
      openaiModel: status.json.openaiModel,
    });
    assert(status.json.mode === "openai", "expected live openai provider");
    assert(status.json.demoStub === false, "demo stub must be off");

    const profileBefore = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const publicSnapshotBefore = profileBefore.publicSnapshot;
    const draftRevisionBefore = profileBefore.draftRevision;
    console.log("profile_before", {
      draftRevision: draftRevisionBefore,
      published: profileBefore.published,
      publicSnapshotIsNull: publicSnapshotBefore == null,
    });

    const quote = await api(jar, "/api/ai/profile-prepare?quote=1");
    assert(quote.res.ok, "quote failed");
    console.log("quote", quote.json);
    if (!quote.json.canAfford) {
      await prisma.creditLot.create({
        data: {
          userId,
          source: "STAFF_GIFT",
          idempotencyKey: `live-verify-topup-${suffix}`,
          originalAmount: 2,
          remainingAmount: 2,
          reservedAmount: 0,
          provenance: "live-verification",
        },
      });
      const quote2 = await api(jar, "/api/ai/profile-prepare?quote=1");
      console.log("quote_after_topup", quote2.json);
      assert(quote2.json.canAfford, "still cannot afford after top-up");
    }

    const upload = await api(jar, "/api/cv", {
      method: "POST",
      body: JSON.stringify({ text: SYNTHETIC_CV }),
    });
    assert(
      upload.res.ok && upload.json?.ok,
      `upload failed: ${upload.res.status} ${upload.json?.code}`,
    );
    const cvDocumentId = upload.json.documentId as string;
    console.log(
      "upload_ok documentId_prefix",
      cvDocumentId.slice(0, 8),
      "chars",
      upload.json.extractedTextChars,
    );

    const create = await api(jar, "/api/ai/profile-prepare", {
      method: "POST",
      body: JSON.stringify({ cvDocumentId, confirmCost: true }),
    });
    assert(
      create.res.ok,
      `create job failed: ${create.res.status} ${JSON.stringify(create.json)}`,
    );
    const jobId = create.json.job.id as string;
    console.log("job_created", {
      id_prefix: jobId.slice(0, 8),
      status: create.json.job.status,
      cost: create.json.job.creditCostSnapshot,
    });
    assert(create.json.job.status === "QUEUED", "expected QUEUED");

    const ready = await waitForReady(jar, jobId);
    assert(ready.providerMode === "openai", `expected openai providerMode, got ${ready.providerMode}`);
    assert(ready.labeledStub === false, "must not be labeled stub");
    assert(ready.suggestions?.fields, "missing suggestions");
    const fieldKeys = Object.keys(ready.suggestions.fields).filter((k) => {
      const f = ready.suggestions.fields[k];
      return (
        f &&
        f.value != null &&
        String(Array.isArray(f.value) ? f.value.join(",") : f.value).trim()
      );
    });
    console.log("ready_ok", {
      fieldCount: fieldKeys.length,
      fields: fieldKeys,
      warningsCount: ready.suggestions.warnings?.length ?? 0,
      conflict: ready.resultConflict,
    });
    assert(fieldKeys.length > 0, "no usable suggestion fields");

    const settles = await prisma.creditLedgerEntry.findMany({
      where: { jobId, type: "SETTLE" },
    });
    const releases = await prisma.creditLedgerEntry.findMany({
      where: { jobId, type: "RELEASE" },
    });
    console.log("ledger", { settleCount: settles.length, releaseCount: releases.length });
    assert(settles.length === 1, `expected exactly 1 settle, got ${settles.length}`);
    assert(releases.length === 0, "unexpected release after success");

    const acceptField = fieldKeys.includes("skills")
      ? "skills"
      : fieldKeys.includes("headline")
        ? "headline"
        : fieldKeys[0]!;
    const suggestionValue = ready.suggestions.fields[acceptField].value;
    const current = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    const applyBody: Record<string, unknown> = {
      jobId,
      acceptedFields: [acceptField],
      edits: {},
      expectedDraftRevision: current.draftRevision,
    };
    if (acceptField === "skills" || acceptField === "interests" || acceptField === "languages") {
      (applyBody.edits as Record<string, unknown>)[acceptField] = Array.isArray(suggestionValue)
        ? suggestionValue
        : String(suggestionValue)
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean);
    } else {
      (applyBody.edits as Record<string, unknown>)[acceptField] = suggestionValue;
    }

    const apply = await api(jar, "/api/ai/profile-prepare/apply", {
      method: "POST",
      body: JSON.stringify(applyBody),
    });
    assert(apply.res.ok, `apply failed: ${apply.res.status} ${JSON.stringify(apply.json)}`);
    console.log("apply_ok", { acceptedField: acceptField, draftRevision: apply.json.draftRevision });

    const profileAfter = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    console.log("profile_after", {
      draftRevision: profileAfter.draftRevision,
      published: profileAfter.published,
      publicSnapshotUnchanged:
        JSON.stringify(profileAfter.publicSnapshot) === JSON.stringify(publicSnapshotBefore),
      fieldApplied: acceptField,
    });
    assert(profileAfter.draftRevision > draftRevisionBefore, "draft revision should increase");
    assert(
      JSON.stringify(profileAfter.publicSnapshot) === JSON.stringify(publicSnapshotBefore),
      "publicSnapshot changed",
    );
    assert(profileAfter.published === false, "profile should remain unpublished");

    const publicGet = await fetch(`${BASE}/api/public/profiles/${profileAfter.slug}`);
    console.log("public_api_status", publicGet.status);
    assert(publicGet.status === 404, "private draft leaked to public API");

    const finalJob = await api(jar, `/api/ai/profile-prepare?id=${jobId}`);
    assert(finalJob.json.job.status === "READY", "job no longer READY");
    assert(finalJob.json.job.providerMode === "openai", "UI job providerMode not openai");
    assert(finalJob.json.job.suggestions, "UI missing suggestions payload");

    console.log("LIVE_VERIFY_PASS");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("LIVE_VERIFY_FAIL", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

// Fixture emails from this script are registered in scripts/cleanup-verify-fixtures.ts

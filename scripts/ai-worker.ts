import { loadAppEnvironment } from "../src/lib/env/load-app-env";

// Must run before app modules read process.env (tsx executes this before dynamic imports below).
loadAppEnvironment();

async function main() {
  const { randomUUID } = await import("node:crypto");
  const { claimNextJob, processClaimedJob } = await import("../src/lib/ai/jobs");
  const { resolveProviderConfig } = await import("../src/lib/ai/provider");
  const { prisma } = await import("../src/lib/db");

  const once = process.argv.includes("--once");
  const workerId = process.env.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`;
  const pollMs = Number(process.env.AI_WORKER_POLL_MS ?? "1500");
  let stopping = false;
  let busy = false;

  const provider = resolveProviderConfig();
  console.log(
    `[ai-worker] starting ${workerId} once=${once} providerMode=${provider.mode} demoStub=${provider.demoStub}`,
  );
  if (provider.errorCode) {
    console.log(`[ai-worker] provider note: ${provider.errorCode}`);
  }

  async function tick() {
    const job = await claimNextJob(workerId);
    if (!job) return false;
    console.log(`[ai-worker] claimed ${job.id} attempt=${job.attemptCount}`);
    await processClaimedJob(job.id, workerId);
    console.log(`[ai-worker] finished processing ${job.id}`);
    return true;
  }

  async function finish(exitCode = 0) {
    try {
      await prisma.$disconnect();
    } catch {
      // ignore disconnect errors on shutdown
    }
    process.exit(exitCode);
  }

  function requestShutdown(signal: string) {
    if (stopping) return;
    stopping = true;
    console.log(`[ai-worker] ${signal} — stop claiming new work; waiting for in-flight job`);
    if (!busy) {
      void finish(0);
    }
  }

  process.on("SIGINT", () => requestShutdown("SIGINT"));
  process.on("SIGTERM", () => requestShutdown("SIGTERM"));

  if (once) {
    await tick();
    await finish(0);
    return;
  }

  while (!stopping) {
    try {
      busy = true;
      const worked = await tick();
      busy = false;
      if (stopping) break;
      if (!worked) {
        await new Promise((r) => setTimeout(r, pollMs));
      }
    } catch (error) {
      busy = false;
      console.error("[ai-worker] loop error", error instanceof Error ? error.message : "error");
      if (stopping) break;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  await finish(0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

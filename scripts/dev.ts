/**
 * Dev entry that starts Next.js + AI worker without forwarding stray CLI flags
 * (e.g. `npm run dev -- -p 3000`) into concurrently as a broken "-p" process.
 *
 * Port selection: DEV_WEB_PORT, or `-p <n>` / `--port <n>` on this script only.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

function readPort(argv: string[]) {
  const fromEnv = process.env.DEV_WEB_PORT;
  if (fromEnv && /^\d+$/.test(fromEnv)) return fromEnv;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "-p" || argv[i] === "--port") && argv[i + 1] && /^\d+$/.test(argv[i + 1]!)) {
      return argv[i + 1]!;
    }
  }
  return "3000";
}

const port = readPort(process.argv.slice(2));
const root = path.join(__dirname, "..");

const children: ChildProcess[] = [];

function start(label: string, command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  child.on("exit", (code, signal) => {
    console.log(`[dev:${label}] exited code=${code} signal=${signal}`);
    for (const other of children) {
      if (other !== child && !other.killed) other.kill("SIGTERM");
    }
    process.exit(code ?? 1);
  });
  children.push(child);
}

console.log(`[dev] web port=${port} (stray args ignored except -p/--port)`);
start("web", "npx", ["next", "dev", "-p", port]);
start("worker", "npx", ["tsx", "scripts/ai-worker.ts"]);

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

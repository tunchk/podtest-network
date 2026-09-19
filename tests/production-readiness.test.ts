import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import {
  getMailSinkDir,
  getPrivateStorageRoot,
  getStorageRoot,
  jobInputPath,
} from "@/lib/storage/paths";
import { assertMailSinkAllowed } from "@/lib/auth/email-verification";
import { checkHealth } from "@/lib/health";

describe("storage root resolution", () => {
  const previous = process.env.STORAGE_ROOT;

  afterEach(() => {
    if (previous === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = previous;
  });

  it("defaults to cwd/storage when STORAGE_ROOT is unset", () => {
    delete process.env.STORAGE_ROOT;
    expect(getStorageRoot()).toBe(path.resolve(process.cwd(), "storage"));
    expect(getPrivateStorageRoot()).toBe(path.resolve(process.cwd(), "storage", "private"));
    expect(getMailSinkDir()).toBe(path.resolve(process.cwd(), "storage", "mail-sink"));
  });

  it("resolves STORAGE_ROOT and derives private + mail-sink paths", () => {
    const root = path.join(os.tmpdir(), "podtest-storage-root-test");
    process.env.STORAGE_ROOT = root;
    expect(getStorageRoot()).toBe(path.resolve(root));
    expect(getPrivateStorageRoot()).toBe(path.resolve(root, "private"));
    expect(getMailSinkDir()).toBe(path.resolve(root, "mail-sink"));
    expect(jobInputPath("job-inputs/x.txt")).toBe(
      path.resolve(root, "private", "job-inputs", "x.txt"),
    );
  });

  it("rejects path traversal outside private root", () => {
    const root = path.join(os.tmpdir(), "podtest-storage-root-test");
    process.env.STORAGE_ROOT = root;
    expect(() => jobInputPath("../outside.txt")).toThrow(/Invalid storage path/);
  });
});

describe("mail-sink production guard", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = previousNodeEnv;
  });

  it("allows mail sink outside production", () => {
    expect(() => assertMailSinkAllowed("test")).not.toThrow();
    expect(() => assertMailSinkAllowed("development")).not.toThrow();
  });

  it("fails clearly in production", () => {
    expect(() => assertMailSinkAllowed("production")).toThrow(/MAIL_SINK_DISABLED/);
  });

  it("requestEmailVerification refuses to write sink in production", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const { requestEmailVerification } = await import("@/lib/auth/email-verification");
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    const db = new PrismaClient({ adapter });
    const suffix = Date.now().toString(36);
    const user = await db.user.create({
      data: {
        name: "mail-sink-prod",
        email: `mail-sink-prod-${suffix}@example.com`,
        emailVerified: false,
        staffRole: "MEMBER",
      },
    });
    try {
      await expect(requestEmailVerification(user.id)).rejects.toMatchObject({
        code: "MAIL_SINK_DISABLED",
      });
      const tokens = await db.emailVerificationToken.count({ where: { userId: user.id } });
      expect(tokens).toBe(0);
    } finally {
      await db.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  });
});

describe("health check", () => {
  it("returns ok when the database is reachable", async () => {
    const result = await checkHealth();
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it("returns generic failure when the database is unavailable", async () => {
    const result = await checkHealth({
      ping: async () => {
        throw new Error("connection refused ECONNREFUSED postgresql://secret");
      },
    });
    expect(result).toEqual({ ok: false, status: 503 });
    expect(JSON.stringify(result)).not.toMatch(/postgresql|secret|ECONNREFUSED/i);
  });
});

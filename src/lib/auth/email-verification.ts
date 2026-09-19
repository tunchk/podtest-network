import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { EMAIL_VERIFICATION_TTL_HOURS } from "@/lib/community/constants";
import { getMailSinkDir } from "@/lib/storage/paths";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

/** Development-only local sink. Production must not silently "send" mail this way. */
export function assertMailSinkAllowed(nodeEnv: string | undefined = process.env.NODE_ENV) {
  if (nodeEnv === "production") {
    fail("MAIL_SINK_DISABLED");
  }
}

export function hashOpaqueToken(plaintext: string) {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Request email verification. Writes a local mail-sink file — never sends real email.
 * Disabled under NODE_ENV=production (no silent fake delivery).
 * Does not log the plaintext token.
 *
 * MVP note: outbound email is not required for Kariyer Portresi launch when
 * host bootstrap uses trusted ops `--mark-email-verified`. Flows that truly
 * depend on emailVerified (e.g. some invitation accept paths) need a real
 * provider or ops verification before enabling those features in production.
 */
export async function requestEmailVerification(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user) fail("NOT_FOUND");
  if (user.emailVerified) {
    return { alreadyVerified: true as const };
  }

  assertMailSinkAllowed();

  const plaintext = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(plaintext);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  const sinkDir = getMailSinkDir();
  await mkdir(sinkDir, { recursive: true });
  const fileName = `email-verify-${userId}-${Date.now()}.json`;
  // Store only enough for local testing; path is gitignored under storage/.
  await writeFile(
    path.join(sinkDir, fileName),
    JSON.stringify(
      {
        kind: "email_verification",
        to: user.email,
        userId,
        expiresAt: expiresAt.toISOString(),
        // Local sink only — never log this path content in app logs.
        verifyPath: `/hesabim/eposta-dogrula?token=${plaintext}`,
        createdAt: new Date().toISOString(),
        note: "Local mail-sink. No real email was sent.",
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    alreadyVerified: false as const,
    expiresAt,
    sinkFile: fileName,
    // Returned only to the authenticated owner for local/dev UX — not logged.
    plaintextTokenForOwner: plaintext,
  };
}

/**
 * Confirm email with opaque token. Never trusts client-claimed verified flags.
 */
export async function confirmEmailVerification(options: {
  userId: string;
  token: string;
}) {
  const tokenHash = hashOpaqueToken(options.token);
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });
  if (!row || row.userId !== options.userId) fail("INVALID_TOKEN");
  if (row.consumedAt) fail("TOKEN_USED");
  if (row.expiresAt.getTime() <= Date.now()) fail("TOKEN_EXPIRED");

  await prisma.$transaction(async (tx) => {
    const locked = await tx.emailVerificationToken.findUnique({
      where: { id: row.id },
    });
    if (!locked || locked.consumedAt) fail("TOKEN_USED");
    if (locked.expiresAt.getTime() <= Date.now()) fail("TOKEN_EXPIRED");

    await tx.emailVerificationToken.update({
      where: { id: locked.id },
      data: { consumedAt: new Date() },
    });
    await tx.user.update({
      where: { id: options.userId },
      data: { emailVerified: true },
    });
  });

  return { verified: true as const };
}

export async function isEmailVerified(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  return Boolean(user?.emailVerified);
}

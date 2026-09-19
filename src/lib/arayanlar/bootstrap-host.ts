import { prisma } from "@/lib/db";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";

export type BootstrapHostResult = {
  userId: string;
  email: string;
  authorizationId: string;
  emailVerifiedMarked: boolean;
  alreadyAuthorized: boolean;
};

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

/**
 * Trusted ops bootstrap for host authorization.
 * Does not weaken runtime `isAuthorizedHost()` — only grants via `grantHostAuthorization`.
 * Never alters `staffRole`.
 */
export async function bootstrapHostAuthorization(options: {
  targetEmail: string;
  granterEmail: string;
  markEmailVerified?: boolean;
}): Promise<BootstrapHostResult> {
  const targetEmail = options.targetEmail.trim().toLowerCase();
  const granterEmail = options.granterEmail.trim().toLowerCase();
  const markEmailVerified = Boolean(options.markEmailVerified);

  const user = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!user) fail("USER_NOT_FOUND", `No user found for ${targetEmail}`);

  const granter = await prisma.user.findUnique({ where: { email: granterEmail } });
  if (!granter) fail("GRANTER_NOT_FOUND", `Granter not found: ${granterEmail}`);

  if (granter.staffRole !== "ADMIN") {
    fail("GRANTER_NOT_ADMIN", "Host bootstrap requires an ADMIN granter (--by).");
  }

  let emailVerifiedMarked = false;

  if (!user.emailVerified) {
    if (!markEmailVerified) {
      fail(
        "EMAIL_NOT_VERIFIED",
        `User ${targetEmail} is not emailVerified. Re-run with --mark-email-verified (ADMIN granter required), or verify the account first.`,
      );
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
    emailVerifiedMarked = true;
  }

  const existing = await prisma.hostAuthorization.findUnique({
    where: { userId: user.id },
  });
  const alreadyAuthorized = Boolean(existing && !existing.revokedAt);

  const provenance = markEmailVerified
    ? `bootstrap-host-script:mark-email-verified:${granter.email}`
    : `bootstrap-host-script:${granter.email}`;

  const authz = await grantHostAuthorization({
    userId: user.id,
    grantedByUserId: granter.id,
    provenance,
  });

  return {
    userId: user.id,
    email: user.email,
    authorizationId: authz.id,
    emailVerifiedMarked,
    alreadyAuthorized,
  };
}

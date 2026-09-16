import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Milestone 1: no outbound mail. Accounts are usable immediately in local/dev.
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      staffRole: {
        type: ["MEMBER", "MODERATOR", "ADMIN"],
        required: false,
        defaultValue: "MEMBER",
        input: false,
        returned: true,
      },
      aiUsagePolicy: {
        type: ["STANDARD", "UNLIMITED_INTERNAL"],
        required: false,
        defaultValue: "STANDARD",
        // Ops CLI only — members must not self-elevate via auth/profile APIs.
        input: false,
        returned: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const { createDefaultProfileForUser } = await import("@/lib/profiles/service");
          const existing = await prisma.profile.findUnique({ where: { userId: user.id } });
          if (!existing) {
            await createDefaultProfileForUser({
              id: user.id,
              name: user.name,
              email: user.email,
            });
          }
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;

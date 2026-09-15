import { prisma } from "@/lib/db";

export async function ensureMessagingPreferences(userId: string) {
  return prisma.messagingPreferences.upsert({
    where: { userId },
    create: { userId, acceptMessageRequests: true, updatedAt: new Date() },
    update: {},
  });
}

export async function getMessagingPreferences(userId: string) {
  return ensureMessagingPreferences(userId);
}

export async function updateMessagingPreferences(options: {
  userId: string;
  acceptMessageRequests: boolean;
}) {
  await ensureMessagingPreferences(options.userId);
  return prisma.messagingPreferences.update({
    where: { userId: options.userId },
    data: {
      acceptMessageRequests: options.acceptMessageRequests,
      updatedAt: new Date(),
    },
  });
}

export async function isMessagingTemporarilyRestricted(userId: string) {
  const prefs = await ensureMessagingPreferences(userId);
  if (!prefs.messagingRestrictedUntil) return false;
  return prefs.messagingRestrictedUntil.getTime() > Date.now();
}

export async function setMessagingRestriction(options: {
  userId: string;
  until: Date | null;
}) {
  await ensureMessagingPreferences(options.userId);
  return prisma.messagingPreferences.update({
    where: { userId: options.userId },
    data: { messagingRestrictedUntil: options.until, updatedAt: new Date() },
  });
}

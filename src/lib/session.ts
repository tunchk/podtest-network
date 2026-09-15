import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { StaffRole } from "@/generated/prisma/client";

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) {
    redirect("/giris");
  }
  return session;
}

export async function getCurrentUserRecord() {
  const session = await getSession();
  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });
}

export function isStaffRole(
  role: StaffRole | string | null | undefined,
  allowed: StaffRole[],
) {
  if (!role) return false;
  return allowed.includes(role as StaffRole);
}

export async function requireStaff(allowed: StaffRole[] = ["ADMIN", "MODERATOR"]) {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, staffRole: true, name: true },
  });

  if (!user || !isStaffRole(user.staffRole, allowed)) {
    redirect("/");
  }

  return { session, user };
}

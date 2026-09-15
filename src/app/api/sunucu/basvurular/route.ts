import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listApplicationsForAdmin, listApplicationsForHost } from "@/lib/arayanlar/service";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { staffRole: true },
  });
  const host = await isAuthorizedHost(session.user.id);
  const staff = user && isStaffRole(user.staffRole, ["ADMIN"]);

  if (!host && !staff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (staff) {
    const applications = await listApplicationsForAdmin();
    return NextResponse.json({ role: "admin", applications });
  }

  const applications = await listApplicationsForHost(session.user.id);
  return NextResponse.json({ role: "host", applications });
}

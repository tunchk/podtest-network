import { NextResponse } from "next/server";
import { getSession, isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assignHost } from "@/lib/arayanlar/service";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { staffRole: true },
  });
  if (!admin || !isStaffRole(admin.staffRole, ["ADMIN"])) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    applicationId?: string;
    hostUserId?: string;
    hostEmail?: string;
  };

  try {
    if (body.action === "grant_host") {
      let hostUserId = body.hostUserId;
      if (!hostUserId && body.hostEmail) {
        const host = await prisma.user.findUnique({
          where: { email: body.hostEmail.toLowerCase() },
        });
        if (!host) return NextResponse.json({ error: "host_not_found" }, { status: 404 });
        hostUserId = host.id;
      }
      if (!hostUserId) {
        return NextResponse.json({ error: "host_required" }, { status: 400 });
      }
      const authz = await grantHostAuthorization({
        userId: hostUserId,
        grantedByUserId: session.user.id,
        provenance: "admin-api",
      });
      return NextResponse.json({ authorization: authz });
    }

    if (body.action === "assign" && body.applicationId && (body.hostUserId || body.hostEmail)) {
      let hostUserId = body.hostUserId;
      if (!hostUserId && body.hostEmail) {
        const host = await prisma.user.findUnique({
          where: { email: body.hostEmail.toLowerCase() },
        });
        if (!host) return NextResponse.json({ error: "host_not_found" }, { status: 404 });
        hostUserId = host.id;
      }
      const app = await assignHost({
        applicationId: body.applicationId,
        hostUserId: hostUserId!,
        assignedByUserId: session.user.id,
      });
      return NextResponse.json({ application: { id: app.id, assignedHostUserId: app.assignedHostUserId } });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}

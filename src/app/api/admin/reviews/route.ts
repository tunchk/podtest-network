import { NextResponse } from "next/server";
import { getSession, isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listPendingReviews, resolvePublicationReview } from "@/lib/profiles/service";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { staffRole: true },
  });

  if (!user || !isStaffRole(user.staffRole, ["ADMIN", "MODERATOR"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviews = await listPendingReviews();
  return NextResponse.json({ reviews });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, staffRole: true },
  });

  if (!user || !isStaffRole(user.staffRole, ["ADMIN", "MODERATOR"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    reviewId?: string;
    decision?: "APPROVED" | "REJECTED";
    reason?: string;
  };

  if (!body.reviewId || !body.decision) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const resolved = await resolvePublicationReview({
    reviewId: body.reviewId,
    reviewerId: user.id,
    decision: body.decision,
    reason: body.reason,
  });

  return NextResponse.json({ review: resolved });
}

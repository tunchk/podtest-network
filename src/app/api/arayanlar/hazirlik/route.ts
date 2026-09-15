import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGuestBriefForMember } from "@/lib/arayanlar/service";

/** Guest brief only — never returns host pack fields. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const brief = await getGuestBriefForMember(session.user.id);
  if (!brief) {
    return NextResponse.json({ error: "not_ready" }, { status: 404 });
  }

  return NextResponse.json(brief);
}

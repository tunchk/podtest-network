import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listInbox, getUnreadTotal } from "@/lib/messaging/conversations";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [inbox, unreadTotal] = await Promise.all([
    listInbox(session.user.id),
    getUnreadTotal(session.user.id),
  ]);

  return NextResponse.json({ inbox, unreadTotal });
}

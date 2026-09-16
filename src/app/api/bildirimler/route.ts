import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  listNotifications,
  markAllRead,
  markRead,
  resolveNotificationDestination,
  unreadCount,
} from "@/lib/notifications/service";

function errorResponse(error: unknown) {
  const code =
    error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
  const status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 400;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const takeRaw = url.searchParams.get("take");
  const take = takeRaw ? Number(takeRaw) : undefined;

  const [listed, unread] = await Promise.all([
    listNotifications(session.user.id, {
      cursor,
      take: Number.isFinite(take) ? take : undefined,
    }),
    unreadCount(session.user.id),
  ]);

  const items = await Promise.all(
    listed.items.map(async (n) => {
      const destination = await resolveNotificationDestination(n, session.user.id);
      return {
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        href: n.href,
        readAt: n.readAt,
        createdAt: n.createdAt,
        destination,
      };
    }),
  );

  return NextResponse.json({
    items,
    nextCursor: listed.nextCursor,
    unreadCount: unread,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    notificationId?: string;
  };

  try {
    if (body.action === "mark_all_read") {
      const result = await markAllRead(session.user.id);
      return NextResponse.json(result);
    }

    if (body.action === "mark_read") {
      if (!body.notificationId) {
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const notification = await markRead({
        userId: session.user.id,
        notificationId: body.notificationId,
      });
      return NextResponse.json({
        notification: {
          id: notification.id,
          readAt: notification.readAt,
        },
      });
    }

    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

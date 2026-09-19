import { getSession, isStaffRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { isAuthorizedHost } from "@/lib/arayanlar/host-auth";
import { unreadCount } from "@/lib/notifications/service";
import { getUnreadTotal } from "@/lib/messaging/conversations";
import { listActiveWorkspacesForUser } from "@/lib/hiring/access";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";
import { SiteNav } from "@/components/site-nav";

export async function SiteHeader() {
  const session = await getSession();
  let staff = false;
  let host = false;
  let employer = false;
  let notificationUnread = 0;
  let messageUnread = 0;
  const accountLabel = session?.user?.name || session?.user?.email || "";
  const accountEmail =
    session?.user?.email && session.user.name ? session.user.email : undefined;

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { staffRole: true },
    });
    staff = Boolean(user && isStaffRole(user.staffRole, ["ADMIN", "MODERATOR"]));
    host = await isAuthorizedHost(session.user.id);
    notificationUnread = await unreadCount(session.user.id);
    messageUnread = await getUnreadTotal(session.user.id);

    const workspaces = await listActiveWorkspacesForUser(session.user.id);
    if (workspaces.length > 0) {
      employer = true;
    } else {
      const createCap = await evaluateUserCapability(
        session.user.id,
        "hiring.workspace.create",
      );
      employer = createCap.allowed;
    }
  }

  return (
    <SiteNav
      signedIn={Boolean(session?.user)}
      staff={staff}
      host={host}
      employer={employer}
      notificationUnread={notificationUnread}
      messageUnread={messageUnread}
      accountLabel={accountLabel}
      accountEmail={accountEmail}
    />
  );
}

import { requireSession } from "@/lib/session";
import { ConversationView } from "@/components/messaging/conversation-view";
import { assertConversationMember } from "@/lib/messaging/conversations";
import { redirect } from "next/navigation";

type Props = { params: Promise<{ conversationId: string }> };

export default async function ConversationPage({ params }: Props) {
  const session = await requireSession();
  const { conversationId } = await params;
  try {
    await assertConversationMember(conversationId, session.user.id);
  } catch {
    redirect("/mesajlar");
  }

  return (
    <ConversationView conversationId={conversationId} currentUserId={session.user.id} />
  );
}

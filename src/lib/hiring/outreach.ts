import { prisma } from "@/lib/db";
import { createMessageRequest } from "@/lib/messaging/requests";
import { requireWorkspaceMember } from "@/lib/hiring/access";
import { resolveCandidateVisibility } from "@/lib/hiring/discovery";

function fail(code: string): never {
  throw Object.assign(new Error(code), { code });
}

/**
 * Recruiter-initiated message request. Uses sender quota; workspace context in intro only.
 * Colleagues cannot read the conversation via workspace membership.
 */
export async function contactCandidateFromWorkspace(options: {
  recruiterId: string;
  workspaceId: string;
  subjectUserId: string;
  message: string;
  idempotencyKey: string;
  jobTitle?: string;
}) {
  await requireWorkspaceMember({ userId: options.recruiterId, workspaceId: options.workspaceId });

  const workspace = await prisma.employerWorkspace.findUnique({
    where: { id: options.workspaceId },
  });
  if (!workspace) fail("NOT_FOUND");

  const vis = await resolveCandidateVisibility(options.subjectUserId);
  if (!vis.available) fail("CANDIDATE_NOT_AVAILABLE");

  const introParts = [
    `[${workspace.name} — işveren çalışma alanı]`,
    options.jobTitle ? `İlan: ${options.jobTitle}` : null,
    options.message.trim(),
  ].filter(Boolean);

  return createMessageRequest({
    senderId: options.recruiterId,
    recipientId: options.subjectUserId,
    introduction: introParts.join("\n\n"),
    idempotencyKey: options.idempotencyKey,
  });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateOwnedProfileDraft, getOwnedProfile } from "@/lib/profiles/service";

/**
 * Direct API surface used by authorization tests.
 * Never trusts a client-supplied userId as authentication.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOwnedProfile(session.user.id);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: profile.id,
    userId: profile.userId,
    displayName: profile.displayName,
    slug: profile.slug,
    publicationStatus: profile.publicationStatus,
    published: profile.published,
    email: undefined,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    userId?: string;
    displayName?: string;
    bio?: string;
  };

  // Reject attempts to act as another user via body.userId
  if (body.userId && body.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await updateOwnedProfileDraft(session.user.id, {
    displayName: body.displayName,
    bio: body.bio ?? undefined,
  });

  return NextResponse.json({
    id: updated.id,
    displayName: updated.displayName,
    bio: updated.bio,
  });
}

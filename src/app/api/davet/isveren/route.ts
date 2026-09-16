import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { acceptEmployerMembershipInvitation } from "@/lib/hiring/invitations";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  if (!body.token) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }
  try {
    const result = await acceptEmployerMembershipInvitation({
      userId: session.user.id,
      token: body.token,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? String((error as { code: string }).code) : "error";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}

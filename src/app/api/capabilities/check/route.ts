import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { evaluateUserCapability } from "@/lib/capabilities/evaluate";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { capabilityKey?: string };
  if (!body.capabilityKey) {
    return NextResponse.json({ error: "capabilityKey required" }, { status: 400 });
  }

  const result = await evaluateUserCapability(session.user.id, body.capabilityKey);
  return NextResponse.json(result, { status: result.allowed ? 200 : 403 });
}

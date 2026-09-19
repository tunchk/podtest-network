import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

/** Liveness + DB reachability. Safe for load balancers — no secrets. */
export async function GET() {
  const result = await checkHealth();
  if (!result.ok) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { resolveProviderConfig } from "@/lib/ai/provider";

/** Non-secret provider status for authorized members (UI labeling). */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolution = resolveProviderConfig();
  return NextResponse.json({
    mode: resolution.mode,
    demoStub: resolution.demoStub,
    errorCode: resolution.errorCode ?? null,
    openaiModel: resolution.mode === "openai" ? process.env.OPENAI_MODEL ?? "gpt-4o-mini" : null,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
  });
}

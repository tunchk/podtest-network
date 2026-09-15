import { NextResponse } from "next/server";
import { getPublicProfileBySlug } from "@/lib/profiles/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const result = await getPublicProfileBySlug(slug);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ profile: result.view });
}

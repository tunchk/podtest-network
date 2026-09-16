import { NextResponse } from "next/server";
import { listPublicJobs } from "@/lib/hiring/jobs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const list = await listPublicJobs(page);
  return NextResponse.json(list);
}

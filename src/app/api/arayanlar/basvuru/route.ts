import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  confirmCostAndStart,
  getOrCreateApplication,
  quoteArayanlarPrepare,
  reconcileArayanlarPrepStatusFromJob,
  toGuestApplicationView,
} from "@/lib/arayanlar/service";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const quote = await quoteArayanlarPrepare(session.user.id);
  await getOrCreateApplication(session.user.id);
  const app = await reconcileArayanlarPrepStatusFromJob(session.user.id);
  return NextResponse.json({
    quote,
    application: app ? toGuestApplicationView(app) : null,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  if (body.action === "confirm_cost") {
    const app = await confirmCostAndStart(session.user.id);
    const quote = await quoteArayanlarPrepare(session.user.id);
    return NextResponse.json({
      quote,
      application: toGuestApplicationView(app),
    });
  }

  const app = await getOrCreateApplication(session.user.id);
  const quote = await quoteArayanlarPrepare(session.user.id);
  return NextResponse.json({ quote, application: toGuestApplicationView(app) });
}

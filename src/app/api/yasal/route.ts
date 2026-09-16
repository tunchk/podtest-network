import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  ensureLegalDocumentsSeeded,
  getCurrentDocument,
  hasCurrentAcceptance,
  listAcceptancesForUser,
  listConfiguredSubprocessors,
  recordAcceptance,
  withdrawAcceptance,
} from "@/lib/legal/service";
import { CURRENT_LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import type { LegalAcceptanceType, LegalDocumentType, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { isStaffRole } from "@/lib/session";

export async function GET(request: Request) {
  await ensureLegalDocumentsSeeded();
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") as LegalDocumentType | null;
  const mine = searchParams.get("mine") === "1";
  const subprocessors = searchParams.get("subprocessors") === "1";
  const userId = searchParams.get("userId");

  if (subprocessors) {
    return NextResponse.json({ subprocessors: listConfiguredSubprocessors() });
  }

  if (mine) {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const acceptances = await listAcceptancesForUser(session.user.id);
    const current = Object.fromEntries(
      await Promise.all(
        CURRENT_LEGAL_DOCUMENTS.map(async (d) => [
          d.type,
          await hasCurrentAcceptance({
            userId: session.user.id,
            type: d.acceptanceType,
            documentType: d.type,
          }),
        ]),
      ),
    );
    return NextResponse.json({ acceptances, current });
  }

  if (userId) {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const staff = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { staffRole: true },
    });
    if (!staff || !isStaffRole(staff.staffRole, ["ADMIN", "MODERATOR"])) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const acceptances = await listAcceptancesForUser(userId);
    return NextResponse.json({ acceptances });
  }

  if (type) {
    const doc = await getCurrentDocument(type);
    return NextResponse.json({
      document: {
        type: doc.type,
        version: doc.version,
        locale: doc.locale,
        title: doc.title,
        summary: doc.summary,
        bodyMarkdown: doc.bodyMarkdown,
        effectiveFrom: doc.effectiveFrom,
      },
      catalog: CURRENT_LEGAL_DOCUMENTS.map((d) => ({
        type: d.type,
        version: d.version,
        title: d.title,
        summary: d.summary,
      })),
    });
  }

  return NextResponse.json({
    catalog: CURRENT_LEGAL_DOCUMENTS.map((d) => ({
      type: d.type,
      version: d.version,
      title: d.title,
      summary: d.summary,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "accept" | "withdraw";
    type?: LegalAcceptanceType;
    documentType?: LegalDocumentType;
    scope?: string;
    relatedResourceType?: string;
    relatedResourceId?: string;
    metadata?: Record<string, unknown>;
    acceptanceId?: string;
    checked?: boolean;
  };

  if (body.action === "withdraw") {
    if (!body.acceptanceId) {
      return NextResponse.json({ error: "acceptanceId_required" }, { status: 400 });
    }
    const row = await withdrawAcceptance({
      userId: session.user.id,
      acceptanceId: body.acceptanceId,
    });
    return NextResponse.json({ ok: true, acceptance: row });
  }

  // Explicit unchecked boxes must never be treated as accepted.
  if (body.checked !== true) {
    return NextResponse.json(
      { error: "explicit_check_required", message: "Onay kutusu işaretlenmeden kabul kaydedilmez." },
      { status: 400 },
    );
  }
  if (!body.type || !body.documentType) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const acceptance = await recordAcceptance({
      userId: session.user.id,
      type: body.type,
      documentType: body.documentType,
      scope: body.scope,
      relatedResourceType: body.relatedResourceType,
      relatedResourceId: body.relatedResourceId,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    });
    return NextResponse.json({ ok: true, acceptance });
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

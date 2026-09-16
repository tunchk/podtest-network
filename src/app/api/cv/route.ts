import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { storeCvUpload, storePasteTextAsCv, deleteOwnedCv, assertOwnedCv } from "@/lib/cv/service";
import { prisma } from "@/lib/db";
import { recordAcceptance } from "@/lib/legal/service";

async function recordCvUploadNotices(options: {
  userId: string;
  cvDocumentId: string;
  noticeAck: boolean;
  aiDisclosure: boolean;
  aiConsent: boolean;
}) {
  if (!options.noticeAck || !options.aiDisclosure) {
    return {
      ok: false as const,
      code: "LEGAL_CV_NOTICE_REQUIRED",
      message: "CV yüklemeden önce aydınlatma ve AI bilgilendirme onayları zorunludur.",
    };
  }

  await recordAcceptance({
    userId: options.userId,
    type: "CV_AI_PROCESSING",
    documentType: "CV_AI_PROCESSING_NOTICE",
    scope: "cv_upload",
    relatedResourceType: "cv_document",
    relatedResourceId: options.cvDocumentId,
    metadata: { aiDisclosureAcknowledged: true },
  });

  if (options.aiConsent) {
    await recordAcceptance({
      userId: options.userId,
      type: "CV_AI_CONSENT",
      documentType: "CV_AI_CONSENT",
      scope: "cv_upload",
      relatedResourceType: "cv_document",
      relatedResourceId: options.cvDocumentId,
    });
  }

  return { ok: true as const };
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await prisma.cvDocument.findMany({
    where: { userId: session.user.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalFilename: true,
      mimeType: true,
      byteSize: true,
      extractionStatus: true,
      extractionErrorCode: true,
      extractedTextChars: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ documents: docs });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      text?: string;
      userId?: string;
      cvNoticeAck?: boolean;
      cvAiDisclosure?: boolean;
      cvAiConsent?: boolean;
    };
    if (body.userId && body.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.cvNoticeAck !== true || body.cvAiDisclosure !== true) {
      return NextResponse.json(
        {
          ok: false,
          code: "LEGAL_CV_NOTICE_REQUIRED",
          message: "CV kaydı için aydınlatma ve AI bilgilendirme kutuları işaretlenmelidir.",
        },
        { status: 400 },
      );
    }
    const result = await storePasteTextAsCv(session.user.id, body.text ?? "");
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    const legal = await recordCvUploadNotices({
      userId: session.user.id,
      cvDocumentId: result.documentId,
      noticeAck: true,
      aiDisclosure: true,
      aiConsent: body.cvAiConsent === true,
    });
    if (!legal.ok) {
      return NextResponse.json(legal, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const form = await request.formData();
  const forgedUserId = form.get("userId");
  if (typeof forgedUserId === "string" && forgedUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const noticeAck = form.get("cvNoticeAck") === "true";
  const aiDisclosure = form.get("cvAiDisclosure") === "true";
  const aiConsent = form.get("cvAiConsent") === "true";
  if (!noticeAck || !aiDisclosure) {
    return NextResponse.json(
      {
        ok: false,
        code: "LEGAL_CV_NOTICE_REQUIRED",
        message: "CV yüklemeden önce aydınlatma ve AI bilgilendirme kutuları işaretlenmelidir.",
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, code: "missing_file", message: "Dosya gerekli." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeCvUpload({
    userId: session.user.id,
    filename: file.name || "cv.bin",
    buffer,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  const legal = await recordCvUploadNotices({
    userId: session.user.id,
    cvDocumentId: result.documentId,
    noticeAck: true,
    aiDisclosure: true,
    aiConsent,
  });
  if (!legal.ok) {
    return NextResponse.json(legal, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    await assertOwnedCv(id, session.user.id);
    await deleteOwnedCv(id, session.user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

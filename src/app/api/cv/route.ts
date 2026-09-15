import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { storeCvUpload, storePasteTextAsCv, deleteOwnedCv, assertOwnedCv } from "@/lib/cv/service";
import { prisma } from "@/lib/db";

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
    const body = (await request.json()) as { text?: string; userId?: string };
    if (body.userId && body.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const result = await storePasteTextAsCv(session.user.id, body.text ?? "");
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  }

  const form = await request.formData();
  const forgedUserId = form.get("userId");
  if (typeof forgedUserId === "string" && forgedUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

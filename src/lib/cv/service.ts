import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import fileType from "file-type";
import mammoth from "mammoth";
import { prisma } from "@/lib/db";
import {
  CV_RETENTION,
  cvFilePath,
  ensurePrivateDirs,
  getPrivateStorageRoot,
} from "@/lib/storage/paths";

export type CvUploadResult =
  | { ok: true; documentId: string; extractionStatus: string; extractedTextChars: number }
  | { ok: false; code: string; message: string };

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function turkishError(code: string): string {
  switch (code) {
    case "too_large":
      return `Dosya en fazla ${Math.floor(CV_RETENTION.maxUploadBytes / (1024 * 1024))} MB olabilir.`;
    case "unsupported_type":
      return "Yalnızca metin içeren PDF, DOCX veya düz metin desteklenir. Şifreli, taranmış (görüntü) veya bozuk dosyalar işlenemez — metni yapıştırmayı deneyin.";
    case "encrypted":
      return "Dosya şifreli görünüyor. Kilidi kaldırılmış bir kopya yükleyin veya metni yapıştırın.";
    case "empty_scanned":
      return "Dosyadan okunabilir metin çıkarılamadı (muhtemelen taranmış görüntü). Metni yapıştırmayı deneyin.";
    case "malformed":
      return "Dosya bozuk veya okunamadı. Başka bir dosya deneyin veya metni yapıştırın.";
    case "unauthorized":
      return "Bu işlem için oturum gerekli.";
    default:
      return "Dosya işlenemedi. Metni yapıştırmayı deneyin.";
  }
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; encrypted?: boolean }> {
  try {
    const { PDFParse, PasswordException } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return { text: result.text ?? "" };
    } finally {
      await parser.destroy?.();
    }
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      name === "PasswordException" ||
      message.includes("password") ||
      message.includes("encrypt")
    ) {
      return { text: "", encrypted: true };
    }
    // PasswordException may be a class
    try {
      const mod = await import("pdf-parse");
      if (mod.PasswordException && error instanceof mod.PasswordException) {
        return { text: "", encrypted: true };
      }
    } catch {
      // ignore
    }
    throw error;
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function truncateText(text: string) {
  const normalized = text.replace(/\u0000/g, "").trim();
  if (normalized.length <= CV_RETENTION.maxExtractedChars) {
    return normalized;
  }
  return normalized.slice(0, CV_RETENTION.maxExtractedChars);
}

export async function storeCvUpload(options: {
  userId: string;
  filename: string;
  buffer: Buffer;
}): Promise<CvUploadResult> {
  await ensurePrivateDirs();

  if (options.buffer.byteLength > CV_RETENTION.maxUploadBytes) {
    return { ok: false, code: "too_large", message: turkishError("too_large") };
  }

  const detected = await fileType.fromBuffer(options.buffer);
  const ext = path.extname(options.filename).toLowerCase();
  let mime: string | undefined = detected?.mime;

  if (!mime && ext === ".txt") {
    mime = "text/plain";
  }
  if (!mime && ext === ".docx") {
    mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (!mime && ext === ".pdf") {
    mime = "application/pdf";
  }

  if (!mime || !ALLOWED_MIME.has(mime)) {
    return { ok: false, code: "unsupported_type", message: turkishError("unsupported_type") };
  }

  // Extension must agree with content class
  if (mime === "application/pdf" && ext && ext !== ".pdf") {
    return { ok: false, code: "unsupported_type", message: turkishError("unsupported_type") };
  }
  if (mime.includes("wordprocessingml") && ext && ext !== ".docx") {
    return { ok: false, code: "unsupported_type", message: turkishError("unsupported_type") };
  }

  const storedFilename = `${randomUUID()}${mime === "application/pdf" ? ".pdf" : mime === "text/plain" ? ".txt" : ".docx"}`;
  const absolute = cvFilePath(storedFilename);
  await writeFile(absolute, options.buffer);

  const sha256 = createHash("sha256").update(options.buffer).digest("hex");
  let extractionStatus: "OK" | "UNSUPPORTED" | "ENCRYPTED" | "EMPTY_SCANNED" | "MALFORMED" | "ERROR" =
    "OK";
  let extractionErrorCode: string | null = null;
  let extracted = "";

  try {
    if (mime === "application/pdf") {
      const pdf = await extractPdfText(options.buffer);
      if (pdf.encrypted) {
        extractionStatus = "ENCRYPTED";
        extractionErrorCode = "encrypted";
      } else {
        extracted = truncateText(pdf.text);
        if (!extracted) {
          extractionStatus = "EMPTY_SCANNED";
          extractionErrorCode = "empty_scanned";
        }
      }
    } else if (mime.includes("wordprocessingml")) {
      extracted = truncateText(await extractDocxText(options.buffer));
      if (!extracted) {
        extractionStatus = "EMPTY_SCANNED";
        extractionErrorCode = "empty_scanned";
      }
    } else {
      extracted = truncateText(options.buffer.toString("utf8"));
      if (!extracted) {
        extractionStatus = "EMPTY_SCANNED";
        extractionErrorCode = "empty_scanned";
      }
    }
  } catch {
    extractionStatus = "MALFORMED";
    extractionErrorCode = "malformed";
  }

  const textRelative = path.join("job-inputs", `${storedFilename}.txt`);
  if (extracted) {
    await writeFile(path.join(getPrivateStorageRoot(), textRelative), extracted, "utf8");
  }

  const doc = await prisma.cvDocument.create({
    data: {
      userId: options.userId,
      originalFilename: options.filename.slice(0, 180),
      storedFilename,
      mimeType: mime,
      byteSize: options.buffer.byteLength,
      sha256,
      extractionStatus,
      extractionErrorCode,
      extractedTextChars: extracted ? extracted.length : 0,
    },
  });

  if (extractionStatus !== "OK") {
    return {
      ok: false,
      code: extractionErrorCode ?? "error",
      message: turkishError(extractionErrorCode ?? "error"),
    };
  }

  // Keep text path discoverable via stored filename convention
  void textRelative;

  return {
    ok: true,
    documentId: doc.id,
    extractionStatus,
    extractedTextChars: extracted.length,
  };
}

export async function storePasteTextAsCv(userId: string, text: string): Promise<CvUploadResult> {
  const truncated = truncateText(text);
  if (!truncated) {
    return { ok: false, code: "empty_scanned", message: turkishError("empty_scanned") };
  }
  const buffer = Buffer.from(truncated, "utf8");
  return storeCvUpload({
    userId,
    filename: "yapistirilan-metin.txt",
    buffer,
  });
}

export async function readCvExtractedText(documentId: string, userId: string): Promise<string | null> {
  const doc = await prisma.cvDocument.findFirst({
    where: { id: documentId, userId, deletedAt: null },
  });
  if (!doc || doc.extractionStatus !== "OK") return null;

  const textPath = path.join(getPrivateStorageRoot(), "job-inputs", `${doc.storedFilename}.txt`);
  try {
    return await readFile(textPath, "utf8");
  } catch {
    const binary = await readFile(cvFilePath(doc.storedFilename));
    if (doc.mimeType === "text/plain") {
      return truncateText(binary.toString("utf8"));
    }
    return null;
  }
}

export async function deleteOwnedCv(documentId: string, userId: string) {
  const doc = await prisma.cvDocument.findFirst({
    where: { id: documentId, userId, deletedAt: null },
  });
  if (!doc) {
    throw new Error("Not found");
  }

  await prisma.cvDocument.update({
    where: { id: doc.id },
    data: { deletedAt: new Date() },
  });

  await unlink(cvFilePath(doc.storedFilename)).catch(() => undefined);
  await unlink(path.join(getPrivateStorageRoot(), "job-inputs", `${doc.storedFilename}.txt`)).catch(
    () => undefined,
  );
}

export async function assertOwnedCv(documentId: string, userId: string) {
  const doc = await prisma.cvDocument.findFirst({
    where: { id: documentId, userId, deletedAt: null },
  });
  if (!doc) {
    throw new Error("Forbidden");
  }
  return doc;
}

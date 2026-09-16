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
  | {
      ok: true;
      documentId: string;
      extractionStatus: string;
      extractedTextChars: number;
      phase: "extracted";
    }
  | { ok: false; code: string; message: string; phase: "upload" | "extraction" };

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
    case "parser_unavailable":
      return "PDF çözümleyici şu an kullanılamıyor. Bir süre sonra yeniden deneyin veya metni yapıştırın.";
    case "unauthorized":
      return "Bu işlem için oturum gerekli.";
    default:
      return "Dosya işlenemedi. Metni yapıştırmayı deneyin.";
  }
}

function classifyExtractError(error: unknown): "encrypted" | "parser_unavailable" | "malformed" {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    name === "PasswordException" ||
    message.includes("password") ||
    message.includes("encrypt")
  ) {
    return "encrypted";
  }
  if (
    message.includes("cannot find module") ||
    message.includes("worker") ||
    message.includes("pdfjs") ||
    message.includes("dommatrix") ||
    message.includes("canvas") ||
    message.includes("failed to fetch") ||
    name === "UnknownErrorException"
  ) {
    return "parser_unavailable";
  }
  return "malformed";
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string; encrypted?: boolean }> {
  // Copy into a detached Uint8Array — avoids Buffer/SharedArrayBuffer edge cases
  // under Next route handlers and matches pdfjs expectations.
  const data = Uint8Array.from(buffer);
  try {
    const { PDFParse, PasswordException } = await import("pdf-parse");
    const parser = new PDFParse({ data });
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
    try {
      const mod = await import("pdf-parse");
      if (mod.PasswordException && error instanceof mod.PasswordException) {
        return { text: "", encrypted: true };
      }
    } catch {
      // ignore secondary import failures
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

/** Client filename is metadata only — never used as a storage path. */
function sanitizeOriginalFilename(filename: string) {
  const cleaned = filename.replace(/[\u0000-\u001f]/g, "").trim();
  return (cleaned || "cv.bin").slice(0, 180);
}

export async function storeCvUpload(options: {
  userId: string;
  filename: string;
  buffer: Buffer;
}): Promise<CvUploadResult> {
  await ensurePrivateDirs();

  if (options.buffer.byteLength > CV_RETENTION.maxUploadBytes) {
    return {
      ok: false,
      code: "too_large",
      message: turkishError("too_large"),
      phase: "upload",
    };
  }

  const detected = await fileType.fromBuffer(options.buffer);
  const ext = path.extname(options.filename).toLowerCase();
  let mime: string | undefined = detected?.mime;

  // Plain text has no reliable magic bytes; allow .txt by extension only.
  if (!mime && ext === ".txt") {
    mime = "text/plain";
  }

  // PDF/DOCX must match content sniffing — do not trust client extension alone.
  if (ext === ".pdf" && detected && detected.mime !== "application/pdf") {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
  }
  if (
    ext === ".docx" &&
    detected &&
    detected.mime !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
  }
  if ((ext === ".pdf" || ext === ".docx") && !detected) {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
  }

  if (!mime || !ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
  }

  // Extension must agree with content class when an extension is present.
  if (mime === "application/pdf" && ext && ext !== ".pdf") {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
  }
  if (mime.includes("wordprocessingml") && ext && ext !== ".docx") {
    return {
      ok: false,
      code: "unsupported_type",
      message: turkishError("unsupported_type"),
      phase: "upload",
    };
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
  } catch (error) {
    const code = classifyExtractError(error);
    // Safe diagnostics only — never log CV text or PII.
    const errName = error instanceof Error ? error.name : "unknown";
    const errMsg = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
    console.error("[cv:extract]", {
      code,
      errName,
      errMsg,
      mime,
      byteSize: options.buffer.byteLength,
    });
    extractionStatus = code === "encrypted" ? "ENCRYPTED" : code === "parser_unavailable" ? "ERROR" : "MALFORMED";
    extractionErrorCode = code;
  }

  const textRelative = path.join("job-inputs", `${storedFilename}.txt`);
  if (extracted) {
    await writeFile(path.join(getPrivateStorageRoot(), textRelative), extracted, "utf8");
  }

  const doc = await prisma.cvDocument.create({
    data: {
      userId: options.userId,
      originalFilename: sanitizeOriginalFilename(options.filename),
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
      phase: "extraction",
    };
  }

  void textRelative;

  return {
    ok: true,
    documentId: doc.id,
    extractionStatus,
    extractedTextChars: extracted.length,
    phase: "extracted",
  };
}

export async function storePasteTextAsCv(userId: string, text: string): Promise<CvUploadResult> {
  const truncated = truncateText(text);
  if (!truncated) {
    return {
      ok: false,
      code: "empty_scanned",
      message: turkishError("empty_scanned"),
      phase: "extraction",
    };
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

  // Invalidate pending AI work tied to this CV; do not delete published podcast material.
  await prisma.aiJob.updateMany({
    where: {
      userId,
      cvDocumentId: documentId,
      status: { in: ["QUEUED", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      safeErrorMessage: "CV silindi; bekleyen iş iptal edildi.",
    },
  });

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

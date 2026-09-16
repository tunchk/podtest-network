import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createDefaultProfileForUser } from "@/lib/profiles/service";
import { storeCvUpload, storePasteTextAsCv } from "@/lib/cv/service";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });
const suffix = `cvfix-${Date.now().toString(36)}`;

/** Minimal valid one-page PDF with extractable text (not the owner's CV). */
function syntheticPdfBuffer(label: string) {
  // Tiny hand-written PDF with a single text string.
  const content = `BT /F1 24 Tf 100 700 Td (${label}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${content.length} >>stream\n${content}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

describe("cv upload / extraction reliability", () => {
  let userId = "";

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "CV Fix",
        email: `cv-fix-${suffix}@example.com`,
        emailVerified: false,
        staffRole: "MEMBER",
      },
    });
    userId = user.id;
    await createDefaultProfileForUser(user);
  });

  afterAll(async () => {
    await db.cvDocument.deleteMany({ where: { userId } });
    await db.profile.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("extracts text from a synthetic PDF and stores a generated key (not client filename)", async () => {
    const buffer = syntheticPdfBuffer("Ada Ornek QA");
    const result = await storeCvUpload({
      userId,
      filename: "Tunç Kavaklıoğlu CV.pdf",
      buffer,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extractedTextChars).toBeGreaterThan(0);
    expect(result.phase).toBe("extracted");

    const doc = await db.cvDocument.findUniqueOrThrow({ where: { id: result.documentId } });
    expect(doc.originalFilename).toBe("Tunç Kavaklıoğlu CV.pdf");
    expect(doc.storedFilename).not.toContain(" ");
    expect(doc.storedFilename).not.toContain("Tunç");
    expect(doc.storedFilename.endsWith(".pdf")).toBe(true);
    expect(doc.extractionStatus).toBe("OK");
  });

  it("accepts filenames with spaces without trusting them for storage", async () => {
    const buffer = syntheticPdfBuffer("Space Name");
    const result = await storeCvUpload({
      userId,
      filename: "my resume final (1).pdf",
      buffer,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const doc = await db.cvDocument.findUniqueOrThrow({ where: { id: result.documentId } });
    expect(doc.storedFilename).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i,
    );
  });

  it("keeps paste fallback working", async () => {
    const result = await storePasteTextAsCv(userId, "Yapıştırılan sentetik CV metni\nBeceri: TypeScript");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extractedTextChars).toBeGreaterThan(10);
  });

  it("rejects non-pdf bytes that claim a pdf extension", async () => {
    const result = await storeCvUpload({
      userId,
      filename: "fake.pdf",
      buffer: Buffer.from("not a pdf"),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.phase).toBe("upload");
  });

  it(
    "reproduces owner PDF extraction when tuncV.pdf is present locally (gitignored)",
    async () => {
      const pdfPath = path.resolve(process.cwd(), "tuncV.pdf");
      let buffer: Buffer;
      try {
        buffer = readFileSync(pdfPath);
      } catch {
        // File is intentionally not a committed fixture.
        return;
      }
      expect(buffer.byteLength).toBe(86429);
      const result = await storeCvUpload({
        userId,
        filename: "tuncV.pdf",
        buffer,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.extractedTextChars).toBeGreaterThan(5000);
    },
    30_000,
  );
});

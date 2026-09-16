import { segmentPlainTextWithLinks } from "@/lib/community/links";

export function PlainTextWithLinks({ text, className }: { text: string; className?: string }) {
  const segments = segmentPlainTextWithLinks(text);
  return (
    <p className={className ?? "whitespace-pre-wrap"}>
      {segments.map((seg, i) =>
        seg.type === "link" ? (
          <a
            key={`${i}-${seg.href}`}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--line)] underline-offset-2 hover:text-[var(--accent-strong)]"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        ),
      )}
    </p>
  );
}

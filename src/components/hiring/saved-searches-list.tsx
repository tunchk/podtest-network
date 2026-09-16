"use client";

import Link from "next/link";
import { useMemo } from "react";

type SavedSearch = {
  id: string;
  name: string;
  filters: unknown;
};

export function SavedSearchesList({
  workspaceId,
  searches,
}: {
  workspaceId: string;
  searches: SavedSearch[];
}) {
  const items = useMemo(
    () =>
      searches.map((s) => {
        const filters =
          s.filters && typeof s.filters === "object" && !Array.isArray(s.filters)
            ? (s.filters as Record<string, unknown>)
            : {};
        const params = new URLSearchParams({ ws: workspaceId });
        for (const [key, value] of Object.entries(filters)) {
          if (value == null || value === "") continue;
          params.set(key, String(value));
        }
        return { ...s, href: `/isveren/adaylar?${params.toString()}`, filters };
      }),
    [searches, workspaceId],
  );

  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Kayıtlı arama yok.</p>;
  }

  return (
    <ul className="space-y-2 text-sm">
      {items.map((s) => (
        <li key={s.id} className="border-b border-[var(--line)] pb-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium">{s.name}</span>
            <Link href={s.href} className="underline">
              Yeniden aç
            </Link>
          </div>
          <pre className="mt-1 overflow-auto rounded bg-[var(--surface)] p-2 text-xs">
            {JSON.stringify(s.filters, null, 2)}
          </pre>
        </li>
      ))}
    </ul>
  );
}

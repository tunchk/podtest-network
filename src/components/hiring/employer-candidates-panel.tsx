"use client";

import { useCallback, useEffect, useState } from "react";

type CandidateView = {
  displayName: string;
  slug: string;
  headline: string | null;
};

type SearchResult = { userId: string; view: CandidateView };

type ListRow = { id: string; name: string; _count?: { entries: number } };

export function EmployerCandidatesPanel({
  workspaceId,
  initialFilters,
}: {
  workspaceId: string;
  initialFilters?: {
    skill?: string;
    location?: string;
    text?: string;
    workPreferences?: string;
    openToWork?: boolean;
    openToProjects?: boolean;
  };
}) {
  const [skill, setSkill] = useState(initialFilters?.skill ?? "");
  const [location, setLocation] = useState(initialFilters?.location ?? "");
  const [openToWork, setOpenToWork] = useState(initialFilters?.openToWork ?? false);
  const [openToProjects, setOpenToProjects] = useState(initialFilters?.openToProjects ?? false);
  const [text, setText] = useState(initialFilters?.text ?? "");
  const [workPreferences, setWorkPreferences] = useState(initialFilters?.workPreferences ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [listName, setListName] = useState("");
  const [activeListId, setActiveListId] = useState<string>("");
  const [listEntries, setListEntries] = useState<
    Array<{
      subjectUserId: string;
      status: string;
      view?: CandidateView;
    }>
  >([]);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    const res = await fetch(`/api/isveren/${workspaceId}/candidates`);
    const data = await res.json();
    if (res.ok) setLists(data.lists ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    const hasInitial =
      Boolean(initialFilters?.skill) ||
      Boolean(initialFilters?.location) ||
      Boolean(initialFilters?.text) ||
      Boolean(initialFilters?.workPreferences) ||
      Boolean(initialFilters?.openToWork) ||
      Boolean(initialFilters?.openToProjects);
    if (hasInitial) void search();
    // One-shot hydrate from saved-search reopen URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    const res = await fetch(`/api/isveren/${workspaceId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        filters: {
          skill: skill || undefined,
          location: location || undefined,
          openToWork: openToWork || undefined,
          openToProjects: openToProjects || undefined,
          text: text || undefined,
          workPreferences: workPreferences || undefined,
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setResults(data.items ?? []);
    const unsupported = Array.isArray(data.unsupportedFilters) ? data.unsupportedFilters : [];
    setMsg(
      `${data.total ?? 0} sonuç` +
        (unsupported.length ? ` · Desteklenmeyen filtreler: ${unsupported.join(", ")}` : ""),
    );
  }

  async function saveSearch() {
    const name = skill.trim()
      ? `Beceri: ${skill}`
      : text.trim()
        ? `Metin: ${text}`
        : "Kayıtlı arama";
    const res = await fetch(`/api/isveren/${workspaceId}/searches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        name,
        filters: {
          skill: skill || undefined,
          location: location || undefined,
          openToWork: openToWork || undefined,
          openToProjects: openToProjects || undefined,
          text: text || undefined,
          workPreferences: workPreferences || undefined,
        },
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Arama kaydedildi." : (data.error ?? "Hata"));
  }

  async function createList() {
    const res = await fetch(`/api/isveren/${workspaceId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_list", name: listName }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setListName("");
    setMsg("Liste oluşturuldu.");
    await refreshLists();
  }

  async function loadList(listId: string) {
    setActiveListId(listId);
    const res = await fetch(`/api/isveren/${workspaceId}/candidates?listId=${listId}`);
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Hata");
      return;
    }
    setListEntries(data.entries ?? []);
  }

  async function addToList(subjectUserId: string) {
    if (!activeListId) {
      setMsg("Önce bir liste seçin veya oluşturun.");
      return;
    }
    const res = await fetch(`/api/isveren/${workspaceId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add_to_list",
        listId: activeListId,
        subjectUserId,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Listeye eklendi." : (data.error ?? "Hata"));
    if (res.ok) await loadList(activeListId);
  }

  async function saveNote() {
    if (!selected) return;
    const res = await fetch(`/api/isveren/${workspaceId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "note", subjectUserId: selected, note }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Not kaydedildi." : (data.error ?? "Hata"));
  }

  async function contact() {
    if (!selected) return;
    const res = await fetch(`/api/isveren/${workspaceId}/outreach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectUserId: selected,
        message:
          note ||
          "Merhaba, ilgini çekebileceğimizi düşündüğümüz bir rol hakkında yazmak istedim.",
        idempotencyKey: `hire-${selected}-${Date.now()}`,
      }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Mesaj isteği gönderildi (kotana tabi)." : (data.error ?? "Hata"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Beceri"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        />
        <input
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Konum"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <input
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Başlık / deneyim metni"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          placeholder="Çalışma tercihleri"
          value={workPreferences}
          onChange={(e) => setWorkPreferences(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={openToWork} onChange={(e) => setOpenToWork(e.target.checked)} />
          İş arıyor
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openToProjects}
            onChange={(e) => setOpenToProjects(e.target.checked)}
          />
          Projeye açık
        </label>
        <button type="button" onClick={() => void search()} className="rounded-md border px-3 py-2 text-sm">
          Ara
        </button>
        <button
          type="button"
          onClick={() => void saveSearch()}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Aramayı kaydet
        </button>
      </div>

      <ul className="space-y-2 text-sm">
        {results.length === 0 ? (
          <li className="text-[var(--muted)]">Arama sonucu yok.</li>
        ) : (
          results.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center gap-2">
              <button type="button" className="underline" onClick={() => setSelected(r.userId)}>
                {r.view.displayName} (@{r.view.slug})
              </button>
              {r.view.headline ? <span className="text-[var(--muted)]">— {r.view.headline}</span> : null}
              <button
                type="button"
                className="rounded border px-2 py-0.5 text-xs"
                onClick={() => void addToList(r.userId)}
              >
                Listeye ekle
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2 border-t border-[var(--line)] pt-4">
        <h2 className="font-[family-name:var(--font-display)] text-lg">Aday listeleri</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
            placeholder="Yeni liste adı"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
          />
          <button
            type="button"
            disabled={!listName.trim()}
            onClick={() => void createList()}
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Liste oluştur
          </button>
        </div>
        <ul className="flex flex-wrap gap-2 text-sm">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`rounded border px-2 py-1 ${activeListId === l.id ? "bg-[var(--surface)]" : ""}`}
                onClick={() => void loadList(l.id)}
              >
                {l.name}
                {l._count ? ` (${l._count.entries})` : ""}
              </button>
            </li>
          ))}
        </ul>
        {activeListId ? (
          <ul className="space-y-1 text-sm">
            {listEntries.length === 0 ? (
              <li className="text-[var(--muted)]">Liste boş.</li>
            ) : (
              listEntries.map((e) => (
                <li key={e.subjectUserId}>
                  {e.status === "available" && e.view ? (
                    <button type="button" className="underline" onClick={() => setSelected(e.subjectUserId)}>
                      {e.view.displayName} (@{e.view.slug})
                    </button>
                  ) : (
                    <span className="text-[var(--muted)]">Profil artık keşfedilebilir değil</span>
                  )}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {selected ? (
        <div className="space-y-2 border-t border-[var(--line)] pt-4">
          <textarea
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder="Özel not (yalnızca bu çalışma alanı)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => void saveNote()} className="rounded-md border px-3 py-1 text-sm">
              Not kaydet
            </button>
            <button
              type="button"
              onClick={() => void contact()}
              className="rounded-md bg-[var(--accent)] px-3 py-1 text-sm text-white"
            >
              Mesaj isteği gönder
            </button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}

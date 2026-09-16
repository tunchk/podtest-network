"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const res = await fetch("/api/isveren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, website }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(
        data.error === "WORKSPACE_LIMIT"
          ? "Pilot sınırı: üye başına bir çalışma alanı."
          : data.error === "CAPABILITY_DENIED"
            ? "İşveren pilot yetkisi yok. Geliştirme ortamında seed komutunu kullanın."
            : (data.error ?? "Hata"),
      );
      return;
    }
    setMsg("Çalışma alanı oluşturuldu.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Şirket / ekip adı</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Açıklama (isteğe bağlı)</span>
        <textarea
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-[var(--muted)]">Web sitesi (https, isteğe bağlı)</span>
        <input
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => void submit()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        Çalışma alanı oluştur
      </button>
    </div>
  );
}

type MemberRow = {
  id: string;
  userId: string;
  role: string;
  status: string;
  user?: { email: string; name: string | null };
};

export function WorkspaceMembersPanel({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/isveren/${workspaceId}`);
    const data = await res.json();
    if (res.ok) setMembers(data.members ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite() {
    setError(null);
    const res = await fetch(`/api/isveren/${workspaceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "invite", recipientEmail: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Hata");
      return;
    }
    setInvitePath(data.acceptPath ?? null);
    setMsg("Davet oluşturuldu (e-posta gönderilmez; bağlantıyı paylaşın).");
    router.refresh();
  }

  async function removeMember(targetUserId: string) {
    const res = await fetch(`/api/isveren/${workspaceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove_member", targetUserId }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Üyelik kaldırıldı." : (data.error ?? "Hata"));
    if (res.ok) await load();
  }

  if (role !== "OWNER") return null;

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--line)] pt-4 text-sm">
      <h3 className="font-medium">Üyeler ve davet</h3>
      <p className="text-xs text-[var(--muted)]">
        İşveren daveti konuşmacı/sunucu yetkisi vermez. Gerçek e-posta gönderilmez.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="rounded-md border border-[var(--line)] px-3 py-2"
          placeholder="Davetli e-posta (isteğe bağlı)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="button" onClick={() => void invite()} className="rounded-md border px-3 py-2">
          Davet oluştur
        </button>
        <button type="button" onClick={() => void load()} className="rounded-md border px-3 py-2">
          Üyeleri yenile
        </button>
      </div>
      {invitePath ? (
        <p className="break-all font-mono text-xs">
          Kabul yolu: <a href={invitePath}>{invitePath}</a>
        </p>
      ) : null}
      <ul className="space-y-1">
        {members.map((m) => (
          <li key={m.id} className="flex flex-wrap gap-2">
            <span>
              {m.user?.email ?? m.userId} · {m.role === "OWNER" ? "Sahip" : "İşe alım uzmanı"}
            </span>
            {m.role !== "OWNER" && m.status === "ACTIVE" ? (
              <button
                type="button"
                className="underline"
                onClick={() => void removeMember(m.userId)}
              >
                Kaldır
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? <p className="text-red-700">{error}</p> : null}
      {msg ? <p className="text-[var(--muted)]">{msg}</p> : null}
    </div>
  );
}

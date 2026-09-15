"use client";

import { useState, useTransition } from "react";

type ActionResult = { error?: string; ok?: boolean } | void;
type ServerAction = ((formData: FormData) => Promise<ActionResult>) | (() => Promise<ActionResult>);

type Props = {
  action: ServerAction;
  children: React.ReactNode;
  className?: string;
};

export function ActionForm({ action, children, className }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          setError(null);
          try {
            const result = await action(formData);
            if (result && "error" in result && result.error) {
              setError(result.error);
            }
          } catch {
            // redirect() throws; allow navigation
          }
        });
      }}
    >
      {children}
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {pending ? <p className="mt-2 text-sm text-[var(--muted)]">İşleniyor…</p> : null}
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

type Props = {
  id: string;
  label: string;
  href?: string;
  required?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** Unchecked-by-default legal acknowledgement checkbox. */
export function LegalCheckbox({ id, label, href, required, checked, onChange }: Props) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm text-[var(--ink)]">
      <input
        id={id}
        type="checkbox"
        className="mt-1"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {href ? (
          <>
            {" "}
            <Link href={href} className="text-[var(--accent)] underline" target="_blank">
              Metni aç
            </Link>
          </>
        ) : null}
      </span>
    </label>
  );
}

export function useUncheckedLegalBoxes<T extends string>(keys: T[]) {
  const initial = Object.fromEntries(keys.map((k) => [k, false])) as Record<T, boolean>;
  const [state, setState] = useState(initial);
  const set = (key: T, value: boolean) => setState((s) => ({ ...s, [key]: value }));
  const allRequired = (required: T[]) => required.every((k) => state[k]);
  return { state, set, allRequired, reset: () => setState(initial) };
}

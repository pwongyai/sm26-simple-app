"use client";

import { useState } from "react";
import { LANGUAGES, useT, clearLanguageCache } from "@/lib/i18n";

// The one language control, used by both roles. It writes app_users.language
// through /api/me, so a contractor's choice is his own rather than his whole
// business's, and a farmer has one at all.
export default function LanguagePicker({ onChanged }) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  async function choose(code) {
    if (code === t.lang) return;
    setBusy(true);
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: code }),
    });
    setBusy(false);
    // Every mounted screen re-reads, not just this one.
    clearLanguageCache();
    if (onChanged) onChanged();
  }

  return (
    <div className="flex gap-2">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          disabled={busy}
          onClick={() => choose(l.code)}
          className={`btn flex-1 ${t.lang === l.code ? "btn-primary" : "btn-outline"}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

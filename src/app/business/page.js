"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// One account per contractor business. กินรี logs in as กินรี — her machines,
// her price list, her customers, her bills. Without this step every contractor
// account in a community would share one identity.
export default function BusinessPage() {
  const router = useRouter();
  const [options, setOptions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/contractors")
      .then((r) => (r.ok ? r.json() : []))
      .then(setOptions)
      .catch(() => setError("Could not load businesses."));
  }, []);

  async function claim(id) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorOrgId: id }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not select that business.");
      return;
    }
    router.push("/contractor");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-xl font-semibold">Which business are you?</h1>
      <p className="mb-6 text-sm text-[var(--text-sec)]">
        Your machines, prices and jobs belong to this business.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!options && !error && <p className="text-sm text-[var(--text-sec)]">Loading…</p>}

      <div className="flex flex-col gap-2">
        {options?.map((o) => (
          <button
            key={o.id}
            disabled={busy || o.claimed}
            onClick={() => claim(o.id)}
            className={`rounded border p-3 text-left ${
              o.claimed ? "border-[var(--rule)] bg-black/5 opacity-60" : "border-[var(--rule)]"
            }`}
          >
            <span className="font-medium">{o.name}</span>
            <span className="block text-xs text-[var(--text-tert)]">
              {o.claimed
                ? "already has an account"
                : `${o.serviceCount} service${o.serviceCount === 1 ? "" : "s"} listed`}
            </span>
          </button>
        ))}
      </div>

      {options?.length === 0 && (
        <p className="text-sm text-[var(--text-sec)]">
          No contractor businesses found for this community.
        </p>
      )}
    </main>
  );
}

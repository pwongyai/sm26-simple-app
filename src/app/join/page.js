"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Join your organization — the same gate v3 designed (§11.2), minus the
// simulated QR camera. The code a contractor hands out (RK2026) is what a real
// QR would encode, so swapping in a scanner later changes only how this field
// gets filled in.
//
// One organization per user, and everything they create afterwards lands in it.
export default function JoinPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/org/join")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setOrgs(data));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/org/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not join");
      return;
    }
    if (data.user.role === "contractor" && !data.user.contractor_agro_org_id) {
      router.push("/business");
      return;
    }
    router.push(data.user.role === "farmer" ? "/farmer" : "/contractor");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-xl font-semibold">Join your organization</h1>
      <p className="mb-8 text-sm text-[var(--text-sec)]">
        Enter the code from your contractor, or scan their QR code.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. RK2026"
          required
          autoCapitalize="characters"
          className="field uppercase"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "…" : "Join"}
        </button>
      </form>

      {orgs.length > 0 && (
        <div className="mt-8 border-t border-[var(--rule)] pt-4">
          <p className="mb-2 text-xs text-[var(--text-tert)]">Available now</p>
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => setCode(o.join_code)}
              className="block w-full card p-3 text-left text-sm hover:bg-black/5"
            >
              <span className="font-medium">{o.name}</span>
              <span className="ml-2 text-[var(--text-tert)]">{o.join_code}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

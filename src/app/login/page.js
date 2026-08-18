"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phone number, no verification code. An existing number signs back into the
// same account from any device — which is the point: a farmer's fields have to
// survive a new phone, not just a page reload. There's no self-signup here —
// an unrecognized number is rejected, the same way a wrong password would be,
// rather than quietly opening an account-creation form.
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not sign in");
      return;
    }

    if (!data.user.organization_id) router.push("/join");
    else if (data.user.role === "contractor" && !data.user.contractor_agro_org_id)
      router.push("/business");
    else router.push(data.user.role === "farmer" ? "/farmer" : "/contractor");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-xl font-semibold">Smart Machine</h1>
      <p className="mb-8 text-sm text-[var(--text-sec)]">
        Enter your mobile number to continue.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08x xxx xxxx"
          required
          className="field"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "…" : "Continue"}
        </button>
      </form>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phone number and password. The number is the user ID — the same number signs
// back into the same account from any device, which is the point: a farmer's
// fields have to survive a new phone, not just a page reload.
//
// No self-signup, and no "forgot password" link. Both would need SMS, and A2P
// delivery into Vietnam is unreliable enough that it would be the thing that
// breaks in front of an audience. Accounts and passwords are provisioned with
// `node set-password.js <phone>`.
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
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
      <h1 className="mb-8 text-xl font-semibold">Smart Machine</h1>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          required
          autoComplete="username"
          className="field"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete="current-password"
          className="field"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </main>
  );
}

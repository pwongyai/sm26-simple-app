"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Phone number, no verification code. An existing number signs back into the
// same account from any device — which is the point: a farmer's fields have to
// survive a new phone, not just a page reload.
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("farmer");
  const [needsSignup, setNeedsSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        needsSignup ? { phone, name, role } : { phone }
      ),
    });
    const data = await res.json();
    setBusy(false);

    if (data.needsSignup) {
      setNeedsSignup(true);
      return;
    }
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
        {needsSignup
          ? "New number — tell us who you are."
          : "Enter your mobile number to continue."}
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="08x xxx xxxx"
          required
          disabled={needsSignup}
          className="field disabled:bg-black/5"
        />

        {needsSignup && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
              className="field"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRole("farmer")}
                className={`flex-1 rounded border py-2.5 text-sm ${
                  role === "farmer"
                    ? "border-black bg-[var(--ink)] text-white"
                    : "border-[var(--rule)]"
                }`}
              >
                🌾 Farmer
              </button>
              <button
                type="button"
                onClick={() => setRole("contractor")}
                className={`flex-1 rounded border py-2.5 text-sm ${
                  role === "contractor"
                    ? "border-black bg-[var(--ink)] text-white"
                    : "border-[var(--rule)]"
                }`}
              >
                🚜 Contractor
              </button>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary w-full"
        >
          {busy ? "…" : needsSignup ? "Create account" : "Continue"}
        </button>

        {needsSignup && (
          <button
            type="button"
            onClick={() => setNeedsSignup(false)}
            className="text-xs text-[var(--text-tert)] underline"
          >
            use a different number
          </button>
        )}
      </form>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/useSession";

// Profile — version 3 §4/§11.6: the farmer's own details, who they're
// connected to, and the way out. No language toggle yet; that's listed in the
// screen inventory rather than faked as a setting that does nothing.
export default function ProfileTab() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Password change. Kept in its own piece of state and its own request: it
  // has a different failure mode from name/phone (the current password can be
  // wrong) and must not make a name edit fail.
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMe(d);
        setName(d.name || "");
        setPhone(d.phone || "");
      })
      .catch(() => setError("Could not load your profile."));
  }, []);

  useEffect(load, [load]);

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Could not save.");
      return;
    }
    setSaved("Saved");
    setTimeout(() => setSaved(""), 1500);
    load();
  }

  async function changePassword() {
    setPwBusy(true);
    setPwError("");
    setPwMsg("");
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    });
    setPwBusy(false);
    if (!res.ok) {
      setPwError((await res.json()).error || "Could not change password.");
      return;
    }
    setPwCurrent("");
    setPwNew("");
    setPwMsg("Password changed");
    setTimeout(() => setPwMsg(""), 2000);
  }

  if (!me) return <p className="empty-msg">Loading…</p>;

  return (
    <>
      <h1 className="my-3 text-base font-bold">Profile</h1>

      {saved && (
        <p className="mb-3 rounded-xl bg-[var(--green-light)] p-2 text-xs text-[var(--green-dark)]">
          {saved}
        </p>
      )}

      <div className="card mb-4 p-4">
        <div className="field-label">Your name</div>
        <input
          className="field mb-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-label">Mobile number</div>
        <input
          className="field"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-[var(--text-tert)]">
          This is how you sign in — changing it changes your login.
        </p>

        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

        <button
          className="btn btn-primary mt-3 w-full"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="card mb-4 p-4">
        <div className="field-label">Password</div>

        <input
          className="field mb-3"
          type="password"
          placeholder="Current password"
          autoComplete="current-password"
          value={pwCurrent}
          onChange={(e) => setPwCurrent(e.target.value)}
        />
        <input
          className="field"
          type="password"
          placeholder="New password"
          autoComplete="new-password"
          value={pwNew}
          onChange={(e) => setPwNew(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-[var(--text-tert)]">
          At least 6 characters.
        </p>

        {pwError && <p className="mt-2 text-sm text-[var(--danger)]">{pwError}</p>}
        {pwMsg && (
          <p className="mt-2 text-sm text-[var(--green-dark)]">{pwMsg}</p>
        )}

        <button
          className="btn mt-3 w-full"
          disabled={pwBusy || !pwCurrent || !pwNew}
          onClick={changePassword}
        >
          {pwBusy ? "Changing…" : "Change Password"}
        </button>
      </div>

      <p className="field-label">Organization</p>
      <div className="detail-card mb-4">
        <div className="detail-row">
          <div className="lbl">Community</div>
          <div className="val">{me.organization}</div>
        </div>
        <div className="detail-row">
          <div className="lbl">Contractor</div>
          <div className="val">{me.contractor || "—"}</div>
        </div>
        <div className="detail-row">
          <div className="lbl">Currency</div>
          <div className="val">{me.currency || "—"}</div>
        </div>
        <div className="detail-row">
          <div className="lbl">Area unit</div>
          <div className="val">
            {me.areaUnit
              ? me.areaUnitM2
                ? `${me.areaUnit} · ${Number(me.areaUnitM2).toLocaleString()} m²`
                : me.areaUnit
              : "—"}
          </div>
        </div>
        <div className="detail-row">
          <div className="lbl">Joined</div>
          <div className="val">
            {me.joinedAt ? new Date(me.joinedAt).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <button
        className="btn w-full"
        style={{ background: "var(--danger)", color: "#fff" }}
        onClick={async () => {
          await logout();
          router.push("/login");
        }}
      >
        Log Out
      </button>
    </>
  );
}

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
  // Read-only until you ask to edit, the same as the password panel below.
  // A profile is something you look at far more often than you change.
  const [editing, setEditing] = useState(false);

  // Password change. Kept in its own piece of state and its own request: it
  // has a different failure mode from name/phone (the current password can be
  // wrong) and must not make a name edit fail.
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  // Closed until asked for. Two password boxes standing open on the screen
  // you came to to fix your name is not a thing anyone wants to look at.
  const [pwOpen, setPwOpen] = useState(false);

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
    setEditing(false);
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
    setTimeout(() => {
      setPwMsg("");
      setPwOpen(false);
    }, 1500);
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
        {!editing ? (
          <>
            <div className="detail-row">
              <div className="lbl">Your name</div>
              <div className="val">{me.name}</div>
            </div>
            <div className="detail-row">
              <div className="lbl">Phone number</div>
              <div className="val">{me.phone}</div>
            </div>

            <button
              className="mt-3 flex w-full items-center justify-between text-left"
              onClick={() => {
                setName(me.name || "");
                setPhone(me.phone || "");
                setError("");
                setEditing(true);
              }}
            >
              <span className="text-sm font-medium">Edit</span>
              <span className="text-[var(--text-tert)]">›</span>
            </button>
          </>
        ) : (
          <>
            <div className="field-label">Your name</div>
            <input
              className="field mb-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div className="field-label">Phone number</div>
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

            <div className="mt-3 flex gap-2">
              <button
                className="btn flex-1"
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1"
                disabled={busy}
                onClick={save}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="card mb-4 p-4">
        {!pwOpen ? (
          <button
            className="flex w-full items-center justify-between text-left"
            onClick={() => setPwOpen(true)}
          >
            <span className="text-sm font-medium">Change Password</span>
            <span className="text-[var(--text-tert)]">›</span>
          </button>
        ) : (
          <>
            <div className="field-label">Change Password</div>

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

            {pwError && (
              <p className="mt-2 text-sm text-[var(--danger)]">{pwError}</p>
            )}
            {pwMsg && (
              <p className="mt-2 text-sm text-[var(--green-dark)]">{pwMsg}</p>
            )}

            <div className="mt-3 flex gap-2">
              <button
                className="btn flex-1"
                onClick={() => {
                  setPwOpen(false);
                  setPwCurrent("");
                  setPwNew("");
                  setPwError("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary flex-1"
                disabled={pwBusy || !pwCurrent || !pwNew}
                onClick={changePassword}
              >
                {pwBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
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

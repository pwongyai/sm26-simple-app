"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/useSession";
import Map from "@/components/Map";

// Version 2 §4.2 + version 3 §4: the contractor's own business profile, home
// base, services/pricing, and account — nothing here is fixed by AgroAPI,
// its numbers are only ever a starting default. Per-machine width/fuel and
// the machine list itself moved fully to Machine Details
// (src/app/contractor/machines/[machineId]/page.js) — removed here as
// redundant, not because the functionality went away.
//
// Every data-entry section below follows the same shape: a read-only view
// with an explicit Edit action, a draft copy of the values while editing,
// and Cancel/Save — nothing writes to the DB until Save is actually
// pressed. Language and Log Out stay immediate-apply (a single tap picking
// one of two states, not free-text data worth a review step).
export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [profile, setProfile] = useState(null);
  const [services, setServices] = useState([]);
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    const [s, p, sv] = await Promise.all([
      fetch("/api/settings").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/contractor-profile").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/services?includeInactive=1").then((r) => (r.ok ? r.json() : [])),
    ]);
    setSettings(s);
    setProfile(p);
    setServices(sv);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg) {
    setSaved(msg);
    setTimeout(() => setSaved(""), 1500);
  }

  if (!settings || !profile) {
    return <p className="text-sm text-[var(--text-sec)]">Loading…</p>;
  }

  return (
    <>
      <h1 className="mb-5 text-lg font-semibold">Settings</h1>

      {saved && (
        <p className="mb-3 rounded bg-emerald-50 p-2 text-xs text-emerald-800">{saved}</p>
      )}

      <ContractorProfile
        profile={profile}
        organization={settings.organization}
        onChanged={() => {
          load();
          flash("Settings saved");
        }}
      />

      <HomeBase
        profile={profile}
        onChanged={() => {
          load();
          flash("Home base saved");
        }}
      />

      <ServiceList
        services={services}
        unit={settings.areaUnit}
        currency={settings.currency}
        onChanged={() => {
          load();
          flash("Saved");
        }}
      />

      <Language profile={profile} onChanged={() => { load(); flash("Language saved"); }} />

      <LogOut />
    </>
  );
}

function SectionHeader({ title, onEdit }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold">{title}</h2>
      {onEdit && (
        <button onClick={onEdit} className="text-xs text-[var(--text-sec)] underline">
          Edit
        </button>
      )}
    </div>
  );
}

function ViewRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--text-sec)]">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function EditActions({ busy, onCancel, onSave, saveDisabled }) {
  return (
    <div className="mt-2 flex gap-2">
      <button onClick={onCancel} disabled={busy} className="btn btn-outline flex-1">
        Cancel
      </button>
      <button onClick={onSave} disabled={busy || saveDisabled} className="btn btn-primary flex-1">
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function ContractorProfile({ profile, organization, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState(profile.businessName || "");
  const [ownerName, setOwnerName] = useState(profile.ownerName || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setBusinessName(profile.businessName || "");
    setOwnerName(profile.ownerName || "");
    setPhone(profile.phone || "");
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    await fetch("/api/contractor-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, ownerName, phone }),
    });
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  if (!editing) {
    return (
      <section className="mb-6">
        <SectionHeader title="Contractor Profile" onEdit={startEdit} />
        <div className="flex flex-col gap-1.5">
          <ViewRow label="Business Name" value={profile.businessName} />
          <ViewRow label="Owner Name" value={profile.ownerName} />
          <ViewRow label="Mobile Number" value={profile.phone} />
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">Organization: {organization}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Contractor Profile</h2>
      <div className="flex flex-col gap-2">
        <div>
          <div className="field-label">Contractor / Business Name</div>
          <input
            className="field"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">Owner Name</div>
          <input
            className="field"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
        </div>
        <div>
          <div className="field-label">Mobile Number</div>
          <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <EditActions busy={busy} onCancel={() => setEditing(false)} onSave={save} />
        <p className="text-[11px] text-[var(--text-tert)]">Organization: {organization}</p>
      </div>
    </section>
  );
}

function HomeBase({ profile, onChanged }) {
  const currentPin =
    profile.homeLat != null && profile.homeLng != null
      ? { lat: profile.homeLat, lng: profile.homeLng }
      : null;
  const [editing, setEditing] = useState(false);
  const [draftPin, setDraftPin] = useState(currentPin);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setDraftPin(currentPin);
    setEditing(true);
  }

  async function save() {
    if (!draftPin) return;
    setBusy(true);
    await fetch("/api/contractor-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeLat: draftPin.lat, homeLng: draftPin.lng }),
    });
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  const shownPin = editing ? draftPin : currentPin;

  return (
    <section className="mb-6">
      <SectionHeader title="Home Base Location" onEdit={editing ? null : startEdit} />
      <p className="mb-2 text-[11px] text-[var(--text-tert)]">
        Used to route Today&apos;s Work — the closest open job to home comes
        first.{editing ? " Tap the map to move the pin." : ""}
      </p>
      <Map pin={shownPin} onPick={editing ? setDraftPin : null} height={200} />
      <p className="mt-1 text-[11px] text-[var(--text-tert)]">
        {shownPin
          ? `${editing ? "New location" : "Home at"} ${shownPin.lat.toFixed(5)}, ${shownPin.lng.toFixed(5)}`
          : editing
          ? "Tap the map to place the pin."
          : "No home base set yet."}
      </p>
      {editing && (
        <EditActions
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={save}
          saveDisabled={!draftPin}
        />
      )}
    </section>
  );
}

function ServiceList({ services, unit, currency, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [newDrafts, setNewDrafts] = useState([]);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    const d = {};
    services.forEach((s) => {
      d[s.id] = { price: String(Number(s.price_per_unit)), active: s.active };
    });
    setDrafts(d);
    setNewDrafts([]);
    setEditing(true);
  }

  function setDraft(id, patch) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function addDraftRow() {
    setNewDrafts((rows) => [...rows, { clientId: `new-${rows.length}`, name: "", price: "" }]);
  }

  function setNewDraft(clientId, patch) {
    setNewDrafts((rows) => rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  }

  function removeNewDraft(clientId) {
    setNewDrafts((rows) => rows.filter((r) => r.clientId !== clientId));
  }

  async function save() {
    setBusy(true);
    await Promise.all(
      services.map((s) => {
        const d = drafts[s.id];
        if (!d) return null;
        const priceChanged = Number(d.price) !== Number(s.price_per_unit);
        const activeChanged = d.active !== s.active;
        if (!priceChanged && !activeChanged) return null;
        return fetch(`/api/services/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(priceChanged ? { pricePerUnit: d.price } : {}),
            ...(activeChanged ? { active: d.active } : {}),
          }),
        });
      })
    );
    await Promise.all(
      newDrafts
        .filter((r) => r.name.trim())
        .map((r) =>
          fetch("/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: r.name.trim(),
              pricePerUnit: r.price || 0,
              activityCanonical: "other",
            }),
          })
        )
    );
    setBusy(false);
    setEditing(false);
    setNewDrafts([]);
    onChanged();
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Services &amp; pricing</h2>
        {!editing && (
          <button onClick={startEdit} className="text-xs text-[var(--text-sec)] underline">
            Edit
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {services.map((s) => {
          const draft = drafts[s.id];
          const active = editing ? draft?.active ?? s.active : s.active;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-2 card p-2 ${active ? "" : "opacity-50"}`}
            >
              <span className="flex-1 text-sm">{s.name}</span>
              {editing ? (
                <input
                  type="number"
                  value={draft?.price ?? ""}
                  onChange={(e) => setDraft(s.id, { price: e.target.value })}
                  disabled={!active}
                  className="w-24 rounded border border-[var(--rule)] px-2 py-1 text-right text-sm"
                />
              ) : (
                <span className="w-24 text-right text-sm">{Number(s.price_per_unit)}</span>
              )}
              <span className="w-16 text-xs text-[var(--text-tert)]">
                {currency}/{unit}
              </span>
              <button
                onClick={() => editing && setDraft(s.id, { active: !active })}
                disabled={!editing}
                className={`rounded px-2 py-1 text-[11px] ${
                  active ? "bg-green-light text-green-dark" : "bg-surface text-tert"
                }`}
              >
                {active ? "Available" : "Unavailable"}
              </button>
            </div>
          );
        })}

        {editing &&
          newDrafts.map((r) => (
            <div key={r.clientId} className="flex items-center gap-2 card p-2">
              <input
                value={r.name}
                onChange={(e) => setNewDraft(r.clientId, { name: e.target.value })}
                placeholder="New service name"
                className="flex-1 rounded border border-[var(--rule)] px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={r.price}
                onChange={(e) => setNewDraft(r.clientId, { price: e.target.value })}
                placeholder="0"
                className="w-24 rounded border border-[var(--rule)] px-2 py-1 text-right text-sm"
              />
              <span className="w-16 text-xs text-[var(--text-tert)]">
                {currency}/{unit}
              </span>
              <button
                onClick={() => removeNewDraft(r.clientId)}
                className="rounded px-2 py-1 text-[11px] text-[var(--text-tert)] underline"
              >
                Remove
              </button>
            </div>
          ))}
      </div>

      {editing && (
        <button
          onClick={addDraftRow}
          className="mt-2 text-xs text-[var(--text-sec)] underline"
        >
          + Add a service
        </button>
      )}

      {editing && (
        <EditActions
          busy={busy}
          onCancel={() => {
            setEditing(false);
            setNewDrafts([]);
          }}
          onSave={save}
        />
      )}

      <p className="mt-2 text-[11px] text-[var(--text-tert)]">
        A service priced 0 will bill nothing — set it before you report
        against it. Marking a service Unavailable hides it from new bookings
        without losing its price history.
      </p>
    </section>
  );
}

function Language({ profile, onChanged }) {
  const [busy, setBusy] = useState(false);

  async function setLanguage(language) {
    setBusy(true);
    await fetch("/api/contractor-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Language</h2>
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => setLanguage("th")}
          className={`btn flex-1 ${profile.language === "th" ? "btn-primary" : "btn-outline"}`}
        >
          ไทย
        </button>
        <button
          disabled={busy}
          onClick={() => setLanguage("en")}
          className={`btn flex-1 ${profile.language === "en" ? "btn-primary" : "btn-outline"}`}
        >
          English
        </button>
        <button
          disabled={busy}
          onClick={() => setLanguage("vn")}
          className={`btn flex-1 ${profile.language === "vn" ? "btn-primary" : "btn-outline"}`}
        >
          Tiếng Việt
        </button>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text-tert)]">
        Sets your preference — the rest of the app stays in English for now.
      </p>
    </section>
  );
}

function LogOut() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="mb-10">
      {confirming ? (
        <button
          className="btn w-full"
          style={{ background: "var(--danger)", color: "#fff" }}
          onClick={async () => {
            await logout();
            router.push("/login");
          }}
        >
          Log out of the app?
        </button>
      ) : (
        <button
          className="btn btn-outline w-full"
          style={{ color: "var(--danger)" }}
          onClick={() => setConfirming(true)}
        >
          Log Out
        </button>
      )}
    </section>
  );
}

"use client";


import { clearUnitsCache } from "@/lib/useUnits";
import { ADAPT_VERSION, groupedWorkTypes, workType } from "@/lib/workTypes";
import { AREA_UNITS, CURRENCIES, areaUnit, priceOut, roundMoney } from "@/lib/units";
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

      <FarmOrganization
        onChanged={() => {
          load();
          flash("Community switched");
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
        settings={settings}
        onChanged={() => {
          load();
          flash("Saved");
        }}
      />

      <Language profile={profile} onChanged={() => { load(); flash("Language saved"); }} />

      <CurrencyAndArea
        settings={settings}
        onChanged={() => {
          load();
          flash("Saved");
        }}
      />

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
  // Only Owner Name is editable here, and it writes to the LOGIN, not to this
  // business (R13, 2026-08-23):
  //
  //   Business Name  read-only — AgroAPI owns it. Editing it here would let the
  //                  name a farmer sees disagree with AgroAPI and every other
  //                  consumer of the platform. Change it in AgroAPI.
  //   Owner Name     editable, via PATCH /api/me (app_users.name).
  //   Phone number   editable, same route. It IS the login, so changing it
  //                  changes how this account signs in — which is the point:
  //                  a contractor's number is his own, and the farmer's side
  //                  has always been editable. The read-only rule here was to
  //                  stop a tester locking themselves out of a shared test
  //                  account, which is not who uses this any more.
  //   Password       changeable, POST /api/me/password.
  const [editing, setEditing] = useState(false);
  const [ownerName, setOwnerName] = useState(profile.ownerName || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setOwnerName(profile.ownerName || "");
    setPhone(profile.phone || "");
    setError("");
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError("");
    // Owner name and phone both live on the login, so this is /api/me — the
    // same route the farmer's Profile uses, with the same validation and the
    // same duplicate check.
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ownerName, phone }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Could not save.");
      return;
    }
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
          <ViewRow label="Phone number" value={profile.phone} />
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">Organization: {organization}</p>
        </div>
        <ChangePassword />
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Contractor Profile</h2>
      <div className="flex flex-col gap-2">
        <div>
          <div className="field-label">Contractor / Business Name</div>
          <div className="detail-row">
            <div className="val">{profile.businessName || "—"}</div>
          </div>
          <p className="text-[11px] text-[var(--text-tert)]">Set in AgroAPI</p>
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
          {/* Editable now. It used to be read-only to stop a tester locking
              themselves out of a shared test account — but the people about to
              use this are real contractors whose number is their own, and the
              farmer's side has been editable all along. */}
          <div className="field-label">Phone number</div>
          <input
            className="field"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-[11px] text-[var(--text-tert)]">
            This is how you sign in — changing it changes your login.
          </p>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <EditActions busy={busy} onCancel={() => setEditing(false)} onSave={save} />
        <p className="text-[11px] text-[var(--text-tert)]">Organization: {organization}</p>
      </div>
    </section>
  );
}

// Same panel as the farmer's Profile, closed until asked for: a password box
// standing open on a settings screen is something to scroll past, not to use.
function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error || "Could not change password.");
      return;
    }
    setCurrent("");
    setNext("");
    setMsg("Password changed");
    setTimeout(() => {
      setMsg("");
      setOpen(false);
    }, 1500);
  }

  if (!open) {
    return (
      <button
        className="mt-3 flex w-full items-center justify-between text-left"
        onClick={() => setOpen(true)}
      >
        <span className="text-sm font-medium">Change Password</span>
        <span className="text-[var(--text-tert)]">›</span>
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="field-label">Change Password</div>
      <input
        className="field mb-2"
        type="password"
        placeholder="Current password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className="field"
        type="password"
        placeholder="New password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <p className="mt-1 text-[11px] text-[var(--text-tert)]">At least 6 characters.</p>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      {msg && <p className="mt-2 text-sm text-[var(--green-dark)]">{msg}</p>}
      <div className="mt-2 flex gap-2">
        <button
          className="btn btn-outline flex-1"
          onClick={() => {
            setOpen(false);
            setCurrent("");
            setNext("");
            setError("");
          }}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary flex-1"
          disabled={busy || !current || !next}
          onClick={submit}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Which farming community this contractor is currently working in (R2).
//
// Shown even when there is only one — the same decision as the farmer's
// Choose Contractor step: it makes the capability visible rather than hiding
// it until a second community exists.
//
// This is a HARD scope, not a display filter. Switching hides the previous
// community's fields, customers, orders and reports rather than adding to
// them, which is why the open-job count is shown before committing. Nothing
// is deleted — every row keeps its own community, so switching back restores
// the view exactly.
function FarmOrganization({ onChanged }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);

  const load = useCallback(() => {
    fetch("/api/my/farm-organizations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function choose(orgId) {
    setBusy(true);
    const res = await fetch("/api/my/farm-organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: orgId }),
    });
    setBusy(false);
    setPending(null);
    setEditing(false);
    if (res.ok) {
      load();
      onChanged();
    }
  }

  if (!data) return null;
  const current = data.options.find((o) => o.isCurrent);

  if (!editing) {
    return (
      <section className="mb-6">
        <SectionHeader
          title="Farming Community"
          onEdit={data.options.length ? () => setEditing(true) : undefined}
        />
        <div className="flex flex-col gap-1.5">
          <ViewRow label="Working in" value={current?.name || data.current || "—"} />
          {current && (
            <ViewRow
              label="Prices shown in"
              value={`${current.currency} per ${current.areaUnit}`}
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Farming Community</h2>
      <div className="fieldset-note">
        Which community you are working in. Jobs, customers and fields from the
        others are hidden until you switch back — nothing is lost.
      </div>
      <div className="flex flex-col gap-2">
        {data.options.map((o) => (
          <button
            key={o.id}
            className={`choice-card ${o.isCurrent ? "selected" : ""}`}
            onClick={() => (o.isCurrent ? setEditing(false) : setPending(o))}
          >
            <div className="txt">
              <b>{o.name}</b>
              <span>
                {o.currency} per {o.areaUnit}
                {o.openJobs ? ` · ${o.openJobs} open job${o.openJobs > 1 ? "s" : ""}` : ""}
              </span>
            </div>
            {o.isCurrent && <span className="ml-auto font-bold">✓</span>}
          </button>
        ))}
        <button className="btn btn-outline" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5">
            <p className="mb-1 font-bold">Switch to {pending.name}?</p>
            <p className="mb-4 text-xs text-[var(--text-sec)]">
              {current?.openJobs
                ? `${current.name} has ${current.openJobs} open job${
                    current.openJobs > 1 ? "s" : ""
                  }. They stay saved but disappear from your screens until you switch back.`
                : "Your current community's work stays saved and hidden until you switch back."}
            </p>
            <div className="flex gap-2">
              <button
                className="btn btn-outline flex-1"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-go flex-1"
                disabled={busy}
                onClick={() => choose(pending.id)}
              >
                {busy ? "Switching…" : "Switch"}
              </button>
            </div>
          </div>
        </div>
      )}
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

// The work type is what the contractor picks; the AgroAPI activity type and the
// ADAPT operation code are both derived from it server-side. Neither standard is
// shown here — a contractor should not need to know two vocabularies to price a
// job. Before 2026-09-22 this form sent a hardcoded "other", so every service
// created in the app was filed in AgroAPI as an unclassified activity.
function ServiceList({ services, unit, currency, settings, onChanged }) {
  const groups = groupedWorkTypes();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [newDrafts, setNewDrafts] = useState([]);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    const d = {};
    services.forEach((s) => {
      d[s.id] = {
        price: String(priceOut(s.price_per_m2_thb, settings.areaUnitM2, settings.currency)),
        active: s.active,
        adaptCode: s.adapt_code || "",
      };
    });
    setDrafts(d);
    setNewDrafts([]);
    setEditing(true);
  }

  function setDraft(id, patch) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }

  function addDraftRow() {
    setNewDrafts((rows) => [
      ...rows,
      { clientId: `new-${rows.length}`, name: "", price: "", adaptCode: "" },
    ]);
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
        const shown = priceOut(s.price_per_m2_thb, settings.areaUnitM2, settings.currency);
        const priceChanged = Number(d.price) !== Number(shown);
        const activeChanged = d.active !== s.active;
        const typeChanged = d.adaptCode && d.adaptCode !== (s.adapt_code || "");
        if (!priceChanged && !activeChanged && !typeChanged) return null;
        return fetch(`/api/services/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(priceChanged ? { pricePerUnit: d.price } : {}),
            ...(activeChanged ? { active: d.active } : {}),
            ...(typeChanged ? { adaptCode: d.adaptCode } : {}),
          }),
        });
      })
    );
    await Promise.all(
      newDrafts
        .filter((r) => r.name.trim() && r.adaptCode)
        .map((r) =>
          fetch("/api/services", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: r.name.trim(),
              pricePerUnit: r.price || 0,
              adaptCode: r.adaptCode,
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
              className={`card p-2 ${active ? "" : "opacity-50"}`}
            >
              <div className="flex items-center gap-2">
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
                <span className="w-24 text-right text-sm">
                  {roundMoney(
                    priceOut(s.price_per_m2_thb, settings.areaUnitM2, settings.currency),
                    settings.currency
                  ).toLocaleString()}
                </span>
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

              {/* What kind of work this is. Chosen once, here; it decides what
                  AgroAPI records the job as and what the ADAPT export says. */}
              <div className="mt-1 flex items-center gap-2">
                {editing ? (
                  <select
                    value={draft?.adaptCode ?? ""}
                    onChange={(e) => setDraft(s.id, { adaptCode: e.target.value })}
                    disabled={!active}
                    className="flex-1 rounded border border-[var(--rule)] px-2 py-1 text-xs"
                  >
                    <option value="">Kind of work…</option>
                    {groups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map((w) => (
                          <option key={w.code} value={w.code}>
                            {w.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-[var(--text-tert)]">
                    {workType(s.adapt_code)?.label || "Kind of work not set"}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {editing &&
          newDrafts.map((r) => (
            <div key={r.clientId} className="card p-2">
              <div className="flex items-center gap-2">
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

              {/* Required: a service with no work type cannot be recorded in
                  AgroAPI or exported, so the API refuses it and the row is not
                  sent rather than saved half-formed. */}
              <div className="mt-1">
                <select
                  value={r.adaptCode}
                  onChange={(e) => setNewDraft(r.clientId, { adaptCode: e.target.value })}
                  className="w-full rounded border border-[var(--rule)] px-2 py-1 text-xs"
                >
                  <option value="">Kind of work… (required)</option>
                  {groups.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map((w) => (
                        <option key={w.code} value={w.code}>
                          {w.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
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

      {/* The version this app's work types were built against. One of the
          three places it is pinned — the other two are WORK_TYPE_MAP.md and
          every stored ADAPT document. Shown here so the version in use is
          visible without reading the source, and so a mismatch is noticeable
          if AgGateway publishes a new one. */}
      <p className="mt-2 text-[11px] text-[var(--text-tert)]">
        Work types are compatible with ADAPT v{ADAPT_VERSION}.
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

// What the community bills and measures in.
//
// Deliberately a COMMUNITY setting, not a contractor one (review item R4): one
// community bills in one currency and measures in one unit, and a contractor
// and a farmer looking at the same field must never disagree about what it
// measures. So changing this changes what every farmer here sees too, which
// the note below says out loud.
//
// Safe to change whenever: each work report freezes its own currency and unit
// label at creation, so past reports keep reading in whatever was set when the
// work was done.
function CurrencyAndArea({ settings, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [currency, setCurrency] = useState(settings.currency);
  const [unit, setUnit] = useState(settings.areaUnit);
  const [busy, setBusy] = useState(false);

  function startEdit() {
    setCurrency(settings.currency);
    setUnit(settings.areaUnit);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency, areaUnit: unit }),
    });
    // Every screen that shows an area or a price reads the cached setting, so
    // it has to be dropped here or the Booking list keeps saying sào after a
    // switch to hectares.
    clearUnitsCache();
    setBusy(false);
    setEditing(false);
    onChanged();
  }

  const chosen = areaUnit(unit);
  // Nothing is migrated when this changes: prices are stored as THB per m²
  // and simply render differently afterwards.
  if (!editing) {
    return (
      <section className="mb-6">
        <SectionHeader title="Currency &amp; Area Unit" onEdit={startEdit} />
        <div className="flex flex-col gap-1.5">
          <ViewRow label="Currency" value={settings.currency} />
          <ViewRow
            label="Area unit"
            value={
              settings.areaUnitM2
                ? `${settings.areaUnit} · ${Number(settings.areaUnitM2).toLocaleString()} m²`
                : settings.areaUnit
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">Currency &amp; Area Unit</h2>
      <div className="fieldset-note">
        Applies to everyone in this community, not just you. Reports already
        written keep the currency and unit they were created with.
      </div>

      <label className="mb-1 block text-xs text-[var(--text-sec)]">Currency</label>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="mb-3 w-full rounded border border-[var(--rule)] px-2 py-2 text-sm"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label} — {c.note}
          </option>
        ))}
      </select>

      <label className="mb-1 block text-xs text-[var(--text-sec)]">Area unit</label>
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="w-full rounded border border-[var(--rule)] px-2 py-2 text-sm"
      >
        {AREA_UNITS.map((u) => (
          <option key={u.unit} value={u.unit}>
            {u.unit} — {u.note}
          </option>
        ))}
      </select>
      {chosen && (
        <p className="mt-1 text-[11px] text-[var(--text-tert)]">
          1 {chosen.unit} = {chosen.m2.toLocaleString()} m²
        </p>
      )}

      <EditActions busy={busy} onCancel={() => setEditing(false)} onSave={save} />
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

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
      <h1 className="mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-5 text-xs text-[var(--text-tert)]">
        {settings.organization} · {settings.currency} per {settings.areaUnit}
      </p>

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

      <Account profile={profile} onChanged={() => { load(); flash("Language saved"); }} />
    </>
  );
}

function ContractorProfile({ profile, organization, onChanged }) {
  const [businessName, setBusinessName] = useState(profile.businessName || "");
  const [ownerName, setOwnerName] = useState(profile.ownerName || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch("/api/contractor-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, ownerName, phone }),
    });
    setBusy(false);
    onChanged();
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
        <button
          onClick={save}
          disabled={busy}
          className="btn btn-primary mt-1"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <p className="text-[11px] text-[var(--text-tert)]">Organization: {organization}</p>
      </div>
    </section>
  );
}

function HomeBase({ profile, onChanged }) {
  const [pin, setPin] = useState(
    profile.homeLat != null && profile.homeLng != null
      ? { lat: profile.homeLat, lng: profile.homeLng }
      : null
  );
  const [busy, setBusy] = useState(false);

  async function pick(p) {
    setPin(p);
    setBusy(true);
    await fetch("/api/contractor-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ homeLat: p.lat, homeLng: p.lng }),
    });
    setBusy(false);
    onChanged();
  }

  return (
    <section className="mb-6">
      <h2 className="mb-1 text-sm font-semibold">Home Base Location</h2>
      <p className="mb-2 text-[11px] text-[var(--text-tert)]">
        Used to route Today&apos;s Work — the closest open job to home comes
        first. Tap the map to set it.
      </p>
      <Map pin={pin} onPick={pick} height={200} />
      <p className="mt-1 text-[11px] text-[var(--text-tert)]">
        {busy
          ? "Saving…"
          : pin
          ? `Home at ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`
          : "No home base set yet."}
      </p>
    </section>
  );
}

function ServiceList({ services, unit, currency, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  async function savePrice(service, value) {
    await fetch(`/api/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePerUnit: value }),
    });
    onChanged();
  }

  async function add(e) {
    e.preventDefault();
    await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, pricePerUnit: price, activityCanonical: "other" }),
    });
    setName("");
    setPrice("");
    setAdding(false);
    onChanged();
  }

  async function toggleAvailable(service) {
    await fetch(`/api/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !service.active }),
    });
    onChanged();
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Services &amp; pricing</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs text-[var(--text-sec)] underline"
        >
          {adding ? "cancel" : "+ add"}
        </button>
      </div>

      {adding && (
        <form onSubmit={add} className="mb-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Service name"
            required
            className="flex-1 rounded field"
          />
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            className="w-24 rounded field"
          />
          <button className="rounded bg-black px-3 text-sm text-white">Add</button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {services.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-2 card p-2 ${s.active ? "" : "opacity-50"}`}
          >
            <span className="flex-1 text-sm">{s.name}</span>
            <input
              type="number"
              defaultValue={Number(s.price_per_unit)}
              onBlur={(e) => savePrice(s, e.target.value)}
              disabled={!s.active}
              className="w-24 rounded border border-[var(--rule)] px-2 py-1 text-right text-sm"
            />
            <span className="w-16 text-xs text-[var(--text-tert)]">
              {currency}/{unit}
            </span>
            <button
              onClick={() => toggleAvailable(s)}
              className={`rounded px-2 py-1 text-[11px] ${
                s.active ? "bg-green-light text-green-dark" : "bg-surface text-tert"
              }`}
            >
              {s.active ? "Available" : "Unavailable"}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-tert)]">
        A service priced 0 will bill nothing — set it before you report
        against it. Marking a service Unavailable hides it from new bookings
        without losing its price history.
      </p>
    </section>
  );
}

function Account({ profile, onChanged }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

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
    <section className="mb-10">
      <h2 className="mb-2 text-sm font-semibold">Account</h2>
      <div className="mb-3">
        <div className="field-label">Language</div>
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
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-tert)]">
          Sets your preference — the rest of the app stays in English for now.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-[var(--text-sec)]">Mobile Number</span>
        <span>{profile.phone || "—"}</span>
      </div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-[var(--text-sec)]">LINE Connection</span>
        <span>{profile.lineAccount ? `Connected · ${profile.lineAccount}` : "Not connected"}</span>
      </div>

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

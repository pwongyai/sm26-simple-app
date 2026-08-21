"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Map from "@/components/Map";
import SelectArea from "@/components/SelectArea";
import MachinePhoto from "@/components/MachinePhoto";
import ImplementPicker from "@/components/ImplementPicker";
import { FULL_PAGE_MAP_HEIGHT } from "@/lib/mapHeight";

// Version 3's three ranges — Today, 2 days, Custom — rather than the wider
// windows this used to offer. Matches TRAJECTORY_FETCH_GUIDE.md's chunked
// fetch (src/app/api/machines/[machineId]/track/route.js), which makes even
// a full day's dense telemetry safe to pull without silently losing points.
const RANGES = [
  { key: "today", label: "Today" },
  { key: "2days", label: "2 days" },
  { key: "custom", label: "Custom" },
  { key: "latest", label: "Latest" },
];

const PANES = [
  { key: "trajectory", label: "Trajectory" },
  { key: "details", label: "Machine Details" },
];

function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

function startOfDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// The server clamps Custom to 1 week regardless — this just keeps the date
// pickers from offering a range it'll only clamp anyway.
function maxUntil(since) {
  if (!since) return undefined;
  const d = new Date(`${since}T00:00:00`);
  d.setDate(d.getDate() + 6);
  const today = todayISO();
  const capped = d.toLocaleDateString("en-CA");
  return capped < today ? capped : today;
}

export default function MachineDetailPage({ params }) {
  const { machineId } = use(params);
  const [pane, setPane] = useState("trajectory");
  const [range, setRange] = useState("today");
  const [customSince, setCustomSince] = useState(todayISO());
  const [customUntil, setCustomUntil] = useState(todayISO());
  // "Latest" is a single found day, not a picked range — null until the
  // backward search (see findLatestActivityDate) resolves one.
  const [latestDate, setLatestDate] = useState(null);
  const [findingLatest, setFindingLatest] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState(null);
  const [selectingArea, setSelectingArea] = useState(false);
  // Captured from the Trajectory map once it settles — handed to Select
  // Area so its map opens on the exact same view instead of re-fitting and
  // (usually, but not reliably) landing back near it.
  const [mapView, setMapView] = useState(null);
  // The exact window the currently-displayed trajectory came from — handed
  // to Select Area so a tapped field's report is computed over the same
  // real window already on screen, not re-derived from a single point's date.
  const [loadedRange, setLoadedRange] = useState(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");

    // `until` is pinned to a single value, once, right here — client-side —
    // rather than left for the server to resolve its own `Date.now()` at
    // request time. Select Area later re-requests this exact same window
    // (to compute a report over "the trajectory already on screen"), and
    // the track cache is keyed by exact millisecond boundaries — two
    // independently-computed "now"s always differ by at least the first
    // fetch's round-trip time, which silently defeated the cache on every
    // single report tap (the whole fetch, not just the tail, for any
    // range under 4 hours). One value, used everywhere downstream, fixes it.
    let since, until;
    if (range === "today") {
      since = startOfDaysAgo(0).toISOString();
      until = new Date().toISOString();
    } else if (range === "2days") {
      since = startOfDaysAgo(1).toISOString();
      until = new Date().toISOString();
    } else if (range === "latest") {
      // Nothing to load yet — the "finding latest date" effect below is
      // still searching, and will call load() again once it resolves.
      if (!latestDate) {
        setLoading(false);
        return;
      }
      since = new Date(`${latestDate}T00:00:00+07:00`).toISOString();
      until = new Date(`${latestDate}T23:59:59+07:00`).toISOString();
    } else {
      // The date inputs can be cleared by the user (backspace, the native ×
      // button) — guard against building an invalid Date from an empty or
      // malformed string instead of crashing the whole page.
      //
      // Built with an explicit +07:00 (Bangkok, this org's only timezone,
      // no DST) rather than plain `T00:00:00` — that reads as the
      // *browser's* local time, and converting that to UTC silently
      // shifts the boundary by whatever offset the phone happens to be
      // set to. A picked date must mean that Bangkok calendar day
      // everywhere, not "midnight wherever this device thinks it is."
      const sinceDate = new Date(`${customSince}T00:00:00+07:00`);
      if (!customSince || Number.isNaN(sinceDate.getTime())) {
        setError("Pick a start date.");
        setLoading(false);
        return;
      }
      const untilStr = maxUntil(customSince) < customUntil ? maxUntil(customSince) : customUntil;
      const untilDate = new Date(`${untilStr}T23:59:59+07:00`);
      if (!untilStr || Number.isNaN(untilDate.getTime())) {
        setError("Pick an end date.");
        setLoading(false);
        return;
      }
      since = sinceDate.toISOString();
      until = untilDate.toISOString();
    }
    const query = new URLSearchParams({ since });
    if (until) query.set("until", until);
    if (force) query.set("refresh", "1");

    try {
      const res = await fetch(`/api/machines/${machineId}/track?${query}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
      // `until` is always set above now — reusing that exact value (not a
      // fresh `new Date()`) is the whole point of the fix.
      setLoadedRange({ since, until });
    } catch {
      setError("Could not load this machine's track.");
    } finally {
      setLoading(false);
    }
  }, [machineId, range, customSince, customUntil, latestDate]);

  // Deliberately not depending on `load` itself — `load` is recreated every
  // time customSince/customUntil change (it needs the current value in its
  // closure for the Check button), and depending on it here would silently
  // refire a real AgroAPI fetch on every date edit instead of waiting for
  // Check. Today/2 days still auto-load on their own switch (no dates to
  // edit); Custom only ever loads via the Check button below.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId, range]);

  // Switching to "Latest" kicks off the backward search; switching away
  // clears it so re-selecting "Latest" later re-searches rather than
  // silently reusing a stale date from a previous visit.
  useEffect(() => {
    if (range !== "latest") {
      setLatestDate(null);
      return;
    }
    let cancelled = false;
    setFindingLatest(true);
    fetch(`/api/machines/${machineId}/latest-track-date`)
      .then((r) => (r.ok ? r.json() : { date: null }))
      .then((d) => {
        if (!cancelled) setLatestDate(d.date);
      })
      .catch(() => {
        if (!cancelled) setLatestDate(null);
      })
      .finally(() => {
        if (!cancelled) setFindingLatest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, machineId]);

  // Once the search resolves a date, actually load that day's trajectory —
  // `load()` above only builds the query once `latestDate` is set.
  useEffect(() => {
    if (range === "latest" && latestDate) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestDate]);

  // Richer metadata (make/model/serial) lives on the machine list's own
  // endpoint — reused here rather than duplicated.
  useEffect(() => {
    fetch("/api/machines")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setMeta(list.find((m) => m.id === machineId) || null))
      .catch(() => {});
  }, [machineId]);

  const points = data?.points || [];

  return (
    <>
      <Link href="/contractor/machines" className="mb-4 inline-block text-sm text-[var(--text-sec)]">
        ← Machines
      </Link>

      <div className="subtabs mb-3">
        {PANES.map((p) => (
          <button
            key={p.key}
            className={`subtab-btn ${pane === p.key ? "active" : ""}`}
            onClick={() => setPane(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === "trajectory" ? (
        <>
          <div className="mb-3 flex gap-2">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  range === r.key ? "border-black bg-[var(--ink)] text-white" : "border-[var(--rule)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {range === "custom" && (
            <div className="mb-3 flex items-center gap-1">
              <input
                type="date"
                className="field min-w-0 flex-1 pr-1.5"
                value={customSince}
                max={todayISO()}
                onChange={(e) => {
                  setCustomSince(e.target.value);
                  if (customUntil > maxUntil(e.target.value)) {
                    setCustomUntil(maxUntil(e.target.value));
                  }
                }}
              />
              <span className="shrink-0 text-[11px] text-[var(--text-tert)]">to</span>
              <input
                type="date"
                className="field min-w-0 flex-1 pr-1.5"
                value={customUntil}
                min={customSince}
                max={maxUntil(customSince)}
                onChange={(e) => setCustomUntil(e.target.value)}
              />
              <button
                onClick={load}
                className="btn btn-primary shrink-0 text-[11px]"
                style={{ padding: "6px 9px" }}
              >
                Check
              </button>
            </div>
          )}

          {range === "latest" && (
            <div className="mb-3 text-xs text-[var(--text-sec)]">
              {findingLatest
                ? "Searching for this machine's most recent activity…"
                : latestDate
                  ? `Most recent activity: ${new Date(`${latestDate}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
                  : "No GPS activity found for this machine in the past year."}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && <p className="text-sm text-[var(--text-sec)]">Loading track…</p>}

          {!loading && data && (
            <>
              {points.length > 1 ? (
                <Map
                  track={points}
                  trackEndIcon="🚜"
                  height={FULL_PAGE_MAP_HEIGHT}
                  onViewChange={setMapView}
                />
              ) : (
                <div
                  className="flex items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--map-b)] text-xs text-[var(--text-tert)]"
                  style={{ height: FULL_PAGE_MAP_HEIGHT }}
                >
                  No GPS points in this range.
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button onClick={() => load(true)} className="btn btn-outline flex-1">
                  Refresh
                </button>
                <button
                  className="btn btn-go flex-1"
                  disabled={points.length < 2}
                  onClick={() => setSelectingArea(true)}
                >
                  Create Report →
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <MachineDetailsPane meta={meta} />
      )}

      {selectingArea && (
        <SelectArea
          machine={{ id: machineId, name: data?.machine?.name }}
          points={points}
          since={loadedRange?.since}
          until={loadedRange?.until}
          initialView={mapView}
          onClose={() => setSelectingArea(false)}
        />
      )}
    </>
  );
}

const MACHINE_ROWS = (meta) => [
  ["Machine Name", meta.name],
  ["Type", meta.kind || "—"],
  ["Vendor", meta.make || "—"],
  ["Model", meta.model || "—"],
];

function MachineDetailsPane({ meta }) {
  const [implement, setImplement] = useState(null);
  const [loadingImplement, setLoadingImplement] = useState(true);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!meta) return;
    fetch(`/api/machines/${meta.id}/implement`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setImplement)
      .catch(() => {})
      .finally(() => setLoadingImplement(false));
  }, [meta]);

  if (!meta) return <p className="text-sm text-[var(--text-sec)]">Loading…</p>;

  return (
    <>
      <MachinePhoto id={meta.id} kind={meta.kind} className="photo-box mb-4" emptyContent="🚜" />

      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tert)]">
          Machine
        </h2>
      </div>
      <div className="spec-card mb-4">
        <div className="spec-grid">
          {MACHINE_ROWS(meta).map(([lbl, val]) => (
            <div className="spec-row" key={lbl}>
              <div className="lbl">{lbl}</div>
              <div className="val">{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tert)]">
          Implement
        </h2>
        {!loadingImplement && (
          <button className="text-xs font-bold" onClick={() => setPicking(true)}>
            {implement ? "Edit" : "Assign"}
          </button>
        )}
      </div>
      <div className="spec-card">
        {loadingImplement ? (
          <p className="text-sm text-[var(--text-sec)]">Loading…</p>
        ) : implement ? (
          <div className="spec-grid">
            <div className="spec-row">
              <div className="lbl">Implement Type</div>
              <div className="val">{implement.name}</div>
            </div>
            <div className="spec-row">
              <div className="lbl">Implement Width</div>
              <div className="val">{implement.width_m ? `${implement.width_m} m` : "—"}</div>
            </div>
          </div>
        ) : (
          <p className="empty-msg" style={{ padding: "8px 0" }}>
            No implement assigned yet.
          </p>
        )}
      </div>

      <FuelSection machineId={meta.id} />

      <p className="mt-4 text-xs text-[var(--text-tert)]">Machine ID: {meta.id}</p>

      {picking && (
        <ImplementPicker
          machineId={meta.id}
          currentImplementId={implement?.id}
          onClose={() => setPicking(false)}
          onAssigned={setImplement}
        />
      )}
    </>
  );
}

// Diesel is the only fuel type this fleet actually runs on — a real fixed
// label, not a placeholder for a feature that isn't built. A Default rate
// always applies; a specific job only needs its own row when it genuinely
// burns differently (wet ground, a heavier implement) — that's the whole
// reason this isn't just one number per machine.
function FuelSection({ machineId }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newServiceId, setNewServiceId] = useState("");
  const [saved, setSaved] = useState("");

  const load = useCallback(() => {
    fetch(`/api/machines/${machineId}/fuel-rates`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [machineId]);

  useEffect(() => {
    load();
  }, [load]);

  function flashSaved() {
    setSaved("Saved");
    setTimeout(() => setSaved(""), 1200);
  }

  async function saveDefault(value) {
    await fetch(`/api/machines/${machineId}/fuel-rates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: null, fuelLPerKm: value }),
    });
    flashSaved();
    load();
  }

  async function saveOverride(serviceId, value) {
    await fetch(`/api/machines/${machineId}/fuel-rates`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, fuelLPerKm: value }),
    });
    flashSaved();
    load();
  }

  async function removeOverride(serviceId) {
    await fetch(`/api/machines/${machineId}/fuel-rates?serviceId=${serviceId}`, {
      method: "DELETE",
    });
    load();
  }

  function confirmAdd() {
    if (!newServiceId) return;
    saveOverride(newServiceId, "");
    setAdding(false);
    setNewServiceId("");
  }

  if (!data) return null;

  const availableServices = data.services.filter(
    (s) => !data.overrides.some((o) => o.serviceId === s.id)
  );

  return (
    <>
      <div className="mb-1 mt-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tert)]">
          Fuel
        </h2>
        {saved && <span className="text-xs text-green-dark">{saved}</span>}
      </div>
      <div className="spec-card">
        <div className="spec-row">
          <div className="lbl">Type</div>
          <div className="val">Diesel</div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs font-medium">Default</span>
            <input
              type="number"
              step="0.1"
              defaultValue={data.defaultLPerKm ?? ""}
              placeholder={String(data.suggestedDefault)}
              onBlur={(e) => saveDefault(e.target.value)}
              className="w-20 rounded border border-[var(--rule)] px-2 py-1 text-right text-sm"
            />
            <span className="w-12 text-xs text-[var(--text-tert)]">L/km</span>
          </div>

          {data.overrides.map((o) => (
            <div key={o.serviceId} className="flex items-center gap-2">
              <span className="flex-1 text-xs">{o.serviceName}</span>
              <input
                type="number"
                step="0.1"
                defaultValue={o.fuelLPerKm ?? ""}
                onBlur={(e) => saveOverride(o.serviceId, e.target.value)}
                className="w-20 rounded border border-[var(--rule)] px-2 py-1 text-right text-sm"
                autoFocus={o.fuelLPerKm === null}
              />
              <span className="w-12 text-xs text-[var(--text-tert)]">L/km</span>
              <button
                className="text-xs text-[var(--danger)]"
                onClick={() => removeOverride(o.serviceId)}
                aria-label={`Remove ${o.serviceName} override`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="flex items-center gap-2">
            <select
              className="field flex-1"
              value={newServiceId}
              onChange={(e) => setNewServiceId(e.target.value)}
              autoFocus
            >
              <option value="">Choose a job…</option>
              {availableServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="text-xs font-bold" onClick={confirmAdd}>
              Add
            </button>
            <button className="text-xs" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        ) : (
          availableServices.length > 0 && (
            <button className="text-left text-xs font-bold" onClick={() => setAdding(true)}>
              + Add Job Override
            </button>
          )
        )}
      </div>
    </>
  );
}

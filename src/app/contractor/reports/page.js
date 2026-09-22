"use client";

import { useUnits } from "@/lib/useUnits";
import { fmtMoney, moneySymbol } from "@/lib/units";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Map from "@/components/Map";
import FrozenHeaderScroll from "@/components/FrozenHeaderScroll";
import { fieldAndOwner } from "@/lib/labels";
import { useT } from "@/lib/i18n";

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

// v3's ledger filters: This Month/Week/Today are rolling windows ending
// today (not calendar boundaries) — matches `reportDateInRange` in
// `digital-notebook-prototype.html` exactly.
//
// Applied to started_at — WHEN THE WORK WAS DONE. The two dates answer
// different questions and deliberately use different columns:
//
//   sort   created_at   so the report you just wrote is at the top
//   filter started_at   so t("This Month") means work done this month, which is
//                       the billing question a contractor actually asks
//
// A report written today for a session last November therefore does NOT appear
// under t("This Month"), and that is correct — the work was not this month. This
// was briefly "fixed" to created_at on 2026-08-23 on the mistaken reasoning
// that a newly written report must always be visible; it need not be, under a
// work-date filter. Reverted the same day. Do not make the filter follow the
// sort: they are measuring different things.
function inTimeRange(iso, filter) {
  if (filter === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  const today = new Date();
  if (filter === "today") return d.toDateString() === today.toDateString();
  if (filter === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    return d >= from && d <= today;
  }
  if (filter === "month") {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return d >= from && d <= today;
  }
  // A season is longer than a month. Work reported in July is still the
  // current season's work in September, and the default filter was hiding it
  // behind an empty list (2026-09-23).
  if (filter === "6months") {
    const from = new Date(today);
    from.setMonth(from.getMonth() - 6);
    return d >= from && d <= today;
  }
  return true;
}

// Normalizes a boundary's lng/lat ring into a 0–100 box, independently per
// axis (same convention v3's `svgPoly` uses on its own pre-normalized demo
// data) — paired with `preserveAspectRatio="none"` so it fills the thumbnail
// regardless of the field's real aspect ratio.
function polygonPoints(boundary) {
  const outer = boundary?.[0];
  if (!outer?.length) return null;
  const lngs = outer.map((p) => p[0]);
  const lats = outer.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLng = maxLng - minLng || 1;
  const spanLat = maxLat - minLat || 1;
  return outer
    .map(([lng, lat]) => {
      const x = ((lng - minLng) / spanLng) * 100;
      const y = 100 - ((lat - minLat) / spanLat) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

const OVERVIEW_TAB = "overview";
const MACHINE_TAB = "machine";

// Re-derives the billed area for a different implement width. This used to
// be a pure local recompute (a plain `insideDistanceM * widthM`), which was
// exact for that formula but not for the real one: the engine now buffers
// and unions the actual track geometry (src/lib/engine.js), which doesn't
// scale linearly with width, so getting the real number back means asking
// the server to recompute for real — /api/reports/preview already supports
// this via `cropzoneId` (skipping field resolution, since it's already
// known) and a `widthM` override.
async function withWidth(chosen, widthM, serviceId) {
  if (!chosen?.cropzoneId || !chosen?.machineId || !chosen?.startedAt) return chosen;
  const query = new URLSearchParams({
    cropzoneId: chosen.cropzoneId,
    machineId: chosen.machineId,
    machineName: chosen.machineName || "",
    since: chosen.startedAt,
    until: chosen.endedAt || new Date().toISOString(),
    widthM: String(widthM),
    ...(serviceId ? { serviceId } : {}),
  });
  const res = await fetch(`/api/reports/preview?${query}`);
  const preview = await res.json();
  if (!res.ok) throw new Error(preview.error || "Could not recompute this report.");
  return preview;
}

function ReportThumb({ boundary }) {
  const points = polygonPoints(boundary);
  if (!points) return <div className="report-thumb" />;
  return (
    <div className="report-thumb">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon
          points={points}
          fill="var(--purple-light)"
          fillOpacity="0.55"
          stroke="var(--purple)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export default function ReportsTab() {
  return (
    <Suspense fallback={null}>
      <ReportsTabInner />
    </Suspense>
  );
}

// The Machine tab's Select Area hands off here with ?createDate=... once a
// field is picked (and, via its Match Work Order step, matched to a farmer
// and possibly an order) — opens straight into review, the same way version
// 3 does: Select Area's tap is what pins down the field, this screen never
// re-asks "which one."
function ReportsTabInner() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromSelectArea = searchParams.get("fromSelectArea") === "1";
  const [reports, setReports] = useState([]);
  const [creating, setCreating] = useState(fromSelectArea);
  const [viewing, setViewing] = useState(null);

  // Open a report's detail from its full row, not from the summary the list
  // holds. The list deliberately omits `track_points` (~2 kB a report), and the
  // detail view draws the machine's path from exactly that — so handing it the
  // list row rendered a map with the field outline and no track, which is the
  // most persuasive thing on the screen (2026-08-23).
  //
  // Falls back to the list row if the fetch fails: a map without a track beats
  // a dead tap.
  async function openReport(row) {
    try {
      const res = await fetch(`/api/reports/${row.id}`, { cache: "no-store" });
      setViewing(res.ok ? await res.json() : row);
    } catch {
      setViewing(row);
    }
  }
  const [timeFilter, setTimeFilter] = useState("6months");
  const [machineFilter, setMachineFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");

  const loadReports = useCallback(async () => {
    const res = await fetch("/api/reports");
    if (res.ok) setReports(await res.json());
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function togglePaid(report) {
    const next = report.payment_status === "paid" ? "unpaid" : "paid";
    setReports((rs) => rs.map((r) => (r.id === report.id ? { ...r, payment_status: next } : r)));
    setViewing((v) => (v && v.id === report.id ? { ...v, payment_status: next } : v));
    await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: next }),
    });
  }

  const machineNames = [...new Set(reports.map((r) => r.machine_name).filter(Boolean))];

  const filtered = reports.filter((r) => {
    if (machineFilter !== "all" && r.machine_name !== machineFilter) return false;
    if (payFilter !== "all" && r.payment_status !== payFilter) return false;
    if (!inTimeRange(r.started_at, timeFilter)) return false;
    return true;
  });

  const header = (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("Work Reports")}</h1>
        <button
          onClick={() => router.push("/contractor/machines")}
          className="add-btn"
        >
          + Create
        </button>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <div className="report-filters">
          <div className="filter-pill">
            <span>📅</span>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              <option value="6months">{t("Last 6 Months")}</option>
              <option value="month">{t("This Month")}</option>
              <option value="week">{t("This Week")}</option>
              <option value="today">{t("Today")}</option>
              <option value="all">{t("All Time")}</option>
            </select>
          </div>
          <div className="filter-pill">
            <span>🚜</span>
            <select value={machineFilter} onChange={(e) => setMachineFilter(e.target.value)}>
              <option value="all">{t("All Machines")}</option>
              {machineNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="pay-filter-row">
          <button className={`date-chip ${payFilter === "all" ? "active" : ""}`} onClick={() => setPayFilter("all")}>{t("All")}</button>
          <button
            className={`date-chip ${payFilter === "unpaid" ? "active" : ""}`}
            onClick={() => setPayFilter("unpaid")}
          >{t("Unpaid")}</button>
          <button className={`date-chip ${payFilter === "paid" ? "active" : ""}`} onClick={() => setPayFilter("paid")}>{t("Paid")}</button>
        </div>
      </div>
    </>
  );

  return (
    <>
      <FrozenHeaderScroll header={header}>
        {filtered.length === 0 && (
          <p className="empty-msg">
            {reports.length === 0
              ? "No reports yet. Tap + Create, pick a machine, then tap a field on its map."
              : t("No work reports match these filters.")}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((r) => (
            <button key={r.id} className="report-card" onClick={() => openReport(r)}>
              <ReportThumb boundary={r.boundary} />
              <div className="txt">
                <div className="name">{fieldAndOwner(r.field_name, r.farmer?.name || t("Unassigned"))}</div>
                <div className="sub">
                  {r.service_name || r.work_type_name || "—"} · {fmtDate(r.started_at)}
                </div>
                <div className="sub">
                  {Number(r.field_area_units ?? 0).toFixed(2)} {r.unit_label} · {r.percent_worked ?? 0}% work area
                  {r.machine_name ? ` · ${r.machine_name}` : ""}
                </div>
              </div>
              <div
                className={`report-pay-badge ${r.payment_status === "paid" ? "paid" : "unpaid"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  togglePaid(r);
                }}
              >
                <span className="ic">{r.payment_status === "paid" ? "✓" : "○"}</span>
                <span className="lbl">{r.payment_status === "paid" ? t("Paid") : t("Unpaid")}</span>
              </div>
            </button>
          ))}
        </div>
      </FrozenHeaderScroll>

      {creating && (
        <CreateReport
          onClose={() => setCreating(false)}
          onCreated={() => {
            loadReports();
          }}
          onViewExisting={async (reportId) => {
            setCreating(false);
            const res = await fetch(`/api/reports/${reportId}`);
            if (res.ok) setViewing(await res.json());
          }}
        />
      )}

      {viewing && (
        <ViewReport report={viewing} onClose={() => setViewing(null)} onTogglePaid={() => togglePaid(viewing)} />
      )}
    </>
  );
}

// A frozen, already-approved report (version 2 §15.5) — read-only Overview/
// Machine pill-tabs same as Create/Review's layout, but no Edit/Approve:
// the numbers were locked in at approval time and don't get re-derived here.
// Payment status is the one thing that genuinely still changes after the
// fact, so it stays live.
function ViewReport({ report: r, onClose, onTogglePaid }) {
  const t = useT();
  const [tab, setTab] = useState(OVERVIEW_TAB);

  const overviewFields = [
    [t("Farmer Name"), r.farmer?.name || t("Unassigned")],
    [t("Work Type"), r.service_name || r.work_type_name || "—"],
    [t("Total Hours"), r.hours != null ? `${r.hours} hr` : "—"],
    // No machine, no clock. The start time came out as 07:00 on a report
    // nobody timed — midnight UTC read in Hanoi — which looks like a
    // measurement and is not one.
    [t("Start Time"), r.agro_machine_id ? fmtTime(r.started_at) : "—"],
    [t("Stop Time"), fmtTime(r.ended_at)],
    [t("Crop Area"), `${r.field_area_units ?? "—"} ${r.unit_label || ""}`],
    [t("Work Area"), `${r.work_area_units ?? "—"} ${r.unit_label || ""}`],
    ["% Work Area", `${r.percent_worked ?? "—"}%`],
  ];

  const machineFields = [
    [t("Machine Name"), r.machine_name || "—"],
    [t("Implement Width"), r.width_m ? `${r.width_m} m` : "—"],
    // The distance INSIDE the field, not the machine's whole day. This row
    // used to read total_distance_m, which meant it could not produce the
    // fuel figure printed directly beneath it (155.68 km against 8.28 L at
    // 2.4 L/km). Sourced from inside_distance_m, distance x rate = fuel x
    // factor = emissions all check out on the page (2026-08-23).
    [
      t("Total Distance"),
      r.inside_distance_m != null ? `${(r.inside_distance_m / 1000).toFixed(2)} km` : "—",
    ],
    [t("Fuel Consumption"), r.fuel_l != null ? `${r.fuel_l} L` : "rate not set"],
    [t("Emissions"), r.emissions_kg != null ? `${r.emissions_kg} kg CO₂` : "—"],
  ];

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label={t("Back")}>
          ←
        </button>
        <span className="ov-title">{t("Review Work Report")}</span>
      </div>

      <div className="ov-body">
        <Map boundary={r.boundary} track={r.track_points} height={240} />

        <div className="spec-card">
          <div className="pilltabs">
            <button className={tab === OVERVIEW_TAB ? "active" : ""} onClick={() => setTab(OVERVIEW_TAB)}>{t("Overview")}</button>
            <button className={tab === MACHINE_TAB ? "active" : ""} onClick={() => setTab(MACHINE_TAB)}>{t("Machine")}</button>
          </div>
          <div className="spec-grid">
            {(tab === OVERVIEW_TAB ? overviewFields : machineFields).map(([lbl, val]) => (
              <div className="spec-row" key={lbl}>
                <div className="lbl">{lbl}</div>
                <div className="val">{val}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label mb-1">{t("Payment status")}</div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--rule)] bg-white p-3">
            <span className="text-lg font-semibold">{fmtMoney(Number(r.service_charge), r.currency)}</span>
            <div className="flex gap-2">
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  r.payment_status === "unpaid" ? "bg-[var(--ink)] text-white" : "border border-[var(--rule)]"
                }`}
                onClick={() => r.payment_status !== "unpaid" && onTogglePaid()}
              >{t("Unpaid")}</button>
              <button
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  r.payment_status === "paid" ? "bg-[var(--ink)] text-white" : "border border-[var(--rule)]"
                }`}
                onClick={() => r.payment_status !== "paid" && onTogglePaid()}
              >{t("Paid")}</button>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            {r.work_area_units ?? "—"} {r.unit_label} × {fmtMoney(Number(r.price_per_unit ?? 0), r.currency)}
          </p>
        </div>


      </div>

      <div className="ov-footer">
        <button onClick={onClose} className="btn btn-primary w-full">{t("Close")}</button>
      </div>
    </div>
  );
}

// version 3's Create/Review Work Report: map of the one field → Overview /
// Machine pill-tabs of derived numbers → Payment Status → Edit / Approve.
// No day-picker, no list of candidate sessions — v3 has neither; Select
// Area's tap is the only place a field gets chosen, and by the time we get
// here /api/reports/preview has already computed the real numbers directly
// from that exact field + trajectory. This screen just displays them — it
// never re-derives "which field" by matching against a separately-fetched
// suggestion list.
function CreateReport({ onClose, onCreated, onViewExisting }) {
  const t = useT();
  const [status, setStatus] = useState("loading"); // loading | notfound | reviewing
  const [chosen, setChosen] = useState(null);
  // Seeded from the community rather than assumed to be Thailand.
  // Seeded from the community, not assumed to be Thailand. Both are then
  // overwritten by the preview's own answer, which is what the report freezes.
  const { areaUnit: communityUnit, currency: communityCurrency } = useUnits();
  const [unit, setUnit] = useState(communityUnit);
  const [currency, setCurrency] = useState(communityCurrency);
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const [tab, setTab] = useState(OVERVIEW_TAB);
  const [paymentStatus, setPaymentStatus] = useState("unpaid");
  const [implement, setImplement] = useState(null);
  const [implementCatalog, setImplementCatalog] = useState([]);
  const [implementBusy, setImplementBusy] = useState(false);
  // Overrides the calculated charge — this is an assist tool, not a payment
  // controller; the contractor can round up, give a discount, or add extra
  // for a harder field without fighting the calculator. Null until touched.
  const [chargeOverride, setChargeOverride] = useState(null);
  const [matchInfo, setMatchInfo] = useState(null); // {farmerId, farmerName, workOrderId}
  const [editing, setEditing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  // Dev-mode React double-invokes effects — reading sessionStorage is
  // destructive (it must be cleared so re-opening this route later doesn't
  // replay a stale computed report), so the read itself is guarded to happen
  // exactly once per mount.
  const pendingRef = useRef(undefined);

  useEffect(() => {
    if (pendingRef.current === undefined) {
      const raw = sessionStorage.getItem("pendingReport");
      sessionStorage.removeItem("pendingReport");
      pendingRef.current = raw ? JSON.parse(raw) : null;
    }
    const pending = pendingRef.current;
    const preview = pending?.preview;

    if (!preview) {
      setStatus("notfound");
      return;
    }

    // This exact field/machine/window has already been reported (no report
    // is ever edited after approval — version 2 §15.5) — show the farmer's
    // own frozen report rather than a dead-end "nothing to review" message.
    if (preview.reportId) {
      onViewExisting(preview.reportId);
      return;
    }

    setUnit(preview.unit);
    setCurrency(preview.currency);
    setServices(preview.services || []);
    setChosen(preview);
    setServiceId(preview.service?.id || preview.services?.[0]?.id || "");
    setMatchInfo({ farmerId: pending.farmerId, farmerName: pending.farmerName, workOrderId: pending.workOrderId });
    setStatus("reviewing");
  }, []);

  useEffect(() => {
    if (!chosen?.machineId) return;
    fetch(`/api/machines/${chosen.machineId}/implement`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setImplement)
      .catch(() => {});
  }, [chosen?.machineId]);

  useEffect(() => {
    fetch("/api/implements")
      .then((r) => (r.ok ? r.json() : []))
      .then(setImplementCatalog)
      .catch(() => {});
  }, []);

  const service = services.find((s) => s.id === serviceId) || null;
  const calculatedCharge =
    service && chosen?.workAreaUnits != null ? Math.round(chosen.workAreaUnits * service.price) : null;
  const charge = chargeOverride ?? calculatedCharge;

  // The implement actually used affects the area calculation directly — a
  // one-off correction for this report (see withWidth's comment), not a
  // change to the machine's stored Settings assignment.
  async function chooseImplement(impl) {
    setImplement(impl);
    setImplementBusy(true);
    setError("");
    try {
      const recomputed = await withWidth(chosen, Number(impl.width_m), serviceId);
      setChosen(recomputed);
    } catch (e) {
      setError(e.message);
    } finally {
      setImplementBusy(false);
    }
  }

  async function approve() {
    setApproving(true);
    setError("");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cropzoneId: chosen.cropzoneId,
          machineId: chosen.machineId,
          machineName: chosen.machineName,
          fieldName: chosen.fieldName,
          boundary: chosen.boundary,
          trackPoints: chosen.trackPoints,
          startedAt: chosen.startedAt,
          endedAt: chosen.endedAt,
          widthM: chosen.widthM,
          serviceId: serviceId || null,
          farmerId: matchInfo?.farmerId || null,
          workOrderId: matchInfo?.workOrderId || null,
          paymentStatus,
          fieldAreaM2: chosen.work?.fieldAreaM2,
          fieldAreaUnits: chosen.fieldAreaUnits,
          workAreaM2: chosen.work?.workAreaM2,
          percentWorked: chosen.work?.percentWorked,
          insideDistanceM: chosen.work?.insideDistanceM,
          hours: chosen.work?.hours,
          workAreaUnits: chosen.workAreaUnits,
          pricePerUnit: service?.price ?? null,
          serviceCharge: charge,
          fuelLPerKm: chosen.fuelLPerKm,
          fuelL: chosen.fuelL,
          emissionKgPerL: chosen.emissionKgPerL,
          emissionsKg: chosen.emissionsKg,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || t("Could not approve this report."));
        setApproving(false);
        return;
      }
      setDone(body);
      onCreated();
    } catch {
      setError(t("Could not approve this report."));
    } finally {
      setApproving(false);
    }
  }

  const overviewFields = chosen && [
    [t("Farmer Name"), done?.report?.farmer?.name || matchInfo?.farmerName || t("Unassigned")],
    [t("Work Type"), service?.name || chosen.detectedService || "—"],
    [t("Total Hours"), chosen.work?.hours != null ? `${chosen.work.hours} hr` : "—"],
    [t("Start Time"), fmtTime(chosen.startedAt)],
    [t("Stop Time"), fmtTime(chosen.endedAt)],
    [t("Crop Area"), `${chosen.fieldAreaUnits ?? "—"} ${unit}`],
    [t("Work Area"), `${chosen.workAreaUnits ?? "—"} ${unit}`],
    ["% Work Area", `${chosen.work?.percentWorked ?? "—"}%`],
  ];

  const machineFields = chosen && [
    [t("Machine Name"), chosen.machineName],
    [t("Implement Type"), implement?.name || "—"],
    [t("Implement Width"), chosen.widthM ? `${chosen.widthM} m` : "—"],
    [
      t("Total Distance"),
      chosen.work?.insideDistanceM != null
        ? `${(chosen.work.insideDistanceM / 1000).toFixed(2)} km`
        : "—",
    ],
    [t("Fuel Consumption"), chosen.fuelL != null ? `${chosen.fuelL} L` : "rate not set"],
    [t("Emissions"), chosen.emissionsKg != null ? `${chosen.emissionsKg} kg CO₂` : "—"],
  ];

  return (
    <div className="overlay">
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label={t("Back")}>
          ←
        </button>
        <span className="ov-title">{done ? t("Report approved") : t("Create Work Report")}</span>
      </div>

      <div className="ov-body">
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-sm text-[var(--text-sec)]">
            <span className="spinner" />{t("Loading…")}</div>
        )}

        {status === "notfound" && (
          <div className="card flex flex-col items-center gap-2 p-6 text-center">
            <span className="text-3xl">⚠️</span>
            <h3 className="text-base font-semibold">{t("Nothing to review here")}</h3>
            <p className="text-sm text-[var(--text-sec)]">
              This field may already have a report, or this page was opened directly instead of
              by tapping a field on the machine's map. Go back and tap a field to create one.
            </p>
          </div>
        )}

        {done && (
          <>
            <p className="text-sm">
              {done.matched
                ? t("Linked to the open work order for this field.")
                : "No work order existed for this field — one has been added to your notebook."}
            </p>
          </>
        )}

        {status === "reviewing" && !done && (
          <>
            <Map boundary={chosen.boundary} track={chosen.trackPoints} height={240} />

            {chosen.parts?.length > 1 && (
              <p className="rounded bg-black/5 p-2 text-xs text-[var(--text-sec)]">
                {chosen.parts.length} sittings on this field, combined into one job — work that
                stopped and resumed.
              </p>
            )}

            <div className="spec-card">
              <div className="pilltabs">
                <button className={tab === OVERVIEW_TAB ? "active" : ""} onClick={() => setTab(OVERVIEW_TAB)}>{t("Overview")}</button>
                <button className={tab === MACHINE_TAB ? "active" : ""} onClick={() => setTab(MACHINE_TAB)}>{t("Machine")}</button>
              </div>
              <div className="spec-grid">
                {(tab === OVERVIEW_TAB ? overviewFields : machineFields).map(([lbl, val]) => (
                  <div className="spec-row" key={lbl}>
                    <div className="lbl">{lbl}</div>
                    <div className="val">{val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="field-label mb-1">{t("Payment status")}</div>
              <div className="flex items-center justify-between rounded-xl border border-[var(--rule)] bg-white p-3">
                <span className="text-lg font-semibold">{fmtMoney(charge, currency)}</span>
                <div className="flex gap-2">
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      paymentStatus === "unpaid" ? "bg-[var(--ink)] text-white" : "border border-[var(--rule)]"
                    }`}
                    onClick={() => setPaymentStatus("unpaid")}
                  >{t("Unpaid")}</button>
                  <button
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      paymentStatus === "paid" ? "bg-[var(--ink)] text-white" : "border border-[var(--rule)]"
                    }`}
                    onClick={() => setPaymentStatus("paid")}
                  >{t("Paid")}</button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-tert)]">
                {chosen.workAreaUnits ?? "—"} {unit} × {fmtMoney(service?.price ?? 0, currency)}
                {chargeOverride != null && chargeOverride !== calculatedCharge && (
                  <>
                    {" "}
                    · adjusted from {fmtMoney(calculatedCharge, currency)}{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setChargeOverride(null)}
                    >
                      undo
                    </button>
                  </>
                )}
              </p>
            </div>


            {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>

      <div className="ov-footer">
        {done && (
          <button onClick={onClose} className="btn btn-primary w-full">{t("Done")}</button>
        )}
        {status === "reviewing" && !done && (
          <>
            <button className="btn btn-outline" onClick={() => setEditing(true)}>{t("Edit")}</button>
            <button disabled={approving} onClick={approve} className="flex-1 btn btn-primary">
              {approving ? t("Recording…") : t("Approve")}
            </button>
          </>
        )}
      </div>

      {editing && (
        <EditDetails
          services={services}
          serviceId={serviceId}
          onServiceChange={setServiceId}
          farmerName={matchInfo?.farmerName}
          onFarmerChosen={(farmer) => setMatchInfo((m) => ({ ...m, farmerId: farmer.id, farmerName: farmer.name }))}
          implement={implement}
          implementCatalog={implementCatalog}
          implementBusy={implementBusy}
          onImplementChosen={chooseImplement}
          charge={charge}
          currency={currency}
          onChargeChange={setChargeOverride}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// version 3's Edit menu only ever offers two things: Edit Field Boundary
// (redraw the polygon — not built yet, this rebuild's next real gap) and
// Edit Details (farmer, work type, service charge). Only the latter exists
// to edit here, so Edit opens straight into it rather than a one-item menu.
function EditDetails({
  services,
  serviceId,
  onServiceChange,
  farmerName,
  onFarmerChosen,
  implement,
  implementCatalog,
  implementBusy,
  onImplementChosen,
  charge,
  currency,
  onChargeChange,
  onClose,
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    fetch("/api/farmers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomers)
      .catch(() => {});
  }, []);

  const q = query.trim().toLowerCase();
  const hits = q ? customers.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5) : [];

  return (
    <div className="overlay" onClick={(e) => e.stopPropagation()}>
      <div className="ov-header">
        <button className="ov-back" onClick={onClose} aria-label={t("Back")}>
          ←
        </button>
        <span className="ov-title">{t("Edit Details")}</span>
      </div>
      <div className="ov-body">
        <div>
          <div className="field-label">{t("Farmer")}</div>
          <input
            className="field"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={farmerName || t("Search customer name…")}
          />
          {hits.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {hits.map((c) => (
                <button
                  key={c.id}
                  className="existing-hit"
                  onClick={() => {
                    onFarmerChosen(c);
                    setQuery("");
                    setCustomers([]);
                  }}
                >
                  <b>{c.name}</b>
                  <span>{c.phone || t("No phone")}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="field-label">{t("Work Type")}</div>
          <select value={serviceId} onChange={(e) => onServiceChange(e.target.value)} className="field w-full">
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            Changes the service charge; the measured area itself doesn&apos;t change.
          </p>
        </div>

        <div>
          <div className="field-label">{t("Implement")}</div>
          <select
            value={implement?.id || ""}
            disabled={implementBusy}
            onChange={(e) => {
              const found = implementCatalog.find((i) => i.id === e.target.value);
              if (found) onImplementChosen(found);
            }}
            className="field w-full disabled:opacity-60"
          >
            {!implement && <option value="">{t("No implement — telemetry width used")}</option>}
            {implementCatalog.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.width_m} m
              </option>
            ))}
          </select>
          {implementBusy && (
            <p className="mt-1 text-[11px] text-[var(--text-tert)]">{t("Recalculating…")}</p>
          )}
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            Only for this report — correct this if the physical implement was
            swapped without updating Settings. Recalculates the work area.
          </p>
        </div>

        <div>
          <div className="field-label">{t("Service Charge")}</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--text-sec)]">
              {moneySymbol(currency)}
            </span>
            <input
              type="number"
              className="field flex-1"
              value={charge ?? ""}
              onChange={(e) =>
                onChargeChange(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-tert)]">
            This is an assist tool, not a payment control — adjust up or down
            for a discount, a harder field, or simply to round the number.
          </p>
        </div>
      </div>
      <div className="ov-footer">
        <button className="btn btn-primary w-full" onClick={onClose}>{t("Done")}</button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Map from "@/components/Map";
import { polygonAreaM2 } from "@/lib/engine";
import { FULL_PAGE_MAP_HEIGHT } from "@/lib/mapHeight";

// Machine tab's "Select Area to Create Report" + "Draw Field Boundary"
// (version 3 §2d-2f), on real data: tap the map — inside a known field hands
// off into the existing, proven date-based report flow; anywhere else offers
// to draw the field's boundary for real, writing a real AgroAPI
// Farm→Field→Cropzone before handing off the same way. v3's fictional
// "auto-detect" toggle is left out — it was explicitly a placeholder for a
// future real model, not something drawing a fake box would improve on.
export default function SelectArea({ machine, points, day, since, until, initialView, onClose }) {
  const router = useRouter();
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportedBoundaries, setReportedBoundaries] = useState(new Set());
  const [mode, setMode] = useState("pick"); // pick | notfound | draw | farmer | match | done
  const [drawPoints, setDrawPoints] = useState([]);
  const [fieldName, setFieldName] = useState("");

  const [matchField, setMatchField] = useState(null);
  const [matchOwner, setMatchOwner] = useState(null);
  const [matchCandidates, setMatchCandidates] = useState([]);
  const [matching, setMatching] = useState(false);

  const [farmerStep, setFarmerStep] = useState("search");
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState([]);
  const [chosenFarmer, setChosenFarmer] = useState(null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  // Center of the map — the fields fetch is scoped to real distance from
  // this point (AgroAPI's own farms#index sort_by=distance, verified live)
  // rather than pulling all 100+ farms in the org and filtering
  // client-side, which is what made this screen slow to open.
  //
  // Prefer the exact view the Trajectory map already settled on
  // (initialView, carried over so this map doesn't visibly re-fit either —
  // see below) over a plain average of every GPS point: a route that
  // transits along a road between two field clusters averages to a point
  // on the road, near neither cluster. The map's own fitted center is
  // where the trajectory actually visually sits.
  useEffect(() => {
    if (!points.length && !initialView) {
      setLoading(false);
      return;
    }
    let lat, lng;
    if (initialView) {
      [lat, lng] = initialView.center;
    } else {
      lat = points.reduce((s, p) => s + p.coord[1], 0) / points.length;
      lng = points.reduce((s, p) => s + p.coord[0], 0) / points.length;
    }
    fetch(`/api/agroapi/fields?lat=${lat}&lng=${lng}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setFields)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Version 3's green/purple field distinction — "no report yet" vs
  // "already reported" — sourced directly from our own frozen `work_reports`
  // rows (matched back to these fields by boundary, since a report is keyed
  // by cropzone/machine, not by AgroAPI field id) rather than asking
  // AgroAPI's `bookings/suggested` to separately re-detect today's work.
  // Once reported, a field stays reported — there's no date to scope this
  // to, unlike the old per-day suggestion check.
  useEffect(() => {
    fetch("/api/reports/boundaries")
      .then((r) => (r.ok ? r.json() : []))
      .then((boundaries) => {
        setReportedBoundaries(new Set((boundaries || []).map((b) => JSON.stringify(b))));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "farmer") return;
    fetch("/api/farmers")
      .then((r) => (r.ok ? r.json() : []))
      .then(setCustomers)
      .catch(() => {});
  }, [mode]);

  // The server already scopes `fields` to real distance from the trajectory
  // (see the fetch above) — just annotate which ones are already reported.
  const nearbyFields = useMemo(
    () => fields.map((f) => ({ ...f, reported: reportedBoundaries.has(JSON.stringify(f.boundary)) })),
    [fields, reportedBoundaries]
  );

  // Match Work Order (version 2 §15.4, version 3's MC-10): this step's whole
  // job is deciding which order, if any, this field's work fulfills — NOT
  // creating the report itself. A field's owner is real (their AgroAPI farm),
  // but whether they have an open order for THIS job is never something we
  // should guess. `/api/reports` used to auto-match by cropzone id, but real
  // bookings (AddOrderForm) never set one — so that auto-match essentially
  // never fires, and every real job silently spawned a duplicate order
  // instead of closing the one the farmer actually booked. This is the fix:
  // ask, once, right here.
  //
  // A tapped field is never actually ownerless from the report's point of
  // view — but that owner is "Unassigned" (a real, deliberate
  // placeholder, /api/reports' own fallback) until a real survey links the
  // field to its real farmer. AgroAPI itself carries no per-field ownership
  // to look up (all locally-drawn fields share one AgroAPI farm; who can
  // access which field is tracked entirely in Supabase) — so a plain field
  // tap has no local owner to resolve yet, full stop, and always proceeds to
  // the placeholder. A field's real owner only becomes known once a report
  // or order for it explicitly names one (Draw Boundary's farmer step, or
  // future real survey work).
  async function checkMatch(field) {
    await checkMatchForOwner(field, null);
  }

  // Shared by "tap a known field" (no local owner to resolve — always null,
  // see above) and "just drew a new boundary" (owner already known — it's
  // who Case C's farmer step just picked) — same question either way: does
  // this farmer have an open order this job should close out?
  async function checkMatchForOwner(field, owner) {
    setMatching(true);
    try {
      if (owner) {
        const orders = await fetch("/api/orders").then((r) => (r.ok ? r.json() : []));
        const open = orders.filter(
          (o) => o.farmer_id === owner.id && !["completed", "declined"].includes(o.status)
        );
        if (open.length > 0) {
          setMatchField(field);
          setMatchOwner(owner);
          setMatchCandidates(open);
          setMode("match");
          return;
        }
      }
      await goToReport(field, { farmerId: owner?.id || null, farmerName: owner?.name || null, workOrderId: null });
    } finally {
      setMatching(false);
    }
  }

  // Compute the report directly from the field just tapped — no separate
  // "ask AgroAPI to re-detect the same work and hope it agrees" step. The
  // contractor already told us which field, once, by tapping it; that's the
  // real discovery step, already done. /api/reports/preview runs the same
  // real engine (trajectory clipped to this exact polygon, swept by implement
  // width) directly against the field and machine we already know, over the
  // same window already on screen — "coloring book" math, computed once,
  // here, not re-derived by matching boundary strings against a separately-
  // fetched suggestion list.
  async function goToReport(field, match) {
    setError("");
    if (!field) {
      router.push("/contractor/reports");
      return;
    }
    setBusy(true);
    try {
      const query = new URLSearchParams({
        fieldId: field.id,
        machineId: machine.id,
        machineName: machine.name || "",
        since: since || points[0]?.time || new Date().toISOString(),
        until: until || new Date().toISOString(),
      });
      const res = await fetch(`/api/reports/preview?${query}`);
      const preview = await res.json();
      if (!res.ok) {
        setError(preview.error || "Could not compute this report.");
        setBusy(false);
        return;
      }
      sessionStorage.setItem(
        "pendingReport",
        JSON.stringify({
          preview,
          farmerId: match?.farmerId ?? null,
          farmerName: match?.farmerName ?? null,
          workOrderId: match?.workOrderId ?? null,
        })
      );
      router.push("/contractor/reports?fromSelectArea=1");
    } catch {
      setError("Could not compute this report.");
      setBusy(false);
    }
  }

  function undoDraw() {
    setDrawPoints((pts) => pts.slice(0, -1));
  }

  const areaRai =
    drawPoints.length >= 3
      ? (polygonAreaM2(drawPoints.map((p) => [p.lng, p.lat])) / 1600).toFixed(2)
      : null;

  const q = query.trim().toLowerCase();
  const hits = q
    ? customers
        .filter((c) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q))
        .slice(0, 5)
    : [];

  async function createField() {
    setBusy(true);
    setError("");
    try {
      let farmerId = chosenFarmer?.id;
      let farmerName = chosenFarmer?.name;
      if (!farmerId) {
        const res = await fetch("/api/farmers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, phone: newPhone }),
        });
        if (!res.ok) throw new Error("Could not save this customer.");
        const data = await res.json();
        farmerId = data.id;
        farmerName = data.name;
      }

      const ring = drawPoints.map((p) => [p.lng, p.lat]);
      // AgroAPI wants a closed ring.
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0]);
      }

      const res = await fetch(`/api/farmers/${farmerId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fieldName.trim() || `${farmerName}'s Field`,
          boundary: [ring],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create this field.");
      setCreated({ ...data, boundary: [ring], farmerId, farmerName });
      setMode("done");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay">
      <div className="ov-header">
        <button
          className="ov-back"
          onClick={() => {
            if (mode === "pick") onClose();
            else if (mode === "notfound") setMode("pick");
            else if (mode === "draw") setMode("pick");
            else if (mode === "farmer") setMode("draw");
            else if (mode === "match") setMode("pick");
            else onClose();
          }}
        >
          ←
        </button>
        <span className="ov-title">
          {mode === "pick" && "Select Area to Create Report"}
          {mode === "notfound" && "Create Work Report"}
          {mode === "draw" && "Draw Field Boundary"}
          {mode === "farmer" && "Farmer's Name"}
          {mode === "match" && "Match Work Order"}
          {mode === "done" && "Field Created"}
        </span>
      </div>

      <div className="ov-body">
        {mode === "pick" && (
          <>
            <div className="fieldset-note">
              Tap the map — inside a field, or anywhere else if none match.
            </div>
            {nearbyFields.length > 0 && (
              <div className="flex items-center gap-4 text-xs text-[var(--text-sec)]">
                <span>
                  <span
                    className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: "#4ade80" }}
                  />
                  No report yet
                </span>
                <span>
                  <span
                    className="mr-1 inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: "#c084fc" }}
                  />
                  Already reported
                </span>
              </div>
            )}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            {(loading || matching) ? (
              <p className="text-sm text-[var(--text-sec)]">
                {matching ? "Checking for an open order…" : "Loading fields…"}
              </p>
            ) : (
              <Map
                track={points}
                fields={nearbyFields}
                onFieldTap={(fieldId) => {
                  const field = nearbyFields.find((f) => f.id === fieldId);
                  if (field) checkMatch(field);
                }}
                onMapClick={() => setMode("notfound")}
                height={FULL_PAGE_MAP_HEIGHT}
                initialView={initialView}
              />
            )}
          </>
        )}

        {mode === "notfound" && (
          <div className="card flex flex-col items-center gap-2 p-6 text-center">
            <span className="text-3xl">⚠️</span>
            <h2 className="text-base font-semibold">Field Boundary Not Found</h2>
            <p className="text-sm text-[var(--text-sec)]">
              Draw the field boundary to create a report.
            </p>
          </div>
        )}

        {mode === "draw" && (
          <>
            <div className="fieldset-note">
              Tap to place each corner of the field, in order. Undo the last
              point if you tap wrong; confirm once you have at least 3.
            </div>
            <Map
              track={points}
              drawPoints={drawPoints}
              onMapClick={(p) => setDrawPoints((pts) => [...pts, p])}
              height={FULL_PAGE_MAP_HEIGHT}
            />
            <div className="flex items-center justify-between text-sm">
              <button
                className="text-xs text-[var(--text-sec)] underline disabled:opacity-40"
                onClick={undoDraw}
                disabled={drawPoints.length === 0}
              >
                ↺ Undo
              </button>
              {areaRai && <span className="text-xs text-[var(--text-tert)]">Area: {areaRai} rai</span>}
            </div>
          </>
        )}

        {mode === "farmer" && (
          <>
            {farmerStep === "search" && (
              <>
                <div className="field-label">Search customer name or phone</div>
                <input
                  className="field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Start typing…"
                  autoFocus
                />
                {q && (
                  <div className="mt-2 flex flex-col gap-2.5">
                    <div className="flex flex-col gap-2">
                      {hits.map((c) => (
                        <button
                          key={c.id}
                          className="existing-hit"
                          onClick={() => {
                            setChosenFarmer(c);
                            setFarmerStep("selected");
                          }}
                        >
                          <b>{c.name}</b>
                          <span>{c.phone || "No phone"}</span>
                        </button>
                      ))}
                    </div>
                    <div className="text-center text-[11px] text-[var(--text-tert)]">OR</div>
                    <button
                      className="fieldset-note w-full text-center"
                      style={{ border: "1.5px dashed var(--rule)" }}
                      onClick={() => {
                        setNewName(query);
                        setNewPhone("");
                        setChosenFarmer(null);
                        setFarmerStep("new");
                      }}
                    >
                      No match found? Add &quot;{query}&quot; as a new customer.
                    </button>
                  </div>
                )}
              </>
            )}

            {farmerStep === "selected" && (
              <>
                <div className="flex items-center justify-between">
                  <div className="field-label mb-0">Customer</div>
                  <button
                    className="text-xs font-bold"
                    onClick={() => {
                      setFarmerStep("search");
                      setQuery("");
                      setChosenFarmer(null);
                    }}
                  >
                    Change
                  </button>
                </div>
                <div className="choice-card selected" style={{ cursor: "default" }}>
                  <div className="icon">👤</div>
                  <div className="txt">
                    <b>{chosenFarmer.name}</b>
                    <span>{chosenFarmer.phone || "No phone on file"}</span>
                  </div>
                </div>
              </>
            )}

            {farmerStep === "new" && (
              <>
                <div className="flex items-center justify-between">
                  <div className="field-label mb-0">New customer details</div>
                  <button
                    className="text-xs font-bold"
                    onClick={() => setFarmerStep("search")}
                  >
                    Change
                  </button>
                </div>
                <input
                  className="field"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Full name"
                />
                <input
                  className="field"
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone number"
                />
              </>
            )}

            {farmerStep !== "search" && (
              <div className="mt-2">
                <div className="field-label">Field name</div>
                <input
                  className="field"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder={`${chosenFarmer?.name || newName || "Customer"}'s Field`}
                />
              </div>
            )}

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </>
        )}

        {mode === "match" && (
          <>
            <div className="fieldset-note">
              {matchOwner?.name} has {matchCandidates.length} open order
              {matchCandidates.length > 1 ? "s" : ""} — is this job one of them?
            </div>
            <div className="flex flex-col gap-2">
              {matchCandidates.map((o) => (
                <button
                  key={o.id}
                  className="choice-card"
                  onClick={() =>
                    goToReport(matchField, {
                      farmerId: matchOwner.id,
                      farmerName: matchOwner.name,
                      workOrderId: o.id,
                    })
                  }
                >
                  <div className="icon">📋</div>
                  <div className="txt">
                    <b>{o.activity_type_name || "Job"}</b>
                    <span>
                      {o.scheduled_date
                        ? new Date(o.scheduled_date).toLocaleDateString([], {
                            day: "numeric",
                            month: "short",
                          })
                        : "No date"}
                      {" · "}
                      {o.crop_size_rai ?? "?"} rai · {o.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {mode === "done" && (
          <>
            <div className="detail-card">
              <div className="detail-row">
                <div className="lbl">Field</div>
                <div className="val">Created in AgroAPI</div>
              </div>
              {created?.cropzoneId && (
                <div className="detail-row">
                  <div className="lbl">Cropzone</div>
                  <div className="val">Ready</div>
                </div>
              )}
            </div>
            <p className="text-sm text-[var(--text-sec)]">
              A real field now exists for this customer. AgroAPI&apos;s own
              work detection may take a little while to pick up a brand-new
              field — if it isn&apos;t offered on the next screen yet, it
              should be shortly.
            </p>
          </>
        )}
      </div>

      <div className="ov-footer">
        {mode === "notfound" && (
          <>
            <button className="btn btn-outline flex-1" onClick={() => setMode("pick")}>
              Cancel
            </button>
            <button className="btn btn-go flex-1" onClick={() => setMode("draw")}>
              Draw Field Boundary
            </button>
          </>
        )}
        {mode === "draw" && (
          <button
            className="btn btn-go w-full"
            disabled={drawPoints.length < 3}
            onClick={() => setMode("farmer")}
          >
            ✓ Confirm Boundary ({drawPoints.length} pts)
          </button>
        )}
        {mode === "farmer" && farmerStep !== "search" && (
          <button className="btn btn-go w-full" disabled={busy} onClick={createField}>
            {busy ? "Creating…" : "Create Field"}
          </button>
        )}
        {mode === "match" && (
          <button
            className="btn btn-outline w-full"
            onClick={() =>
              goToReport(matchField, {
                farmerId: matchOwner.id,
                farmerName: matchOwner.name,
                workOrderId: null,
              })
            }
          >
            No matching order — create new
          </button>
        )}
        {mode === "done" && (
          <button
            className="btn btn-go w-full"
            disabled={matching}
            onClick={() =>
              checkMatchForOwner(
                { id: created?.fieldId, boundary: created?.boundary },
                created?.farmerId ? { id: created.farmerId, name: created.farmerName } : null
              )
            }
          >
            {matching ? "Checking…" : "Continue to Report →"}
          </button>
        )}
      </div>
    </div>
  );
}

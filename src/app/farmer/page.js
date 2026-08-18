"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RequestService from "@/components/RequestService";
import AddFieldFlow from "@/components/AddFieldFlow";
import FieldThumb from "@/components/FieldThumb";
import { cropLabel } from "@/lib/crop";

// My Fields — one list of every plot.
//
// Version 3 §7.7 split this into No Active Crop / Active Crops tabs, but that
// split only earns its place once the crop lifecycle is actually designed —
// planting, harvest, season rollover. Until then two tabs just hide half the
// farmer's land behind a distinction the app can't act on. Each card still
// says where its crop stands, which is the useful part.


function fmtDate(iso) {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
}

// Why this field sits where it does. "Unspecified" is AgroAPI's placeholder for
// a planting whose crop nobody recorded — still a real crop in the ground.
function cropStatus(f) {
  const crop = cropLabel({ name: f.crop, variety: f.cropVariety });
  if (f.hasActiveCrop) {
    return f.daysAfterPlanting != null
      ? `${crop} · day ${f.daysAfterPlanting}`
      : crop;
  }
  if (f.harvestingDate) return "Harvested";
  if (f.endDate && new Date(f.endDate) < new Date()) return "Season ended";
  return "No Active Crop";
}

export default function MyFieldsTab() {
  const [data, setData] = useState(null);
  const [services, setServices] = useState([]);
  const [requesting, setRequesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/my/fields", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("Could not load your fields."));
    fetch("/api/services")
      .then((r) => (r.ok ? r.json() : []))
      .then((s) =>
        setServices(
          (s || []).map((x) => ({
            id: x.id,
            name: x.name,
            price: Number(x.price_per_unit),
          }))
        )
      )
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  const unit = data?.organization.areaUnit ?? "rai";
  const fields = (data?.fields || []).map((f) => ({
    ...f,
    areaUnits:
      f.areaM2 != null && data
        ? Number((f.areaM2 / data.organization.areaUnitM2).toFixed(1))
        : null,
  }));


  return (
    <>
      <div className="my-3 flex items-center justify-between gap-2">
        <h1 className="text-base font-bold">My Fields</h1>
        <button
          className="pill"
          onClick={() => setRequesting(true)}
          disabled={fields.length === 0}
        >
          Request Contractor
        </button>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {!data && !error && <p className="empty-msg">Loading…</p>}

      {data && (
        <>
          <div className="flex flex-col gap-2">
            {fields.length === 0 && (
              <p className="empty-msg">No plots registered to you yet.</p>
            )}

            {fields.map((f) => (
              <div key={f.fieldId} className="card p-3">
                <div className="flex items-start gap-3">
                  <FieldThumb boundary={f.boundary} />
                  <div className="min-w-0">
                    <p className="font-bold">{f.name}</p>
                    <p className="text-xs text-[var(--text-sec)]">
                      {f.areaUnits ?? "—"} {unit}
                    </p>
                    <p className="text-xs text-[var(--text-sec)]">
                      {f.plantingDate
                        ? `Planting Date: ${fmtDate(f.plantingDate)}`
                        : "Not planted yet"}
                    </p>
                    <p className="text-xs text-[var(--text-tert)]">{cropStatus(f)}</p>
                  </div>
                </div>
                <Link
                  href={`/farmer/field/${f.cropzoneId || f.fieldId}`}
                  className="btn btn-outline mt-3 block w-full text-center"
                >
                  View Field
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Version 3 puts + Add Field at the bottom of the list, after the
          plots, rather than competing with them at the top. */}
      {data && (
        <button className="btn btn-go mt-4 w-full" onClick={() => setAdding(true)}>
          + Add Field
        </button>
      )}

      {adding && (
        <AddFieldFlow
          unit={unit}
          unitM2={data?.organization.areaUnitM2 || 1600}
          onClose={() => setAdding(false)}
          onCreated={load}
        />
      )}

      {requesting && (
        <RequestService
          fields={fields}
          services={services}
          unit={unit}
          onClose={() => setRequesting(false)}
          onSent={load}
        />
      )}
    </>
  );
}

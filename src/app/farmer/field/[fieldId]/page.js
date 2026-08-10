"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createOrder } from "@/lib/store";

function toRai(areaM2) {
  return (areaM2 / 1600).toFixed(1);
}

export default function FieldActivitiesPage({ params }) {
  const { fieldId: cropzoneId } = use(params);
  const router = useRouter();

  const [cropzone, setCropzone] = useState(null);
  const [history, setHistory] = useState(null);
  const [activityTypes, setActivityTypes] = useState(null);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activityTypeId, setActivityTypeId] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [czRes, historyRes, typesRes] = await Promise.all([
          fetch(`/api/agroapi/cropzones/${cropzoneId}`).then((r) => r.json()),
          fetch(`/api/agroapi/cropzones/${cropzoneId}/activities`).then((r) => r.json()),
          fetch(`/api/agroapi/activity-types`).then((r) => r.json()),
        ]);
        setCropzone(czRes);
        setHistory(historyRes);
        setActivityTypes(typesRes);
      } catch {
        setError("Could not load this field from AgroAPI.");
      }
    })();
  }, [cropzoneId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const type = activityTypes.find((t) => t.id === activityTypeId);
    if (!type) return;

    await createOrder({
      fieldId: cropzone.field?.id || cropzone.field_id,
      cropzoneId: cropzone.id,
      fieldName: cropzone.field?.name || cropzone.name,
      activityTypeId: type.id,
      activityTypeName: type.name,
      requestedDate: date,
    });

    setAdding(false);
    setActivityTypeId("");
    setSent(true);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!cropzone || !history || !activityTypes) {
    return <p className="text-sm text-black/60">Loading…</p>;
  }

  return (
    <>
      <Link href="/farmer" className="mb-4 inline-block text-sm text-black/50">
        ← Back to Fields
      </Link>
      <h1 className="mb-1 text-lg font-semibold">
        {cropzone.field?.name || cropzone.name}
      </h1>
      <p className="mb-6 text-sm text-black/50">{toRai(cropzone.area)} rai</p>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black/70">
          Activity history
        </h2>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setSent(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-lg leading-none text-white"
            aria-label="Add activity"
          >
            +
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 flex flex-col gap-2 rounded border border-black/10 p-3"
        >
          <label className="text-xs text-black/50">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="rounded border border-black/20 px-2 py-1.5 text-sm"
          />
          <label className="text-xs text-black/50">Activity</label>
          <select
            value={activityTypeId}
            onChange={(e) => setActivityTypeId(e.target.value)}
            required
            className="rounded border border-black/20 px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Select an activity…
            </option>
            {activityTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="mt-1 flex gap-2">
            <button
              type="submit"
              className="rounded bg-black px-3 py-1.5 text-xs text-white"
            >
              Request Machine Order
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-xs text-black/40"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sent && (
        <p className="mb-4 text-xs text-green-700">
          Request sent —{" "}
          <button onClick={() => router.push("/farmer/orders")} className="underline">
            view in Work Orders
          </button>
        </p>
      )}

      {history.length === 0 && (
        <p className="text-sm text-black/50">No activities recorded yet.</p>
      )}
      <ul className="flex flex-col gap-2">
        {history.map((a) => (
          <li key={a.id} className="rounded border border-black/10 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.activity_type?.name}</span>
              <span className="text-xs text-black/40">
                {a.start_date?.slice(0, 10)}
              </span>
            </div>
            {a.note && <p className="mt-1 text-black/60">{a.note}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

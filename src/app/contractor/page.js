"use client";

import { useEffect, useMemo, useState } from "react";
import { useContractorOrders } from "@/lib/ContractorOrdersContext";
import OrderCard, { daysLate } from "@/components/OrderCard";
import AddOrderForm from "@/components/AddOrderForm";
import OrderCalendar from "@/components/OrderCalendar";
import FrozenHeaderScroll from "@/components/FrozenHeaderScroll";
import Map from "@/components/Map";
import { haversineKm } from "@/lib/track";

const VIEWS = [
  { key: "list", label: "List" },
  { key: "calendar", label: "Calendar" },
  { key: "today", label: "Today's Work" },
];

function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

// Routes the mapped, on-time jobs by always stepping to whichever remaining
// stop is closest to wherever the route currently is — starting from home.
// Delayed jobs are handled separately (always first, per version 3) so they
// never get folded into this straight-line ordering.
function nearestNeighborOrder(home, jobs) {
  const remaining = [...jobs];
  const route = [];
  let current = [home.lng, home.lat];
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((o, i) => {
      const d = haversineKm(current, [o.location_lng, o.location_lat]);
      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    });
    const [next] = remaining.splice(bestIndex, 1);
    route.push(next);
    current = [next.location_lng, next.location_lat];
  }
  return route;
}

export default function BookingTab() {
  const { orders, refresh, services, openOrder } = useContractorOrders();
  const [view, setView] = useState("list");
  const [adding, setAdding] = useState(false);
  const [day, setDay] = useState(null);
  const [search, setSearch] = useState("");
  const [homeBase, setHomeBase] = useState(null);

  useEffect(() => {
    fetch("/api/contractor-profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => {
        if (p?.homeLat != null && p?.homeLng != null) {
          setHomeBase({ lat: p.homeLat, lng: p.homeLng });
        }
      })
      .catch(() => {});
  }, []);

  // List keeps notebook order — most recently written down first — and is
  // deliberately NOT re-sorted by urgency (version 2 §8.4). Late jobs still
  // show their flag, they just stay where they were written.
  const listOrders = useMemo(
    () => orders.filter((o) => o.status !== "pending" && o.status !== "declined"),
    [orders]
  );

  // Search filters by customer name only — that's how a contractor looks
  // something up (version 2 §8.1).
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return listOrders;
    return listOrders.filter((o) =>
      (o.farmer?.name || "").toLowerCase().includes(q)
    );
  }, [listOrders, search]);

  const dayOrders = useMemo(
    () => (day ? listOrders.filter((o) => o.scheduled_date === day) : null),
    [listOrders, day]
  );

  // Delayed jobs first (most-late-first), then the on-time mapped jobs
  // routed nearest-neighbor from home base, then anything on-time but with
  // no location to route by — version 3's "suggested order" for Today's Work.
  const { delayedToday, routedToday, unmappedToday } = useMemo(() => {
    const t = todayISO();
    const openToday = listOrders.filter(
      (o) => o.status === "booked" && o.scheduled_date && o.scheduled_date <= t
    );
    const delayed = openToday
      .filter((o) => daysLate(o) > 0)
      .sort((a, b) => daysLate(b) - daysLate(a));
    const onTime = openToday.filter((o) => daysLate(o) === 0);
    const mapped = onTime.filter((o) => o.location_lat != null && o.location_lng != null);
    const unmapped = onTime.filter((o) => o.location_lat == null || o.location_lng == null);
    const routed = homeBase && mapped.length ? nearestNeighborOrder(homeBase, mapped) : mapped;
    return { delayedToday: delayed, routedToday: routed, unmappedToday: unmapped };
  }, [listOrders, homeBase]);

  const todayMarkers = useMemo(() => {
    const stops = routedToday.map((o, i) => ({
      lat: o.location_lat,
      lng: o.location_lng,
      label: i + 1,
    }));
    return homeBase ? [{ ...homeBase, home: true }, ...stops] : stops;
  }, [routedToday, homeBase]);

  const header = (
    <>
      <div className="subtabs my-3">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            className={`subtab-btn ${view === v.key ? "active" : ""}`}
            onClick={() => {
              setView(v.key);
              setDay(null);
            }}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "list" && (
        <div className="flex gap-2">
          <div className="search-pill">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-3.5 w-3.5 shrink-0 text-[var(--text-sec)]"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name"
            />
          </div>
          <button className="add-btn" onClick={() => setAdding(true)}>
            + Add
          </button>
        </div>
      )}

      {view === "calendar" && (
        <>
          <OrderCalendar orders={listOrders} selected={day} onSelect={setDay} />
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {day &&
                new Date(`${day}T00:00:00`).toLocaleDateString([], {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
            </p>
            <button className="add-btn py-1.5" onClick={() => setAdding(true)}>
              + Add
            </button>
          </div>
        </>
      )}

      {view === "today" && todayMarkers.length > 0 && (
        <Map markers={todayMarkers} height={200} />
      )}
      {view === "today" &&
        (delayedToday.length > 0 || routedToday.length > 0 || unmappedToday.length > 0) && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-[var(--text-tert)]">
              Suggested order — delayed jobs first, then closest to home.
            </p>
            {unmappedToday.length > 0 && (
              <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-tert">
                {unmappedToday.length} unmapped
              </span>
            )}
          </div>
        )}
    </>
  );

  return (
    <>
      <FrozenHeaderScroll header={header}>
        {view === "list" && (
          <div className="flex flex-col gap-2">
            {searched.length === 0 && (
              <p className="empty-msg">
                {search
                  ? "No customer by that name."
                  : "Nothing written down yet. Tap + Add after a customer calls."}
              </p>
            )}
            {searched.map((o) => (
              <OrderCard key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
          </div>
        )}

        {view === "calendar" && (
          <div className="flex flex-col gap-2">
            {day && dayOrders?.length === 0 && (
              <p className="empty-msg">Nothing scheduled that day.</p>
            )}
            {(dayOrders || []).map((o) => (
              <OrderCard key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
          </div>
        )}

        {/* Today's Work has no + Add of its own — anything added elsewhere
            for today shows up here, since it's the same data filtered. */}
        {view === "today" && (
          <div className="flex flex-col gap-2">
            {delayedToday.length + routedToday.length + unmappedToday.length === 0 && (
              <p className="empty-msg">Nothing due today.</p>
            )}

            {delayedToday.map((o) => (
              <OrderCard key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
            {routedToday.map((o, i) => (
              <OrderCard key={o.id} order={o} index={i + 1} onClick={() => openOrder(o)} />
            ))}
            {unmappedToday.map((o) => (
              <OrderCard key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
          </div>
        )}
      </FrozenHeaderScroll>

      {adding && (
        <AddOrderForm
          services={services}
          onClose={() => setAdding(false)}
          onCreated={refresh}
        />
      )}
    </>
  );
}

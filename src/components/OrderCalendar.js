"use client";

import { useState } from "react";
import { daysLate } from "@/components/OrderCard";

// Month grid showing where the workload sits. Version 3: each day carries a
// small pill badge with its job count — colored red if anything that day is
// delayed, grey if everything is done, green otherwise — rather than tinting
// the whole cell, so the day number itself always stays legible.
export default function OrderCalendar({ orders, selected, onSelect }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();

  const byDay = new Map();
  for (const o of orders) {
    if (!o.scheduled_date) continue;
    const list = byDay.get(o.scheduled_date) || [];
    list.push(o);
    byDay.set(o.scheduled_date, list);
  }

  function iso(day) {
    return `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function badgeClass(list, isSelected) {
    if (isSelected) return "bg-white text-ink";
    if (list.some((o) => daysLate(o) > 0)) return "bg-danger-light text-danger";
    if (list.every((o) => o.status === "completed")) return "bg-surface text-tert";
    return "bg-green-light text-green-dark";
  }

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setMonth(new Date(year, m - 1, 1))}
          className="px-2 text-sm text-[var(--text-sec)]"
        >
          ←
        </button>
        <p className="text-sm font-medium">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setMonth(new Date(year, m + 1, 1))}
          className="px-2 text-sm text-[var(--text-sec)]"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-[var(--text-tert)]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const key = iso(day);
          const list = byDay.get(key);
          const isSelected = selected === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(isSelected ? null : key)}
              className={`flex aspect-[10/7] flex-col items-center justify-center gap-0.5 overflow-hidden rounded text-xs leading-none ${
                isSelected ? "bg-[var(--ink)] text-white" : "text-[var(--ink)]"
              }`}
            >
              <span className="leading-none">{day}</span>
              {list && (
                <span
                  className={`rounded-full px-1.5 text-[8.5px] font-bold leading-[1.2] ${badgeClass(
                    list,
                    isSelected
                  )}`}
                >
                  {list.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

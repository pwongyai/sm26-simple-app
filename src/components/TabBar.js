"use client";

import Link from "next/link";

// Version 3's bottom tab bar. Nothing about a web app prevents this — it's
// where a thumb reaches on a phone, and it's the navigation the team already
// reviewed.

const ICONS = {
  book: (
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 22H20v-5M4 19.5V5a2 2 0 012-2h14v14" />
  ),
  machine: (
    <>
      <circle cx="7" cy="17" r="3" />
      <circle cx="18" cy="17" r="2" />
      <path d="M4 17V7h6l3 5h5v5" />
    </>
  ),
  report: (
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 15h6M9 11h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </>
  ),
  field: (
    <>
      <path d="M2 20h20M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-5h6v5" />
    </>
  ),
  request: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </>
  ),
  weather: (
    <>
      <path d="M17.5 19a4.5 4.5 0 100-9 6 6 0 10-11.6 2" />
      <path d="M5 19h12.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
};

export default function TabBar({ tabs, active }) {
  return (
    <nav className="tabbar">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={active === t.key ? "active" : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[t.icon]}
          </svg>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// Shared full-page map sizing — grows with available viewport space instead
// of a flat px value (a flat 440px pushed footer buttons off-screen on a
// short/desktop-window browser; see contractor/machines/[machineId]/page.js
// and the h-dvh + overflow-y-auto fix in contractor/layout.js for the full
// story). 300px is roughly everything else on a full-page map screen
// (header, title, pill/range chips, margins, footer buttons) — the map gets
// whatever's left, bounded so it's never cramped on a tall phone or
// oversized on a short one.
export const FULL_PAGE_MAP_HEIGHT = "clamp(220px, calc(100vh - 300px), 400px)";

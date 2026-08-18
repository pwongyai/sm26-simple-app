// The field's own outline, small. Version 3 used a generic crosshatch tile
// here; drawing the real polygon costs nothing (the boundary is already in the
// payload) and makes one plot recognisable from another at a glance.
export default function FieldThumb({ boundary, size = 44 }) {
  const ring = boundary?.[0];

  // No geometry recorded — fall back to v3's crosshatch placeholder.
  if (!ring?.length) return <div className="field-thumb" style={{ width: size, height: size }} />;

  const lats = ring.map((c) => c[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);

  const xs = ring.map((c) => c[0] * kx);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const pad = 0.14;

  // Keep the plot's real proportions rather than stretching it to fill the box.
  const scale = Math.min(
    (1 - 2 * pad) / spanX,
    (1 - 2 * pad) / spanY
  );
  const offX = (1 - spanX * scale) / 2;
  const offY = (1 - spanY * scale) / 2;

  const points = ring
    .map(([lng, lat]) => {
      const x = ((lng * kx - minX) * scale + offX) * size;
      const y = size - (((lat - minY) * scale + offY) * size);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      className="shrink-0 rounded-lg border border-[var(--rule)]"
      style={{ background: "var(--map-b)" }}
      aria-hidden="true"
    >
      <polygon
        points={points}
        fill="var(--purple-light)"
        stroke="var(--purple)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

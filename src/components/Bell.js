// Version 3's bell: a stroked icon in a white circle, with a counted badge —
// not an emoji. The count matters; "you have 3 waiting" is more use than a dot.
export default function Bell({ count = 0, onClick }) {
  return (
    <button className="bell-wrap" onClick={onClick} aria-label="Notifications">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </svg>
      {count > 0 && <span className="bell-badge">{count}</span>}
    </button>
  );
}

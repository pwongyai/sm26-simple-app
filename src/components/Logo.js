// The ListenField mark, carried over from the version 3 prototype: a radiating
// "dandelion" of nodes and branches. Same approximation used there — not a
// pixel-exact trace of the real artwork.
export default function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="ListenField">
      <g stroke="var(--green)" strokeWidth="4" fill="var(--green)">
        <line x1="50" y1="52" x2="50" y2="14" /><circle cx="50" cy="11" r="7" />
        <line x1="50" y1="52" x2="76" y2="22" /><circle cx="80" cy="18" r="6" />
        <line x1="50" y1="52" x2="87" y2="42" /><circle cx="91" cy="40" r="7" />
        <line x1="50" y1="52" x2="89" y2="66" /><circle cx="93" cy="68" r="6" />
        <line x1="50" y1="52" x2="71" y2="86" /><circle cx="74" cy="89" r="7" />
        <line x1="50" y1="52" x2="21" y2="83" /><circle cx="17" cy="86" r="7" />
        <line x1="50" y1="52" x2="11" y2="61" /><circle cx="7" cy="61" r="6" />
        <line x1="50" y1="52" x2="14" y2="36" /><circle cx="9" cy="31" r="7" />
        <line x1="50" y1="52" x2="31" y2="19" /><circle cx="27" cy="15" r="6" />
        <circle cx="50" cy="52" r="6" />
      </g>
    </svg>
  );
}

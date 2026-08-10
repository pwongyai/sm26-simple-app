export default function Bell({ hasUnseen }) {
  return (
    <span className="relative text-xl leading-none" aria-label="notifications">
      🔔
      {hasUnseen && (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
      )}
    </span>
  );
}

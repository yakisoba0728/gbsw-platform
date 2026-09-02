export function Tooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; className?: string }[];
}) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-btn border border-line bg-surface px-3 py-2 whitespace-nowrap shadow-float group-hover:block group-focus-within:block"
    >
      <span className="block text-xs font-medium text-ink">{title}</span>
      {rows.map((row) => (
        <span key={row.label} className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="text-mut">{row.label}</span>
          <span className={`ml-auto font-medium ${row.className ?? "text-ink"}`}>
            {row.value}
          </span>
        </span>
      ))}
    </span>
  );
}

export function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line2 pt-3">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-mut">
          <span className={`size-2.5 rounded-full ${item.color}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

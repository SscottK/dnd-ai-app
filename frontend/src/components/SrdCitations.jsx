export function SrdCitations({ citations = [] }) {
  if (!citations.length) return null;

  return (
    <div className="mt-2 border-t border-border/60 pt-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-ink-faint">SRD sources</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {citations.map((item) => (
          <li
            key={`${item.category}-${item.name}`}
            className="rounded-sm border border-neon-cyan/30 bg-neon-cyan/5 px-2 py-0.5 text-[10px] font-mono text-neon-cyan"
            title={item.tag ? `${item.category}: ${item.tag}` : item.category}
          >
            <span className="text-ink-faint">{item.category}</span>
            <span className="mx-1 text-border">·</span>
            <span className="text-starlight">{item.name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[8px] font-mono text-ink-faint">
        D&amp;D SRD 5.2.1 (CC-BY 4.0)
      </p>
    </div>
  );
}

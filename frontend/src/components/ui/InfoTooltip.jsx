import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/**
 * Circle-i control: short how-to / definition on hover or focus.
 * Keep click-to-open DetailPanel for full item descriptions elsewhere.
 */
export function InfoTooltip({ text, label = "More info", className = "", side = "top" }) {
  const tipId = useId();
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open || !triggerRef.current) return undefined;

    const place = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const gap = 8;
      const width = Math.min(260, window.innerWidth - 16);
      let left = rect.left + rect.width / 2;
      left = Math.max(8 + width / 2, Math.min(left, window.innerWidth - 8 - width / 2));
      const preferTop = side === "top";
      const top = preferTop ? rect.top - gap : rect.bottom + gap;
      setCoords({
        top,
        left,
        width,
        placeAbove: preferTop,
      });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, side]);

  if (!text) return null;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-neon-cyan focus:outline-none focus-visible:ring-1 focus-visible:ring-neon-cyan"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </button>
      {open &&
        createPortal(
          <span
            id={tipId}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              transform: coords.placeAbove
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
              zIndex: 400,
            }}
            className="pointer-events-none rounded-sm border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-left text-[11px] font-mono leading-snug text-zinc-300 shadow-xl"
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}

export function LabelWithInfo({ children, hint, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 ${className}`}>
      <span>{children}</span>
      <InfoTooltip text={hint} label={`About ${typeof children === "string" ? children : "this"}`} />
    </span>
  );
}

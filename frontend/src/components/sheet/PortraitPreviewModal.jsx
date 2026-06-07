import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AuthenticatedImage } from "./AuthenticatedImage";

export function PortraitPreviewModal({ open, portraitUrl, name, token, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !portraitUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portrait-preview-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/90"
        aria-label="Close portrait preview"
        onClick={onClose}
        onPointerDown={(event) => event.stopPropagation()}
      />
      <div
        className="relative z-[1] flex max-h-[92vh] w-full max-w-3xl flex-col items-center gap-4 rounded-sm border-2 border-neon-cyan bg-void px-4 py-5 shadow-2xl sm:px-6"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex w-full items-center justify-between gap-3">
          <h2
            id="portrait-preview-title"
            className="truncate text-sm font-black uppercase text-starlight sm:text-base"
          >
            {name || "Character portrait"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-sm border border-neon-magenta px-3 py-1.5 text-xs font-black uppercase text-neon-magenta hover:bg-neon-magenta/10"
          >
            Close
          </button>
        </header>
        <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-sm border border-border/60 bg-void-deep/40 p-3">
          <AuthenticatedImage
            src={portraitUrl}
            token={token}
            alt={name || "Character portrait"}
            className="max-h-[70vh] max-w-full object-contain"
            fallbackClassName="flex h-48 w-48 items-center justify-center rounded-sm border-2 border-dashed border-border text-4xl font-black uppercase text-ink-faint"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-zinc-500 hover:text-starlight sm:hidden"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body
  );
}

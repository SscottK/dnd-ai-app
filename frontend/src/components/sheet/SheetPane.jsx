import { useEffect, useRef } from "react";
import { PanelTopClose, PanelTopOpen, Pin, PinOff } from "lucide-react";
import { MIN_PANE_HEIGHT, clampWidget } from "../../lib/sheetLayout";

export function SheetPane({
  widget,
  title,
  children,
  onChange,
  onCommit,
  onInteractionStart,
  onInteractionEnd,
  onTogglePin,
  onToggleMinimize,
  onRemove,
  onFocus,
  scale = 1,
  getCanvasBounds,
}) {
  const paneRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const widgetRef = useRef(widget);
  const displayHeight = widget.minimized ? MIN_PANE_HEIGHT : widget.h;

  useEffect(() => {
    widgetRef.current = widget;
  }, [widget]);

  useEffect(() => {
    const onPointerMove = (event) => {
      const { width, height } = getCanvasBounds();
      if (dragRef.current) {
        const dx = (event.clientX - dragRef.current.x) / scale;
        const dy = (event.clientY - dragRef.current.y) / scale;
        onChange(
          clampWidget(
            {
              ...widgetRef.current,
              x: Math.round(dragRef.current.originX + dx),
              y: Math.round(dragRef.current.originY + dy),
            },
            width,
            height
          )
        );
      } else if (resizeRef.current) {
        const dx = (event.clientX - resizeRef.current.x) / scale;
        const dy = (event.clientY - resizeRef.current.y) / scale;
        const nextH = Math.max(MIN_PANE_HEIGHT + 40, Math.round(resizeRef.current.originH + dy));
        onChange(
          clampWidget(
            {
              ...widgetRef.current,
              w: Math.max(180, Math.round(resizeRef.current.originW + dx)),
              h: nextH,
              expandedH: nextH,
            },
            width,
            height
          )
        );
      }
    };

    const onPointerUp = () => {
      const wasDragging = Boolean(dragRef.current || resizeRef.current);
      dragRef.current = null;
      resizeRef.current = null;
      if (wasDragging) {
        const { width, height } = getCanvasBounds();
        onCommit?.(clampWidget(widgetRef.current, width, height));
        onInteractionEnd?.();
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [getCanvasBounds, onChange, onCommit, onInteractionEnd, scale]);

  const focusPane = () => {
    onFocus?.(widget.id);
  };

  const startDrag = (event) => {
    if (widget.pinned) return;
    event.preventDefault();
    focusPane();
    onInteractionStart?.();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      originX: widget.x,
      originY: widget.y,
    };
  };

  const startResize = (event) => {
    if (widget.pinned || widget.minimized) return;
    event.preventDefault();
    event.stopPropagation();
    focusPane();
    onInteractionStart?.();
    resizeRef.current = {
      x: event.clientX,
      y: event.clientY,
      originW: widget.w,
      originH: widget.h,
    };
  };

  const stopPointer = (event) => {
    event.stopPropagation();
  };

  return (
    <div
      ref={paneRef}
      className="absolute flex flex-col rounded-sm border border-border-bright bg-void-panel"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: displayHeight,
        zIndex: widget.z ?? 1,
      }}
      onPointerDown={focusPane}
    >
      <div className="relative z-20 flex shrink-0 items-center gap-1 border-b border-border bg-void-deep/80 px-1 py-1">
        <div
          onPointerDown={startDrag}
          className={`min-w-0 flex-1 px-1 ${
            widget.pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing"
          }`}
        >
          <span className="block truncate text-[10px] font-black uppercase tracking-widest text-starlight">
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5" onPointerDown={stopPointer}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleMinimize(widget.id);
            }}
            onPointerDown={stopPointer}
            className="rounded p-1.5 text-ink-faint hover:bg-border/40 hover:text-starlight"
            title={widget.minimized ? "Expand pane" : "Minimize pane"}
          >
            {widget.minimized ? (
              <PanelTopOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelTopClose className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(widget.id);
            }}
            onPointerDown={stopPointer}
            className="rounded p-1.5 text-ink-faint hover:bg-border/40 hover:text-accent"
            title={widget.pinned ? "Unpin to move" : "Pin in place"}
          >
            {widget.pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(widget.id);
            }}
            onPointerDown={stopPointer}
            className="rounded px-1.5 py-1 text-[10px] font-black text-ink-faint hover:bg-danger/10 hover:text-danger"
          >
            ×
          </button>
        </div>
      </div>
      {!widget.minimized && (
        <div className="relative z-0 min-h-0 min-w-0 flex-1 overflow-auto p-2 text-xs font-mono text-ink-muted">
          {children}
        </div>
      )}
      {!widget.pinned && !widget.minimized && (
        <div
          onPointerDown={startResize}
          className="absolute right-0 bottom-0 z-30 h-4 w-4 cursor-se-resize rounded-tl bg-border-bright hover:bg-accent/60"
          title="Resize"
        />
      )}
    </div>
  );
}

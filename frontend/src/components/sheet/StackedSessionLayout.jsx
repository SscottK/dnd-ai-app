import { PanelTopClose, PanelTopOpen, Pin, PinOff } from "lucide-react";
import { mobilePaneMinHeight, sortWidgetsForMobileStack } from "../../lib/sheetLayout";

export function StackedSessionLayout({
  widgets,
  labels,
  renderBody,
  onToggleMinimize,
  onTogglePin,
  onRemove,
  onFocus,
  isDmSession = false,
}) {
  const sorted = sortWidgetsForMobileStack(widgets, { isDm: isDmSession });

  return (
    <div className="session-ui h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3 pb-24 sm:px-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {sorted.map((widget) => {
          const title = labels[widget.type] || widget.type;
          const minH = mobilePaneMinHeight(widget.type);
          return (
            <article
              key={widget.id}
              className="flex flex-col overflow-hidden rounded-md border border-border-bright bg-void-panel shadow-md"
              style={{ minHeight: widget.minimized ? undefined : minH }}
              onPointerDown={() => onFocus?.(widget.id)}
            >
              <header className="flex shrink-0 items-center gap-2 border-b border-border bg-void-deep/80 px-3 py-2.5">
                <h2 className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-wide text-starlight sm:text-base">
                  {title}
                </h2>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleMinimize(widget.id)}
                    className="rounded-md p-2 text-ink-faint hover:bg-border/40 hover:text-starlight"
                    title={widget.minimized ? "Expand pane" : "Minimize pane"}
                  >
                    {widget.minimized ? (
                      <PanelTopOpen className="h-4 w-4" />
                    ) : (
                      <PanelTopClose className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTogglePin(widget.id)}
                    className="rounded-md p-2 text-ink-faint hover:bg-border/40 hover:text-accent"
                    title={widget.pinned ? "Unpin" : "Pin"}
                  >
                    {widget.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(widget.id)}
                    className="rounded-md px-2 py-2 text-sm font-black text-ink-faint hover:bg-danger/10 hover:text-danger"
                  >
                    ×
                  </button>
                </div>
              </header>
              {!widget.minimized && (
                <div className="min-h-0 flex-1 overflow-auto p-3 text-sm sm:p-4">{renderBody(widget)}</div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

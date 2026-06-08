import { Columns3, Rows3 } from "lucide-react";
import {
  PANE_ORIENTATION_HORIZONTAL,
  PANE_ORIENTATION_VERTICAL,
} from "../../lib/sheetLayout";

export function PaneOrientationToggle({ orientation, onChange, verticalTitle, horizontalTitle }) {
  const isHorizontal = orientation === PANE_ORIENTATION_HORIZONTAL;

  return (
    <div className="flex overflow-hidden rounded-sm border border-border">
      <button
        type="button"
        onClick={() => onChange(PANE_ORIENTATION_VERTICAL)}
        className={`p-1.5 ${
          !isHorizontal
            ? "bg-neon-cyan/20 text-starlight"
            : "text-ink-faint hover:bg-border/40 hover:text-starlight"
        }`}
        title={verticalTitle || "Vertical layout"}
      >
        <Rows3 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(PANE_ORIENTATION_HORIZONTAL)}
        className={`border-l border-border p-1.5 ${
          isHorizontal
            ? "bg-neon-cyan/20 text-starlight"
            : "text-ink-faint hover:bg-border/40 hover:text-starlight"
        }`}
        title={horizontalTitle || "Horizontal layout"}
      >
        <Columns3 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

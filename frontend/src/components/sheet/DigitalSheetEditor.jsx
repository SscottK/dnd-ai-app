import { useCallback, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { apiFetch } from "../../lib/api";
import {
  applyEquipmentToCharacter,
  parseSheetJson,
  resolveCombatStats,
  sheetToJson,
} from "../../lib/characterSheet";
import { CharacterTabsWidget } from "./SessionSheetWidgets";

export function DigitalSheetEditor({ character, token, onSaved }) {
  const [sheet, setSheet] = useState(() => parseSheetJson(character?.sheet_json));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSheet(parseSheetJson(character?.sheet_json));
    setDirty(false);
    setMessage("");
  }, [character?.id, character?.sheet_json]);

  const combat = resolveCombatStats(character, sheet);

  const handleSave = useCallback(async (sheetOverride) => {
    if (!token || !character?.id) return;
    const workingSheet = sheetOverride ?? sheet;
    const nextCharacter = applyEquipmentToCharacter(character, workingSheet);
    setSaving(true);
    setMessage("");
    try {
      const res = await apiFetch(`/characters/${character.id}`, {
        token,
        method: "PATCH",
        body: {
          ac: nextCharacter.ac,
          sheet_json: sheetToJson(workingSheet),
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Save failed");
      }
      const data = await res.json();
      const savedSheet = parseSheetJson(data.sheet_json);
      setSheet(savedSheet);
      setDirty(false);
      setMessage("Saved to digital sheet.");
      onSaved?.(data);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  }, [token, character, sheet, onSaved]);

  const onSheetChange = useCallback(
    (nextSheet, { immediate = false } = {}) => {
      setSheet(nextSheet);
      setDirty(true);
      setMessage("");
      if (immediate) {
        void handleSave(nextSheet);
      }
    },
    [handleSave]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-void">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <p className="text-[10px] font-mono leading-relaxed text-zinc-500">
          Edits here are saved to your <span className="text-neon-cyan">digital character sheet</span>{" "}
          in the app. The uploaded PDF is a read-only reference and is not modified.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="border border-neon-magenta/50 px-3 py-2 text-center">
            <p className="text-[9px] uppercase text-zinc-500">AC</p>
            <p className="text-xl font-black text-starlight">{combat.ac ?? "—"}</p>
            {combat.fromEquipment && (
              <p className="text-[8px] uppercase text-ink-faint">From equipped gear</p>
            )}
          </div>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => handleSave()}
            className="inline-flex items-center gap-1.5 border-2 border-neon-cyan px-4 py-2 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            {saving ? "Saving…" : dirty ? "Save digital sheet" : "Saved"}
          </button>
          {message && (
            <p
              className={`text-[10px] font-mono ${
                message.startsWith("Saved") ? "text-neon-cyan" : "text-danger"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <CharacterTabsWidget
          sheet={sheet}
          onSheetChange={onSheetChange}
          onShowDetail={() => {}}
        />
      </div>
    </div>
  );
}

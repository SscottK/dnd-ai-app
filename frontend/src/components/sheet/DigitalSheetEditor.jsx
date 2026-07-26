import { useCallback, useEffect, useState } from "react";
import { Moon, Save } from "lucide-react";
import { apiFetch } from "../../lib/api";
import {
  applyEquipmentToCharacter,
  parseSheetJson,
  resolveCombatStats,
  sheetToJson,
} from "../../lib/characterSheet";
import { applyLongRest } from "../../lib/longRest";
import { DigitalCharacterSheet } from "./DigitalCharacterSheet";

export function DigitalSheetEditor({ character, token, onSaved }) {
  const [sheet, setSheet] = useState(() => parseSheetJson(character?.sheet_json));
  const [localCharacter, setLocalCharacter] = useState(character);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setSheet(parseSheetJson(character?.sheet_json));
    setLocalCharacter(character);
    setDirty(false);
    setMessage("");
  }, [character?.id, character?.sheet_json, character?.hp, character?.max_hp, character?.ac]);

  const combat = resolveCombatStats(localCharacter, sheet);

  const handleSave = useCallback(
    async (sheetOverride, characterOverride) => {
      if (!token || !character?.id) return null;
      const workingSheet = sheetOverride ?? sheet;
      const workingCharacter = characterOverride ?? localCharacter;
      const nextCharacter = applyEquipmentToCharacter(workingCharacter, workingSheet);
      setSaving(true);
      setMessage("");
      try {
        const res = await apiFetch(`/characters/${character.id}`, {
          token,
          method: "PATCH",
          body: {
            ac: nextCharacter.ac,
            hp: nextCharacter.hp,
            max_hp: nextCharacter.max_hp,
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
        setLocalCharacter(data);
        setDirty(false);
        setMessage("Saved to digital sheet.");
        onSaved?.(data);
        return data;
      } catch (err) {
        console.error(err);
        setMessage(err.message || "Could not save.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [token, character?.id, sheet, localCharacter, onSaved]
  );

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

  const onCombatChange = useCallback((patch) => {
    setLocalCharacter((prev) => {
      const next = { ...prev, ...patch };
      setDirty(true);
      setMessage("");
      return next;
    });
  }, []);

  const handleLongRest = useCallback(async () => {
    if (saving) return;
    if (
      !window.confirm(
        "Take a Long Rest? This restores HP, refreshes short/long-rest resources, and reduces Exhaustion by 1 (5.5e)."
      )
    ) {
      return;
    }
    const { character: nextCharacter, sheet: nextSheet, summary } = applyLongRest({
      character: localCharacter,
      sheet,
    });
    setSheet(nextSheet);
    setLocalCharacter(nextCharacter);
    const saved = await handleSave(nextSheet, nextCharacter);
    if (saved) {
      setMessage(`Long rest: ${summary.join(" · ")}`);
    }
  }, [saving, localCharacter, sheet, handleSave]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-void">
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950/80 px-3 py-1.5">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-mono text-zinc-600">
            Digital sheet — equip gear here; PDF stays read-only.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-zinc-500">
              AC <span className="font-black text-starlight">{combat.ac ?? "—"}</span>
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleLongRest()}
              className="inline-flex items-center gap-1 border border-neon-magenta/60 px-3 py-1 text-[10px] font-black uppercase text-neon-magenta hover:bg-neon-magenta/10 disabled:opacity-40"
              title="Restore HP, refresh rest resources, reduce Exhaustion"
            >
              <Moon className="h-3.5 w-3.5" />
              Long Rest
            </button>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => handleSave()}
              className="inline-flex items-center gap-1 border border-neon-cyan px-3 py-1 text-[10px] font-black uppercase text-neon-cyan hover:bg-neon-cyan/10 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
            {message && (
              <p
                className={`text-[10px] font-mono ${
                  message.startsWith("Saved") || message.startsWith("Long rest")
                    ? "text-neon-cyan"
                    : "text-danger"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <DigitalCharacterSheet
          character={localCharacter}
          sheet={sheet}
          onSheetChange={onSheetChange}
          onCombatChange={onCombatChange}
          onLongRest={handleLongRest}
        />
      </div>
    </div>
  );
}

import { normalizeConditions } from "./conditions";

/** Extract structured encounter JSON from an AI response. */
export function parseEncounterGeneration(text) {
  if (!text) throw new Error("Empty response");

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not find encounter JSON in response");
  }

  const parsed = JSON.parse(candidate.slice(start, end + 1));
  const enemies = (parsed.enemies || parsed.combatants || []).map(normalizeEnemy);
  if (!enemies.length) {
    throw new Error("No enemies found in generated encounter");
  }

  return {
    title: String(parsed.title || "").trim(),
    summary: parsed.summary || "",
    enemies,
  };
}

/** Short label for a DM Notes tab from encounter data. */
export function encounterTabTitle({ title, summary, enemies }) {
  if (title) return title;
  if (enemies?.length) {
    const parts = enemies.map((enemy) =>
      enemy.count > 1 ? `${enemy.count} ${enemy.name}` : enemy.name
    );
    if (parts.length <= 2) return parts.join(" & ");
    return `${parts.slice(0, 2).join(", ")}…`;
  }
  const first = (summary || "").split(/[.!?\n]/)[0]?.trim();
  if (first) return first.length > 28 ? `${first.slice(0, 25)}…` : first;
  return "Encounter";
}

/** Plain-text notes body for a generated encounter tab. */
export function formatEncounterNotesContent({ title, summary, enemies, partyLevel, difficulty, setting }) {
  const heading = title || encounterTabTitle({ summary, enemies });
  const lines = [heading, `Level ${partyLevel} · ${difficulty}${setting ? ` · ${setting}` : ""}`, ""];
  if (summary) {
    lines.push(summary, "");
  }
  if (enemies?.length) {
    lines.push("Enemies");
    for (const enemy of enemies) {
      const label = enemy.count > 1 ? `${enemy.name} ×${enemy.count}` : enemy.name;
      const stats = [
        `Init ${enemy.initiative}`,
        enemy.ac != null ? `AC ${enemy.ac}` : null,
        enemy.hp != null ? `HP ${enemy.hp}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`• ${label} — ${stats}`);
    }
  }
  return lines.join("\n");
}

function normalizeCombatAction(raw, index = 0) {
  if (!raw?.name) return null;
  return {
    id: raw.id || `enemy-action-${index}-${String(raw.name).toLowerCase().replace(/\s+/g, "-")}`,
    name: String(raw.name).trim(),
    action_type: raw.action_type || raw.actionType || "action",
    targeting: raw.targeting || "one_enemy",
    description: raw.description || raw.notes || null,
  };
}

function normalizeEnemy(raw) {
  const combat_actions = (raw.combat_actions || raw.actions || [])
    .map((entry, index) => normalizeCombatAction(entry, index))
    .filter(Boolean);
  return {
    name: String(raw.name || "Creature").trim(),
    count: Math.min(12, Math.max(1, Number(raw.count) || 1)),
    initiative: Number.isFinite(Number(raw.initiative)) ? Number(raw.initiative) : 10,
    hp: toOptionalInt(raw.hp),
    max_hp: toOptionalInt(raw.max_hp ?? raw.hp),
    ac: toOptionalInt(raw.ac),
    conditions: normalizeConditions(raw.conditions),
    combat_actions,
  };
}

function toOptionalInt(value) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

export function buildEncounterPrompt(form) {
  return `You are a D&D 5e DM assistant. Generate a combat encounter for a party of level ${form.partyLevel} characters. Difficulty: ${form.difficulty}. Setting: ${form.setting || "generic fantasy"}.

Respond with ONLY valid JSON (no markdown prose outside the JSON). Schema:
{
  "title": "Short encounter name (2-5 words, e.g. Bridge Ambush)",
  "summary": "2-4 sentences describing the scene and tactics",
  "enemies": [
    {
      "name": "Creature name",
      "count": 1,
      "initiative": 12,
      "hp": 22,
      "max_hp": 22,
      "ac": 15,
      "conditions": [],
      "combat_actions": [
        {
          "name": "Scimitar",
          "action_type": "action",
          "targeting": "one_enemy",
          "description": "+4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage."
        },
        {
          "name": "Shortbow",
          "action_type": "action",
          "targeting": "one_enemy",
          "description": "+4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage."
        }
      ]
    }
  ]
}

Include realistic initiative, AC, HP, and combat_actions (attacks, multiattack, breath weapons, spells, bonus-action abilities) for each enemy type. Use count > 1 for groups of identical creatures.`;
}

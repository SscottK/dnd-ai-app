const SECTION_HEADERS = [
  "Personality Traits",
  "Ideals",
  "Bonds",
  "Flaws",
  "Features & Traits",
  "Features",
  "Proficiencies & Languages",
  "Proficiencies",
  "Equipment",
  "Backstory",
  "Allies & Organizations",
  "Additional Features",
  "Character Appearance",
  "Spellcasting",
  "Attacks & Spellcasting",
  "Passive Wisdom",
  "Other Notes",
  "Notes",
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Insert line breaks into PDF-parsed notes that arrived as one long line. */
export function normalizeNotesText(text) {
  if (!text) return "";
  let normalized = String(text).replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  if (normalized.split("\n").length <= 2 && normalized.length > 120) {
    for (const header of SECTION_HEADERS) {
      const pattern = new RegExp(`(?<!\\n)\\s*(${escapeRegex(header)})\\s*(?=[A-Z0-9"'])`, "gi");
      normalized = normalized.replace(pattern, "\n\n$1\n");
    }

    normalized = normalized.replace(/\s*[•·▪]\s*/g, "\n• ");
    normalized = normalized.replace(/\s+-\s+(?=[A-Z"'(])/g, "\n- ");
    normalized = normalized.replace(/(\d+)\.\s+(?=[A-Z])/g, "\n$1. ");
    normalized = normalized.replace(/([.!?])\s+(?=[A-Z][a-z])/g, "$1\n");
    normalized = normalized.replace(/:\s+(?=[A-Z][a-z])/g, ":\n");
  }

  return normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHeadingLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 72) return false;
  if (/^[•\-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) return false;
  if (SECTION_HEADERS.some((header) => header.toLowerCase() === trimmed.toLowerCase())) return true;
  if (/^[A-Z][A-Za-z &'/]+:?$/.test(trimmed) && trimmed.split(/\s+/).length <= 6) return true;
  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.split(/\s+/).length <= 8) {
    return true;
  }
  return false;
}

function isListLine(line) {
  return /^([•\-*]|\d+\.)\s+/.test(line.trim());
}

function stripListMarker(line) {
  return line.trim().replace(/^([•\-*]|\d+\.)\s+/, "");
}

/** Turn normalized notes into display blocks (headings, paragraphs, lists). */
export function parseNotesToBlocks(text) {
  const normalized = normalizeNotesText(text);
  if (!normalized) return [];

  const blocks = [];
  const chunks = normalized.split(/\n{2,}/);

  for (const chunk of chunks) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;

    if (lines.length === 1) {
      if (isHeadingLine(lines[0])) {
        blocks.push({ type: "heading", text: lines[0].replace(/:$/, "") });
      } else if (isListLine(lines[0])) {
        blocks.push({ type: "list", items: [stripListMarker(lines[0])] });
      } else {
        blocks.push({ type: "paragraph", text: lines[0] });
      }
      continue;
    }

    if (lines.every(isListLine)) {
      blocks.push({ type: "list", items: lines.map(stripListMarker) });
      continue;
    }

    if (isHeadingLine(lines[0])) {
      blocks.push({ type: "heading", text: lines[0].replace(/:$/, "") });
      const body = lines.slice(1);
      if (body.every(isListLine)) {
        blocks.push({ type: "list", items: body.map(stripListMarker) });
      } else if (body.length === 1) {
        blocks.push({ type: "paragraph", text: body[0] });
      } else {
        blocks.push({ type: "paragraph", text: body.join("\n") });
      }
      continue;
    }

    blocks.push({ type: "paragraph", text: lines.join("\n") });
  }

  return blocks;
}

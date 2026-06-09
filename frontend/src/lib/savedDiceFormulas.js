import { isValidDiceExpression, normalizeRollExpression } from "./diceRoll";

const STORAGE_PREFIX = "dice-saved-formulas";
const MAX_SAVED = 24;

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId ?? "guest"}`;
}

function readStorage(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item === "string")
      .map((item) => normalizeRollExpression(item))
      .filter((item) => isValidDiceExpression(item));
  } catch {
    return [];
  }
}

function writeStorage(userId, formulas) {
  localStorage.setItem(storageKey(userId), JSON.stringify(formulas));
}

export function loadSavedDiceFormulas(userId) {
  return readStorage(userId);
}

export function saveDiceFormula(userId, expression, existing = []) {
  const normalized = normalizeRollExpression(expression);
  if (!isValidDiceExpression(normalized)) {
    throw new Error("Enter a valid formula like 2d6+3 or 4d6dl1.");
  }
  if (existing.includes(normalized)) {
    throw new Error("That formula is already saved.");
  }

  const next = [normalized, ...existing].slice(0, MAX_SAVED);
  writeStorage(userId, next);
  return next;
}

export function removeSavedDiceFormula(userId, expression, existing = []) {
  const normalized = normalizeRollExpression(expression);
  const next = existing.filter((item) => item !== normalized);
  writeStorage(userId, next);
  return next;
}

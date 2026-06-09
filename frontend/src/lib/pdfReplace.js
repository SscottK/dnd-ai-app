/** Confirm before replacing a character's source PDF. */
export function confirmPdfReplace({ characterName, hasExistingPdf } = {}) {
  if (!hasExistingPdf) return true;
  const label = characterName ? `${characterName}'s ` : "";
  return window.confirm(
    `Replace ${label}character sheet PDF?\n\nThe new PDF will be parsed and become the source of truth for the digital sheet, HP, AC, and combat stats. The previous PDF will be deleted.`
  );
}

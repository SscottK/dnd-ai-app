/** Accent styles for action economy — draws the eye to player agency choices. */

export const AGENCY_LABEL_CLASS = "font-black text-agency-orange";
export const AGENCY_LABEL_SPENT_CLASS = "font-black text-ink-faint line-through";

export const AGENCY_BUTTON_CLASS =
  "rounded-sm border border-agency-orange px-2 py-1 text-xs sm:text-sm font-black uppercase text-agency-orange hover:bg-agency-orange/15 disabled:opacity-40";

export function agencySlotClass(spent) {
  return spent ? AGENCY_LABEL_SPENT_CLASS : AGENCY_LABEL_CLASS;
}

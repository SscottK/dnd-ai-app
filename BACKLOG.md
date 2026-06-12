# Master backlog

Prioritized work queue for dnd-ai-app. Update this file when items are added, completed, or reprioritized.

---

## P4 — Social features (next up)

| Status | Item |
|--------|------|
| pending | Friends list |
| pending | Send campaign join requests to friends from friends list |
| pending | Messaging — 1-on-1 and group chats; message friends or anyone in a shared campaign (DM + players, including non-friends) |

---

## P5 — Bigger features (discussed, not started)

| Status | Item |
|--------|------|
| pending | Level-up system (player + DM can level campaign characters) |
| pending | In-app character builder (currently disabled/future) |
| pending | Save digital sheet edits back to PDF (if feasible) |

---

## P6 — Long-term / deferred

| Status | Item |
|--------|------|
| pending | Foundry VTT token integration |
| pending | Neon Odyssey setting-specific rules/content |

---

## Done

| Item |
|------|
| **P3 — Sheet & combat depth (complete)** |
| P3 — PDF resync merge (resource current, orphaned pools, AC overrides); parse_warning on refresh |
| P3 — Turn-action UI (display filter, magic-action spells, hide broken option menus) |
| P3 — Combat resolution (Multiattack strikes, spell attack profiles, resource spend after resolve) |
| P3 — Encounter sync (resource poll while sheet dirty; HP/AC/conditions tests) |
| P3 — Notes/logging (archive dedupe, reopen merges content, play-session tab titles) |
| P3 — Full Sheet entry points verified (digital default; legacy `/sheet` → digital) |
| P2 — Action economy accent (orange labels + Action/Bonus/Magic/Reaction buttons) |
| P2 — Heal target validation (full HP targets filtered client + server) |
| P2 — Limited-use sync (server-enforced spend; DM panel hidden for player-controlled PCs; resource polling) |
| P2 — Death saves at 0 HP (only death save action; auto-roll on end turn if skipped) |
| P2 — Combat end dismiss UX (victory/defeat banner; user closes tracker) |
| P2 — Combat log → Log tab (not active Session tab) |
| P1 — Mobile nav labels match desktop |
| P1 — SRD browse mobile UX |
| P1 — Pull-to-refresh on main pages |
| P2 — Combat system hardening (umbrella pass) |
| P2 — PDF re-upload with confirm overwrite |
| P2 — Dice roller: modifiers, drop/keep |
| P2 — Skill/save rolls → action log |
| P2 — Initiative first turn when enemies added before party |
| P2 — Combat log shared with all players on victory/end |
| Hidden enemies (encounter library + reveal during combat) |
| Initiative tracker — monster stats hidden from players |
| Session pane resize scales proportionally on shrink |
| Encounter library — per-user templates, DM tracker load, monster labels |
| Action/combat logs → session notes on close |
| SRD 2024 full ingest, browse UI, polish |
| Postgres migration, access requests, beta feedback |
| PDF replace/upload endpoint |
| Party cards, campaign title, dashboard roster, encounter party size, ultrawide panes |
| Campaign notes editor on `/notes` |
| Notes tab titles, dice roller resize, pane orientation, campaign Details |
| SRD citations in Rule Wizard + browse UI |
| 2024 rules ingest, sheet schema, class/combat catalogs, enrichment pipeline |

---

## Declined

| Item | Reason |
|------|--------|
| Full PHB/bestiary ingest | Licensing; SRD-only ceiling |

---

## P3 follow-ups (done)

- Equip/unequip submenu in turn-action UI (wired via `onInventoryEquip`)
- DM tracker: resource pools for all party PCs on initiative rows
- PDF spell-slot row ingest (`enrich_resources` normalizes Gemini spell-slot rows)

## P3 follow-ups (done, continued)

- Multi-target Extra Attack (one action, multiple `target_ids`)
- Attack profiles from combat/spell catalogs + SRD stat blocks
- Session logs tab: combat + action logs append to per-session logs tab, not notes tab

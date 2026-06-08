# SRD 5.2.1 Rules Data

**Source:** D&D System Reference Document v5.2.1, © Wizards of the Coast LLC.

**License:** [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Rebuild everything: `python scripts/build_srd_all.py` (from `backend/`).

| File | Contents | Source |
| --- | --- | --- |
| `manifest.json` | Build manifest and counts | Generated |
| `monsters.json` | 322 monsters, full stat blocks | [cocoajamworld/srd-5.2.1](https://github.com/cocoajamworld/srd-5.2.1) |
| `conditions.json` | 14 conditions | [cocoajamworld/srd-5.2.1](https://github.com/cocoajamworld/srd-5.2.1) |
| `spells.json` | 319 spells, full descriptions | [Open5e](https://api.open5e.com/) `wotc-srd` |
| `combat_actions.json` | Standard + class combat actions | Open5e `wotc-srd` + SRD 2024 actions |
| `species.json` | 9 species | [downfallx/dnd-5e-srd-markdown](https://github.com/downfallx/dnd-5e-srd-markdown) |
| `backgrounds.json` | 4 backgrounds | downfallx markdown |
| `feats.json` | 17 feats | downfallx markdown |
| `glossary.json` | Rules glossary | downfallx markdown |
| `classes.json` | 12 SRD classes (full text) | downfallx `classes.md` |
| `magic_items.json` | Magic items | downfallx `magic-items.md` |
| `animals.json` | 95 animal stat blocks | downfallx `animals.md` |
| `equipment.json` | Weapons, armor, gear, equipment chapters | Open5e + downfallx `equipment.md` |
| `rules_documents.json` | Playing the game, character creation, toolbox, monsters overview | downfallx markdown |

Re-published structured data via [Open5e API](https://api.open5e.com/) (`wotc-srd` document), also under CC BY 4.0 where applicable.

# D&D Beyond 2024 Free Rules (ingested catalog)

Source: [https://www.dndbeyond.com/sources/dnd/br-2024](https://www.dndbeyond.com/sources/dnd/br-2024)

Structured extracts for combat enrichment. Wizards of the Coast / D&D Beyond.
Do not commit full rulebook prose; this folder holds parsed game-data fields only.

Last ingested: 2026-06-06T22:53:47+00:00

## Files

- `classes.json` — feature tables, level features, resources per class
- `combat_actions.json` — actionable class features for turn combat
- `action_economy.json` — action/bonus/reaction/magic notes from Playing the Game

Regenerate ingest: `PYTHONPATH=backend python3 backend/scripts/ingest_dndbeyond_br2024.py`

Rebuild enrichment catalogs: `python3 backend/scripts/build_class_catalog_from_br2024.py`

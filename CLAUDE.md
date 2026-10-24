@AGENTS.md

# ORDR simulator verification

The public unit reference is `dist/ordr_units.json`, collected from `https://ordr.kr/character`.
It contains all 271 catalog units, including 200 with a detailed skill or buff tooltip.
Open `dist/units.html` to inspect a unit and follow its original source link.

## Before changing a combat calculation

1. Find the unit by `code` in `dist/ordr_units.json`; read `base_lines`, `trait_lines`, `base_info.buff_lines`, and `trait_info.buff_lines`. Read the source URL if wording is ambiguous.
2. Find the corresponding code in `dist/data.json`, `dist/engine.mjs` (`SUPPORTS`), and `dist/engine_v3.mjs` (`CONDITIONAL_UNITS`, `DELETERS`). A tooltip in the catalog does **not** mean its combat behavior is implemented.
3. Record for every tooltip damage line: trigger, chance/cooldown, target type, area or single target, damage type, flat/percent component, resource rule, form/trait requirement, and relevant debuff. Mark unknown behavior as unknown; never silently infer it from wording.
4. Distinguish direct evidence from ORDR tooltip, 2.305 map/script, patch note, and simulator approximation. Keep the 2.323 map and extracted files immutable.
5. Add a focused regression check for the new mechanic, then run existing engine checks and the tooltip validator.

## Commands

From the repository root:

```text
python -m pip install -r scripts/requirements.txt
python scripts/sync_ordr_tooltips.py
python scripts/validate_ordr_tooltips.py
node test_v2.mjs
node test_single.mjs
node test_conditional.mjs
```

The sync script refreshes `dist/ordr_units.json` and keeps downloaded HTML in ignored `.cache/ordr/`. The validator checks every page against that cache when it exists and does structural checks on another computer. For an offline rebuild, use `python scripts/sync_ordr_tooltips.py --offline`. Review data changes before committing; a changed tooltip hash is a prompt to examine the affected unit, not proof that its simulation is correct.

## Verification priorities

- Start with the units selectable in `dist/v3.html` and compare every damage, control, buff, and transformation claim with the current tooltip.
- Then cover lower tier supports and single-target units. Add each missing combat rule explicitly; keep unsupported units labeled as tooltip-only.
- For each modeled unit, make a small evidence table in a note or test: tooltip line → implementation file/function → test → remaining assumption.
- Do not convert buff-only tooltips into fabricated damage. A missing `unit-stats` block is valid for 15 units; their buff text is under `base_info.buff_lines`.

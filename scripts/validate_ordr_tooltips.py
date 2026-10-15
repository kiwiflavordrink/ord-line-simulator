"""Validate the ORDR snapshot against saved source HTML and local model codes."""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

from sync_ordr_tooltips import catalog_entries, digest, parse_page


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "ordr"
SNAPSHOT = ROOT / "dist" / "ordr_units.json"


def main() -> None:
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    units = snapshot["units"]
    codes = [unit["code"] for unit in units]
    assert len(codes) == len(set(codes)), "duplicate unit code"
    assert snapshot["unit_count"] == len(units) == 271
    assert snapshot["tooltip_count"] == sum(unit["has_tooltip"] for unit in units) == 200
    assert snapshot["trait_count"] == sum(bool(unit["trait_lines"]) for unit in units)
    for unit in units:
        assert unit["url"] == "https://ordr.kr/character/" + unit["code"]
        assert len(unit["page_sha256"]) == len(unit["tooltip_sha256"]) == 64
        assert bool(unit["base_lines"] or unit["base_info"]["buff_lines"]) == unit["has_tooltip"]
        assert all(x["code"] in codes for x in unit["base_info"]["recipe"]), unit["code"]
        assert all(x["code"] in codes for x in unit["base_info"]["higher_units"]), unit["code"]

    if CACHE.joinpath("catalog.html").exists():
        catalog = CACHE.joinpath("catalog.html").read_bytes()
        assert snapshot["catalog_sha256"] == digest(catalog), "catalog source changed"
        entries = catalog_entries(catalog)
        assert [x["code"] for x in entries] == codes, "catalog order or codes changed"
        for row, unit in zip(entries, units):
            raw = CACHE.joinpath(row["code"] + ".html").read_bytes()
            assert parse_page(row, raw) == unit, f"source mismatch: {row['code']}"
        print("Cached ORDR HTML: all 271 pages match the snapshot")
    else:
        print("Cached ORDR HTML not present; structural checks only")

    data = json.loads(ROOT.joinpath("dist/data.json").read_text(encoding="utf-8"))
    model_codes = {hero["code"] for hero in data["heroes"]}
    missing = sorted(model_codes - set(codes))
    assert not missing, "model codes absent from ORDR catalog: " + ", ".join(missing)
    by_grade = Counter(unit["grade"] for unit in units)
    print("ORDR catalog: 271 units, 200 detailed tooltips,", snapshot["trait_count"], "trait variants")
    print("Combat data.json:", len(model_codes), "hero codes; all found in ORDR catalog")
    print("Grades:", ", ".join(f"{grade} {count}" for grade, count in by_grade.items()))


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, FileNotFoundError) as error:
        print("VALIDATION FAILED:", error, file=sys.stderr)
        sys.exit(1)

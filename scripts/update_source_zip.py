"""Refresh selected project files in the downloadable v3 source archive."""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "dist" / "ordr-source-v3.zip"
FILES = [
    "dist/engine_v3.mjs", "dist/v3.mjs", "dist/v3.html", "dist/index.html",
    "README.md", "test_conditional.mjs", "docs/조건형_가반_프랑키_써니호.md",
    "dist/ordr_units.json", "dist/units.html", "dist/units.mjs", "dist/units.css",
    "scripts/sync_ordr_tooltips.py", "scripts/validate_ordr_tooltips.py",
    "scripts/requirements.txt", "docs/ORDR_툴팁_검증_계획.md", "CLAUDE.md",
]

replacement = set(FILES)
temporary = ARCHIVE.with_suffix(".zip.tmp")
with ZipFile(ARCHIVE) as source, ZipFile(temporary, "w", compression=ZIP_DEFLATED) as output:
    for entry in source.infolist():
        if entry.filename not in replacement:
            output.writestr(entry, source.read(entry))
    for name in FILES:
        output.write(ROOT / name, name)
temporary.replace(ARCHIVE)
print(f"Updated {ARCHIVE.name} with {len(FILES)} current project files")

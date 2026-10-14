"""Snapshot every ORDR catalog entry and its base/trait tooltip.

Requires lxml (`python -m pip install -r scripts/requirements.txt`).
The HTML cache is local and ignored by Git. No Warcraft map is touched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from lxml import html


ROOT = Path(__file__).resolve().parents[1]
CATALOG_URL = "https://ordr.kr/character"
USER_AGENT = "Mozilla/5.0 (compatible; ORDR-simulator-research/1.0)"
CLASS_TEST = 'contains(concat(" ", normalize-space(@class), " "), " unit-stats ")'


def normalized(element: html.HtmlElement) -> str:
    return " ".join(" ".join(element.itertext()).split())


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def get_bytes(url: str, *, retries: int = 3) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Could not download {url}")


def skill_lines(tree: html.HtmlElement, selector: str) -> list[str]:
    blocks = tree.xpath(selector)
    if not blocks:
        return []
    return [line for node in blocks[0].xpath("./div")
            if (line := " ".join(node.text_content().split()))]


def catalog_entries(raw: bytes) -> list[dict]:
    tree = html.fromstring(raw)
    entries = []
    for section in tree.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " grade-section ")]'):
        heading = section.xpath("./h2/text()")
        grade = re.sub(r"\s*\(.*", "", heading[0]).strip() if heading else ""
        for anchor in section.xpath('.//a[starts-with(@href, "/character/")]'):
            code = anchor.get("data-code") or anchor.get("href").rsplit("/", 1)[-1]
            role = " / ".join(" ".join(x.text_content().split()) for x in
                              anchor.xpath('.//*[contains(concat(" ", normalize-space(@class), " "), " role ")]'))
            entries.append({"code": code, "name": anchor.get("data-name") or
                            " ".join(anchor.text_content().split()),
                            "grade": grade, "role": role,
                            "url": f"https://ordr.kr/character/{code}"})
    codes = [row["code"] for row in entries]
    if len(codes) != len(set(codes)) or not codes:
        raise ValueError("The ORDR catalog is empty or contains duplicate unit codes")
    return entries


def parse_page(row: dict, raw: bytes) -> dict:
    tree = html.fromstring(raw)
    base = skill_lines(tree, f'//*[@id="detail-body-off"]//*[{CLASS_TEST}]')
    trait = skill_lines(tree, f'//template[@id="detail-body-on-tpl"]//*[{CLASS_TEST}]')
    off = tree.xpath('//*[@id="detail-body-off"]')
    on = tree.xpath('//template[@id="detail-body-on-tpl"]')
    def extras(blocks: list[html.HtmlElement]) -> dict:
        if not blocks:
            return {"commands": [], "recipe": [], "extra_requirements": [], "buff_lines": [], "higher_units": []}
        block = blocks[0]
        children = block.xpath('./*')
        recipe = []
        for child in children:
            if child.tag == 'div' and child.xpath('./a[starts-with(@href,"./")]') and '[상위 유닛]' not in normalized(child):
                recipe = [{"code": a.get('href').removeprefix('./').removesuffix('.html'),
                           "name": normalized(a)} for a in child.xpath('./a[starts-with(@href,"./")]')]
                break
        buff = block.xpath('.//*[contains(@style,"--tt-buff")]')
        higher = [child for child in children if '[상위 유닛]' in normalized(child)]
        return {"commands": [normalized(x) for x in block.xpath('./*[contains(concat(" ", normalize-space(@class), " "), " command-text ")]')],
                "recipe": recipe,
                "extra_requirements": [normalized(x) for x in block.xpath('./*[contains(concat(" ", normalize-space(@class), " "), " extra-item ")]')],
                "buff_lines": [normalized(x) for x in buff],
                "higher_units": [{"code": a.get('href').removeprefix('./').removesuffix('.html'), "name": normalized(a)}
                                 for child in higher for a in child.xpath('./a[starts-with(@href,"./")]')]}
    off_extra, on_extra = extras(off), extras(on)
    # Some pages use a single tooltip without the off/on wrapper.
    if not base:
        base = skill_lines(tree, f'//*[{CLASS_TEST}]')
    title = " ".join(tree.xpath("//h1[1]")[0].text_content().split()) if tree.xpath("//h1[1]") else ""
    skill_bytes = json.dumps({"base": base, "trait": trait, "base_info": off_extra,
                             "trait_info": on_extra}, ensure_ascii=False,
                             sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {**row, "page_title": title, "has_tooltip": bool(base or off_extra['buff_lines']),
            "base_lines": base, "trait_lines": trait,
            "base_info": off_extra, "trait_info": on_extra,
            "page_sha256": digest(raw), "tooltip_sha256": digest(skill_bytes)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Read previously saved HTML only")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache" / "ordr")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "ordr_units.json")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)

    def source(url: str, filename: str) -> bytes:
        path = args.cache / filename
        if args.offline:
            return path.read_bytes()
        raw = get_bytes(url)
        path.write_bytes(raw)
        return raw

    catalog_raw = source(CATALOG_URL, "catalog.html")
    entries = catalog_entries(catalog_raw)
    next_request = 0.0
    lock = threading.Lock()

    def fetch_one(row: dict) -> dict:
        nonlocal next_request
        if not args.offline:
            with lock:
                delay = max(0.0, next_request - time.monotonic())
                if delay:
                    time.sleep(delay)
                next_request = time.monotonic() + 0.25
        return parse_page(row, source(row["url"], f'{row["code"]}.html'))

    found = {}
    errors = []
    with ThreadPoolExecutor(max_workers=max(1, min(4, args.workers))) as pool:
        futures = {pool.submit(fetch_one, row): row["code"] for row in entries}
        for future in as_completed(futures):
            code = futures[future]
            try:
                found[code] = future.result()
            except Exception as exc:
                errors.append(f"{code}: {exc}")
    if errors:
        raise RuntimeError("Snapshot incomplete; output not replaced:\n" + "\n".join(errors))
    units = [found[row["code"]] for row in entries]
    detailed = sum(row["has_tooltip"] for row in units)
    if detailed == 0:
        raise ValueError("No tooltips were parsed; check the site markup")
    snapshot = {"schema_version": 1, "source": CATALOG_URL,
                "retrieved_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "catalog_sha256": digest(catalog_raw),
                "unit_count": len(units), "tooltip_count": detailed,
                "trait_count": sum(bool(row["trait_lines"]) for row in units),
                "units": units}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.output)
    print(f"Saved {len(units)} units, {detailed} tooltips, {snapshot['trait_count']} trait variants to {args.output}")


if __name__ == "__main__":
    main()

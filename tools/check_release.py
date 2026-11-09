import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


class RefCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("src", "href") and value:
                self.refs.append(value)


def is_local(ref):
    ref = ref.strip()
    if not ref or ref.startswith(("#", "//", "http:", "https:")):
        return False
    return not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", ref)


REQUIRED = ["index.html", "sw.js", "manifest.json"]
SURAHS = 114


def manifest_start(root):
    data = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    return [data["start_url"]] if "start_url" in data else []


def tafsir_missing(root):
    base = root / "data" / "tafsir"
    folders = sorted(p for p in base.iterdir() if p.is_dir()) if base.is_dir() else []
    if not folders:
        return ["data/tafsir: no tafsir folders"]
    return [f"data/tafsir: {f.name}/{n:03}.json" for f in folders
            for n in range(1, SURAHS + 1) if not (f / f"{n:03}.json").exists()]


EMPTY_RECITE = re.compile(r"\bRECITE_URL\s*:\s*(''|\"\"|``)?")


def recite_url_set(root):
    path = root / "app.js"
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    return ["app.js: RECITE_URL is not empty" for empty in EMPTY_RECITE.findall(text) if not empty]


def sw_assets(root):
    text = (root / "sw.js").read_text(encoding="utf-8")
    m = re.search(r"STATIC_ASSETS\s*=\s*\[(.*?)\]", text, re.S)
    if not m:
        return []
    return re.findall(r"""['"]([^'"]+)['"]""", m.group(1))


def manifest_icons(root):
    data = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    return [icon["src"] for icon in data.get("icons", []) if "src" in icon]


def html_refs(root):
    parser = RefCollector()
    parser.feed((root / "index.html").read_text(encoding="utf-8"))
    return parser.refs


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: check_release.py <release_dir>")
    root = Path(sys.argv[1]).resolve()
    absent = [name for name in REQUIRED if not (root / name).is_file()]
    if absent:
        for name in absent:
            print(f"missing required: {name}")
        sys.exit(1)
    sources = [
        ("sw.js", sw_assets(root)),
        ("manifest.json", manifest_icons(root)),
        ("manifest.json start_url", manifest_start(root)),
        ("index.html", html_refs(root)),
    ]
    checked = set()
    missing = []
    for source, refs in sources:
        for ref in refs:
            if not is_local(ref):
                continue
            path = unquote(urlsplit(ref).path).lstrip("/")
            key = (source, path)
            if key in checked:
                continue
            checked.add(key)
            if not (root / path).exists():
                missing.append(f"{source}: {ref}")
    missing += tafsir_missing(root)
    missing += recite_url_set(root)
    for line in missing:
        print(line)
    print(f"checked: {len(checked)}  missing: {len(missing)}")
    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()

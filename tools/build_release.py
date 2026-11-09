import shutil
import sys
from pathlib import Path

PAGE = "سراج_المدينة.html"
FILES = ["records_io.js", "app.js", "styles.css", "sw.js", "quran-data.js", "manifest.json"]
DIRS = ["fonts", "data"]
FIXES = [
    ("sw.js", f"'./{PAGE}'", "'./index.html'"),
    ("manifest.json", f'"./{PAGE}"', '"./index.html"'),
]


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: build_release.py <src_dir> <out_dir>")
    src = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    if out.exists():
        sys.exit(f"exists: {out}")
    out.mkdir(parents=True)
    shutil.copy2(src / PAGE, out / "index.html")
    for name in FILES:
        shutil.copy2(src / name, out / name)
    for name in DIRS:
        shutil.copytree(src / name, out / name, ignore=shutil.ignore_patterns("*.py", "__pycache__"))
    for name, old, new in FIXES:
        path = out / name
        text = path.read_bytes().decode("utf-8")
        count = text.count(old)
        if count != 1:
            sys.exit(f"{name}: expected 1 match, found {count}")
        path.write_bytes(text.replace(old, new).encode("utf-8"))
    print(f"built: {out}")


if __name__ == "__main__":
    main()

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CHECK = Path(__file__).resolve().parent.parent / "tools" / "check_release.py"


def make_release(root, start="./index.html", icon=True, tafsir=True, recite="''"):
    (root / "index.html").write_text('<link rel="manifest" href="manifest.json">', encoding="utf-8")
    (root / "sw.js").write_text("const STATIC_ASSETS = ['./index.html'];", encoding="utf-8")
    (root / "app.js").write_text(f"const CONFIG = {{\n  RECITE_URL: {recite},\n}};", encoding="utf-8")
    manifest = {"start_url": start, "icons": [{"src": "icon.png"}]}
    (root / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    if icon:
        (root / "icon.png").write_bytes(b"")
    if tafsir:
        folder = root / "data" / "tafsir" / "t"
        folder.mkdir(parents=True)
        for n in range(1, 115):
            (folder / f"{n:03}.json").write_text("{}", encoding="utf-8")


def run_check(**kwargs):
    with tempfile.TemporaryDirectory() as tmp:
        make_release(Path(tmp), **kwargs)
        return subprocess.run([sys.executable, "-I", str(CHECK), tmp], capture_output=True).returncode


class CheckReleaseTest(unittest.TestCase):
    def test_valid_passes(self):
        self.assertEqual(run_check(), 0)

    def test_broken_start_url_fails(self):
        self.assertEqual(run_check(start="./missing.html"), 1)

    def test_missing_icon_fails(self):
        self.assertEqual(run_check(icon=False), 1)

    def test_missing_tafsir_fails(self):
        self.assertEqual(run_check(tafsir=False), 1)

    def test_recite_url_set_fails(self):
        self.assertEqual(run_check(recite="'http://localhost:3000/'"), 1)


if __name__ == "__main__":
    unittest.main()

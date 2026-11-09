#!/usr/bin/env python3
"""جرد الشرطة السفلية في ملفات التفسير — قراءة فقط."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "tafsir"


def inventory(folder):
    files_with = 0
    total = 0
    odd = []
    for path in sorted(folder.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        ayahs = data.get("ayahs")
        if not isinstance(ayahs, dict):
            sys.exit(f"بنية غير متوقعة: {path}")
        file_count = 0
        for num, text in ayahs.items():
            n = text.count("_")
            file_count += n
            if n % 2:
                odd.append(f"{data['surah']}:{num} ({n})")
        if file_count:
            files_with += 1
        total += file_count
    print(f"== {folder.name}")
    print(f"ملفات فيها _: {files_with}")
    print(f"مرات الظهور: {total}")
    print(f"آيات بعدد فردي: {len(odd)}")
    for item in odd:
        print("  " + item)


for folder in sorted(p for p in ROOT.iterdir() if p.is_dir()):
    inventory(folder)

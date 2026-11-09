#!/usr/bin/env python3
"""مواضع علامات الحاشية ¬ و¥ في آية واحدة — قراءة فقط."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "tafsir"
SPAN = 20

if len(sys.argv) != 4:
    sys.exit("usage: marker_context.py <source> <surah> <ayah>")
source, surah, ayah = sys.argv[1], int(sys.argv[2]), sys.argv[3]
data = json.loads((ROOT / source / f"{surah:03}.json").read_text(encoding="utf-8"))
text = data["ayahs"][ayah]
print(f"طول النص: {len(text)}")
for i, ch in enumerate(text):
    if ch in "¬¥":
        print(f"{i} {ch}: {text[max(0, i - SPAN):i]}【{ch}】{text[i + 1:i + 1 + SPAN]}")

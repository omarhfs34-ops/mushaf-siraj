"""استخراج تفسيرَي المختصر والسعدي من قاعدة مركز تفسير إلى ملف JSON لكل سورة.

يقرأ القاعدة للقراءة فقط، وينقل النص حرفيًا دون أي معالجة.
"""

import json
import sqlite3
import sys
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / 'data' / 'tafsir'

# الجداول والأعمدة من tafsir-mcp/src/tafsir/tools/ayah.py (الأسطر 40–43 و48–51)
SOURCES = {
    'mukhtasar_ar': 'SELECT surahNo, ayahNo, Mukhtasarar FROM QuranTafseer ORDER BY surahNo, ayahNo',
    'saadi': 'SELECT sura, aya, tafsir FROM tafsir_saadi ORDER BY sura, aya',
}


def extract(conn, source, sql):
    surahs = {}
    for surah, ayah, text in conn.execute(sql):
        ayahs = surahs.setdefault(surah, {})
        key = str(ayah)
        if key in ayahs:
            raise SystemExit(f'مفتاح مكرر في {source}: {surah}:{ayah}')
        ayahs[key] = text

    out = OUT_DIR / source
    out.mkdir(parents=True, exist_ok=False)  # يتوقف إن وُجد المجلد، فلا كتابة فوق ملفات سابقة
    total = empty = 0
    for surah, ayahs in surahs.items():
        data = {'source': source, 'surah': surah, 'ayahs': ayahs}
        with open(out / f'{surah:03d}.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        total += len(ayahs)
        empty += sum(1 for t in ayahs.values() if not (t or '').strip())
    print(f'{source}: ملفات={len(surahs)} آيات={total} فارغة={empty}')


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: extract_tafsir.py <quran.db>')
    db_path = Path(sys.argv[1]).resolve()
    conn = sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)
    try:
        for source, sql in SOURCES.items():
            extract(conn, source, sql)
    finally:
        conn.close()


if __name__ == '__main__':
    main()

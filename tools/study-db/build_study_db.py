"""Build assets/study.db: Matthew Henry's Concise Commentary + the concordance word table.

Python 3 standard library only. See README.md.

  python3 build_study_db.py --mhcc-zip MHCC.zip --bible-db ../../assets/bible.db \
      --out ../../assets/study.db --fetched 2026-11-20
"""

import argparse
import hashlib
import os
import sqlite3
import sys

from osis_html import osis_to_html
from sword_zcom import kjv_chapter_verses, read_zcom

MHCC_ZIP_URL = 'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHCC.zip'
MHCC_MODINFO_URL = 'https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=MHCC'
MHCC_ZIP_SHA256 = '9ecb80991ca1d0daac326f32059491bfb305f1118471fc07ed860ff6df7f5ac2'
CREDIT = ("Matthew Henry's Concise Commentary. Text: Christian Classics Ethereal Library "
          "via CrossWire Bible Society. Public domain.")

SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE commentary (
    book_code TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse_start INTEGER NOT NULL,
    verse_end INTEGER NOT NULL,
    html TEXT NOT NULL,
    PRIMARY KEY (book_code, chapter, verse_start)
) WITHOUT ROWID;
CREATE TABLE concordance_words (
    translation_code TEXT NOT NULL,
    word TEXT NOT NULL,
    verse_count INTEGER NOT NULL,
    occurrence_count INTEGER NOT NULL,
    PRIMARY KEY (translation_code, word)
) WITHOUT ROWID;
"""


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--mhcc-zip', required=True)
    ap.add_argument('--bible-db', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--fetched', required=True, help='date the zip was downloaded (YYYY-MM-DD)')
    args = ap.parse_args()

    zip_sha = sha256_file(args.mhcc_zip)
    if zip_sha != MHCC_ZIP_SHA256:
        sys.exit('MHCC.zip sha256 %s does not match the recorded %s' % (zip_sha, MHCC_ZIP_SHA256))
    bible_sha = sha256_file(args.bible_db)

    bible = sqlite3.connect('file:' + args.bible_db + '?mode=ro', uri=True)
    book_codes = {order: code for order, code in bible.execute('SELECT order_index, code FROM books')}
    if sorted(book_codes) != list(range(1, 67)):
        sys.exit('bible.db books are not order_index 1..66')

    notes, stats = read_zcom(args.mhcc_zip, args.bible_db)
    print('MHCC: %d notes; header entries %d; headers with text: %s; notes repeating the previous '
          "chapter's last entry: %d" % (len(notes), stats['header_entries'],
                                         ', '.join(stats['headers_with_text']) or 'none',
                                         stats['repeats_previous_chapter_last']))

    # A note covers its own verses plus any following verses that have no entry of their own,
    # up to the next note or the end of the chapter (e.g. MHCC keys its John 3:1-21 text to
    # 3:1-8 and leaves 3:9-21 empty). Every chapter's first note starts at verse 1.
    chapter_verses = kjv_chapter_verses(args.bible_db)
    extended = 0
    for i, n in enumerate(notes):
        nxt = notes[i + 1] if i + 1 < len(notes) else None
        if nxt and (nxt['book'], nxt['chapter']) == (n['book'], n['chapter']):
            last = nxt['verse_start'] - 1
        else:
            last = chapter_verses[n['book'] - 1][n['chapter'] - 1]
        if last < n['verse_end']:
            sys.exit('overlapping notes at book %d chapter %d' % (n['book'], n['chapter']))
        if last > n['verse_end']:
            extended += 1
            n['verse_end'] = last
    print('notes extended over following verses without an entry: %d' % extended)

    if os.path.exists(args.out):
        os.remove(args.out)
    out = sqlite3.connect(args.out)
    out.execute('PRAGMA journal_mode=DELETE')
    out.executescript(SCHEMA)
    with out:
        for n in notes:
            html = osis_to_html(n['osis'])
            if not html:
                sys.exit('empty note at book %d %d:%d' % (n['book'], n['chapter'], n['verse_start']))
            out.execute('INSERT INTO commentary VALUES (?, ?, ?, ?, ?)',
                        (book_codes[n['book']], n['chapter'], n['verse_start'], n['verse_end'], html))
    print('commentary rows: %d' % out.execute('SELECT COUNT(*) FROM commentary').fetchone()[0])

    # Concordance word table from the bundled FTS5 index (unicode61 tokens, no stemming).
    bible.execute('CREATE VIRTUAL TABLE temp.vi USING fts5vocab(main, verses_fts, instance)')
    rows = bible.execute(
        """SELECT t.code, vi.term, COUNT(DISTINCT vi.doc), COUNT(*)
           FROM temp.vi
           JOIN verses v ON v.id = vi.doc
           JOIN translations t ON t.id = v.translation_id
           WHERE v.chapter >= 1
           GROUP BY t.code, vi.term"""
    ).fetchall()
    bible.close()
    with out:
        out.executemany('INSERT INTO concordance_words VALUES (?, ?, ?, ?)', rows)
    for code, words in out.execute('SELECT translation_code, COUNT(*) FROM concordance_words '
                                   'GROUP BY translation_code ORDER BY translation_code'):
        print('concordance %s: %d words' % (code, words))

    meta = {
        'schema_version': '1',
        'mhcc_module': 'MHCC',
        'mhcc_version': '2.0 (2021-02-14)',
        'mhcc_license': 'Public Domain',
        'mhcc_source_url': MHCC_ZIP_URL,
        'mhcc_modinfo_url': MHCC_MODINFO_URL,
        'mhcc_zip_sha256': zip_sha,
        'mhcc_fetched': args.fetched,
        'concordance_source_bible_db_sha256': bible_sha,
        'credit': CREDIT,
    }
    with out:
        out.executemany('INSERT INTO meta VALUES (?, ?)', sorted(meta.items()))

    out.execute('PRAGMA journal_mode=DELETE')
    out.execute('VACUUM')
    result = out.execute('PRAGMA integrity_check').fetchone()[0]
    out.close()
    if result != 'ok':
        sys.exit('integrity_check: %s' % result)
    with open(args.out, 'rb') as f:
        header = f.read(100)
    if header[18] != 1 or header[19] != 1:
        sys.exit('file format bytes 18/19 are %d/%d, expected 1/1 (rollback journal)' % (header[18], header[19]))
    print('integrity_check: ok; journal header bytes 18/19 = 1/1')
    print('%s: %d bytes, sha256 %s' % (args.out, os.path.getsize(args.out), sha256_file(args.out)))


if __name__ == '__main__':
    main()

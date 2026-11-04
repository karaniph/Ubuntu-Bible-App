#!/usr/bin/env python3
"""Append the Berean Standard Bible (ENG-BSB) to a copy of the shipped bible.db.

Usage: build_bsb.py --txt bsb.txt --base base_bible.db --out new_bible.db --fetched YYYY-MM-DD

Source: the publisher's official https://bereanbible.com/bsb.txt (see bsb_source.py for the
exact parse rules). Verse text = whitespace-normalised text, nothing else changed; empty
(omitted) verses are dropped. Existing rows are never touched: --out starts as a byte copy of
--base and BSB rows are only appended (new translation id, new verse ids in canonical order).
"""
import argparse
import hashlib
import shutil
import sqlite3
import sys

from bsb_source import parse_official

CODE, NAME, VERSION = 'ENG-BSB', 'Berean Standard Bible (BSB)', '3'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--txt', required=True)
    ap.add_argument('--base', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--fetched', required=True)
    a = ap.parse_args()

    verses, blanks = parse_official(a.txt)
    print('parsed %d verses, dropped %d empty: %s' % (len(verses), len(blanks), ', '.join('%s %d:%d' % k for k in blanks)))
    print('source sha256', hashlib.sha256(open(a.txt, 'rb').read()).hexdigest())
    shutil.copyfile(a.base, a.out)
    db = sqlite3.connect(a.out)
    books = {c: (i, o) for i, c, o in db.execute('SELECT id, code, order_index FROM books')}
    if len(books) != 66:
        sys.exit('expected 66 books, found %d' % len(books))
    unknown = {v[0] for v in verses} - set(books)
    if unknown:
        sys.exit('unknown book codes in source: %s' % sorted(unknown))
    if db.execute('SELECT 1 FROM translations WHERE code=?', (CODE,)).fetchone():
        sys.exit('%s already present in base' % CODE)
    if any(not v[3] for v in verses):
        sys.exit('empty verse text in source')
    if len({(v[0], v[1], v[2]) for v in verses}) != len(verses):
        sys.exit('duplicate book/chapter/verse in source')
    verses.sort(key=lambda v: (books[v[0]][1], v[1], v[2]))

    with db:
        tid = db.execute('INSERT INTO translations (code, name) VALUES (?, ?)', (CODE, NAME)).lastrowid
        db.executemany(
            'INSERT INTO verses (translation_id, book_id, chapter, verse, text) VALUES (?,?,?,?,?)',
            [(tid, books[b][0], c, v, t) for b, c, v, t in verses])
        db.execute("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')")
        db.execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bible_text_version', ?)", (VERSION,))
        db.execute(
            "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('bible_text_source', ?)",
            ('eBible.org VPL (public domain) for ASV, KJV, WEB, Webster, YLT, Darby; '
             'Berean Standard Bible from the official bereanbible.com bsb.txt (3rd printing, public domain), fetched %s'
             % a.fetched,))
    db.execute("INSERT INTO verses_fts(verses_fts) VALUES('integrity-check')")
    db.commit()
    db.execute('VACUUM')
    ok = db.execute('PRAGMA integrity_check').fetchone()[0]
    print('inserted %d BSB verses as translation id %d; integrity_check=%s' % (len(verses), tid, ok))
    db.close()
    if ok != 'ok':
        sys.exit(1)


if __name__ == '__main__':
    main()

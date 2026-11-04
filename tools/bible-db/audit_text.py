#!/usr/bin/env python3
"""Audit verse text in a bible.db for known damage classes.

Usage: audit_text.py bible.db [--translation CODE] [--show N]
Prints a count per class per translation, with sample verses. It is a report
(exit 0): some classes legitimately occur (e.g. digits in BSB numbers), so read the samples.
"""
import argparse
import collections
import re
import sqlite3

CLASSES = {
    'fused CAPS+lowercase (e.g. LORDsaid)': re.compile(r'\b[A-Z]{3,}[a-z]+'),
    'lowercase+CAPS (e.g. saidLORD)': re.compile(r'[a-z][A-Z]{2,}'),
    'missing space after punctuation': re.compile(r'[a-z][,;:!?][A-Za-z]|[a-z]\.[A-Z]'),
    'markup/brackets/escape residue': re.compile(r'[<>\[\]{}\\]|&\w+;|&#|\bFI\b|\bFR\b|\bRF\b'),
    'digits inside text': re.compile(r'\d'),
    'double spaces': re.compile(r'  '),
    'leading/trailing space': re.compile(r'^\s|\s$'),
    'Hebrew/Greek letters': re.compile(r'[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff]'),
    'space before punctuation': re.compile(r' [,;:.!?]'),
    'duplicated phrase (3+ words repeated)': re.compile(r'\b((?:\w+[\s,;:.]+){3,}?)\1', re.I),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('db')
    ap.add_argument('--translation')
    ap.add_argument('--show', type=int, default=3)
    a = ap.parse_args()
    db = sqlite3.connect('file:%s?mode=ro' % a.db, uri=True)
    for tid, code in db.execute('SELECT id, code FROM translations ORDER BY id').fetchall():
        if a.translation and code != a.translation:
            continue
        rows = db.execute('''SELECT b.code, v.chapter, v.verse, v.text FROM verses v
                             JOIN books b ON b.id=v.book_id WHERE v.translation_id=?
                             ORDER BY b.order_index, v.chapter, v.verse''', (tid,)).fetchall()
        hits = collections.defaultdict(list)
        for i, (b, c, v, t) in enumerate(rows):
            if not t.strip():
                hits['empty text'].append((b, c, v, t))
            for name, rx in CLASSES.items():
                if rx.search(t):
                    hits[name].append((b, c, v, t))
            # A verse containing the start of the next verse in the same chapter.
            if i + 1 < len(rows) and rows[i + 1][0] == b and rows[i + 1][1] == c:
                n = rows[i + 1][3]
                if len(n) >= 40 and n[:40] in t:
                    hits['verse contains next verse text'].append((b, c, v, t))
        print('== %s (%d verses)' % (code, len(rows)))
        for name in ['empty text', 'verse contains next verse text', *CLASSES]:
            h = hits.get(name, [])
            print('  %-42s %6d' % (name, len(h)))
            for b, c, v, t in h[:a.show]:
                print('      %s %d:%d %s' % (b, c, v, t[:110]))


if __name__ == '__main__':
    main()

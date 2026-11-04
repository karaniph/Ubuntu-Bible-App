#!/usr/bin/env python3
"""Compare the BSB in a bible.db with the publisher's official text download.

Usage: compare_official.py bible.db bsb.txt [--show N]   (run from tools/bible-db or with it on sys.path)
bsb.txt is https://bereanbible.com/bsb.txt, the PRIMARY source. Zero differences are expected. Reports verses present on
one side only and verses whose wording differs (first differing context shown).
"""
import argparse
import sqlite3
import sys

from bsb_source import parse_official

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('db')
    ap.add_argument('txt')
    ap.add_argument('--show', type=int, default=10)
    a = ap.parse_args()
    db = sqlite3.connect('file:%s?mode=ro' % a.db, uri=True)
    verses, blanks = parse_official(a.txt)
    off = {(b, ch, v): t for b, ch, v, t in verses}
    print('official file: %d verses with text, %d blank (omitted): %s' % (len(off), len(blanks), ', '.join('%s %d:%d' % k for k in blanks)))
    mine = {(b, c, v): t for b, c, v, t in db.execute(
        '''SELECT b.code, v.chapter, v.verse, v.text FROM verses v JOIN books b ON b.id=v.book_id
           JOIN translations t ON t.id=v.translation_id WHERE t.code='ENG-BSB' ''')}
    only_off = sorted(set(off) - set(mine))
    only_mine = sorted(set(mine) - set(off))
    diff = [k for k in sorted(set(off) & set(mine)) if off[k] != mine[k]]
    print('official verses=%d  db BSB verses=%d' % (len(off), len(mine)))
    print('only in official (%d): %s' % (len(only_off), only_off[:a.show]))
    print('only in db (%d): %s' % (len(only_mine), only_mine[:a.show]))
    print('wording differs (%d)' % len(diff))
    for k in diff[:a.show]:
        x, y = off[k], mine[k]
        i = next((n for n, (p, q) in enumerate(zip(x, y)) if p != q), min(len(x), len(y)))
        print('  %s %d:%d official=...%r db=...%r' % (k + (x[max(0, i - 25):i + 25], y[max(0, i - 25):i + 25])))
    sys.exit(1 if (only_off or only_mine or diff) else 0)


if __name__ == '__main__':
    main()

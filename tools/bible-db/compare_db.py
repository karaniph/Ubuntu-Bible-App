#!/usr/bin/env python3
"""Prove a built bible.db against the BSB source and against a base bible.db.

Usage: compare_db.py --new assets/bible.db --base origin_master_bible.db --txt bsb.txt [--xml engbsb_vpl.xml]

Checks: every base row of translations/books/verses is identical in --new (same ids,
byte-for-byte text); BSB rows equal the parsed official bsb.txt exactly (zero diff; eBible XML only reported as info); BSB chapter counts equal
the KJV's; lists KJV verses absent from the BSB; BSB ids are appended after all base ids
in canonical order; FTS integrity; meta values. Exit 1 on any failure.
"""
import argparse
import sqlite3
import sys
import re

from bsb_source import parse_ebible, parse_official


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--new', required=True)
    ap.add_argument('--base', required=True)
    ap.add_argument('--txt', required=True, help='official bereanbible.com bsb.txt (primary source)')
    ap.add_argument('--xml', help='eBible engbsb_vpl.xml (informational cross-check only)')
    a = ap.parse_args()
    new = sqlite3.connect('file:%s?mode=ro' % a.new, uri=True)
    base = sqlite3.connect('file:%s?mode=ro' % a.base, uri=True)
    fails = []

    def check(label, ok, detail=''):
        print('%s %s %s' % ('PASS' if ok else 'FAIL', label, detail))
        if not ok:
            fails.append(label)

    # 1. existing rows untouched
    for tbl, cols in (('translations', 'id, code, name'), ('books', 'id, code, name, order_index')):
        b = base.execute('SELECT %s FROM %s ORDER BY id' % (cols, tbl)).fetchall()
        n = new.execute('SELECT %s FROM %s WHERE id <= ? ORDER BY id' % (cols, tbl), (max(r[0] for r in b),)).fetchall()
        check('base %s rows identical' % tbl, b == n, '(%d rows)' % len(b))
    max_base = base.execute('SELECT MAX(id) FROM verses').fetchone()[0]
    nb = base.execute('SELECT COUNT(*) FROM verses').fetchone()[0]
    cur_b = base.execute('SELECT id,translation_id,book_id,chapter,verse,text FROM verses ORDER BY id')
    cur_n = new.execute('SELECT id,translation_id,book_id,chapter,verse,text FROM verses WHERE id<=? ORDER BY id', (max_base,))
    same, cnt = True, 0
    for x, y in zip(cur_b, cur_n):
        cnt += 1
        if x != y or x[5].encode() != y[5].encode():
            same = False
            print('  differs at id', x[0])
            break
    check('base verses identical (id, fk, chapter, verse, bytes of text)', same and cnt == nb, '(%d rows)' % cnt)
    check('no rows added inside base id range', new.execute('SELECT COUNT(*) FROM verses WHERE id<=?', (max_base,)).fetchone()[0] == nb)

    # 2. BSB vs source
    tid, name = new.execute("SELECT id, name FROM translations WHERE code='ENG-BSB'").fetchone()
    check('BSB name', name == 'Berean Standard Bible (BSB)', name)
    check('BSB is highest translation id', tid == new.execute('SELECT MAX(id) FROM translations').fetchone()[0], 'id=%d' % tid)
    src, blanks = parse_official(a.txt)
    print('official omitted (blank) verses: %s' % ', '.join('%s %d:%d' % k for k in blanks))
    rows = new.execute('''SELECT v.id, b.code, v.chapter, v.verse, v.text FROM verses v JOIN books b ON b.id=v.book_id
                          WHERE v.translation_id=? ORDER BY v.id''', (tid,)).fetchall()
    check('BSB verse count == official source', len(rows) == len(src), '%d vs %d' % (len(rows), len(src)))
    check('BSB text/refs equal official source exactly', sorted((r[1], r[2], r[3], r[4]) for r in rows) == sorted(src))
    ids = [r[0] for r in rows]
    check('BSB ids new, contiguous after base max, increasing', ids == list(range(max_base + 1, max_base + 1 + len(ids))))
    order = {c: o for c, o in new.execute('SELECT code, order_index FROM books')}
    keys = [(order[r[1]], r[2], r[3]) for r in rows]
    check('BSB ids in canonical order', keys == sorted(keys))

    # 3. versus KJV
    kid = new.execute("SELECT id FROM translations WHERE code='ENG-KJV'").fetchone()[0]

    def maxch(t):
        return dict(new.execute('''SELECT b.code, MAX(v.chapter) FROM verses v JOIN books b ON b.id=v.book_id
                    WHERE v.translation_id=? GROUP BY b.code''', (t,)))

    def chapters(t):
        return set(new.execute('''SELECT DISTINCT b.code, v.chapter FROM verses v JOIN books b ON b.id=v.book_id
                    WHERE v.translation_id=? AND v.chapter>0''', (t,)))
    check('66 books present in BSB', len(maxch(tid)) == 66)
    check('per-book chapter counts equal KJV', maxch(tid) == maxch(kid))
    check('every (book, chapter) equal KJV', chapters(tid) == chapters(kid))
    # Four older translations also carry 65 'chapter 0' rows (book title lines, e.g. EXO 0:26); the BSB source has none.
    print('KJV chapter-0 title rows (not Bible text, not compared):', new.execute('SELECT COUNT(*) FROM verses WHERE translation_id=? AND chapter=0', (kid,)).fetchone()[0])
    kj = set(new.execute('''SELECT b.code, v.chapter, v.verse FROM verses v JOIN books b ON b.id=v.book_id WHERE v.translation_id=? AND v.chapter>0''', (kid,)))
    bs = {(r[1], r[2], r[3]) for r in rows}
    miss = sorted(kj - bs, key=lambda k: (order[k[0]], k[1], k[2]))
    extra = sorted(bs - kj, key=lambda k: (order[k[0]], k[1], k[2]))
    print('KJV verses=%d BSB verses=%d' % (len(kj), len(bs)))
    print('In KJV but absent in BSB (%d): %s' % (len(miss), ', '.join('%s %d:%d' % k for k in miss)))
    check('KJV-only verses == official blank verses', set(miss) == {(b, c, v) for b, c, v in blanks}, '(%d)' % len(miss))
    print('In BSB but absent in KJV (%d): %s' % (len(extra), ', '.join('%s %d:%d' % k for k in extra)))

    # 4. structure / meta
    for r in new.execute('SELECT key, value FROM app_meta'):
        print('  app_meta', r)
    check('bible_text_version == 3', new.execute("SELECT value FROM app_meta WHERE key='bible_text_version'").fetchone()[0] == '3')
    names = {r[0] for r in new.execute("SELECT name FROM sqlite_master WHERE type='trigger'")}
    check('triggers verses_ai/ad/au present', {'verses_ai', 'verses_ad', 'verses_au'} <= names)
    check('schema identical to base', sorted(base.execute('SELECT type,name,sql FROM sqlite_master').fetchall(), key=str)
          == sorted(new.execute('SELECT type,name,sql FROM sqlite_master').fetchall(), key=str))
    check('integrity_check', new.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
    ro = sqlite3.connect(a.new)
    try:
        ro.execute("INSERT INTO verses_fts(verses_fts) VALUES('integrity-check')")
        check('FTS integrity-check (index matches content)', True)
    except sqlite3.DatabaseError as e:
        check('FTS integrity-check', False, str(e))
    ro.close()
    check('FTS finds BSB verse', new.execute(
        "SELECT COUNT(*) FROM verses_fts f JOIN verses v ON v.id=f.rowid WHERE verses_fts MATCH 'beginning' AND v.translation_id=?", (tid,)).fetchone()[0] > 0)
    if a.xml:
        eb = {(b, c, v): t for b, c, v, t in parse_ebible(a.xml)}
        mine = {(r[1], r[2], r[3]): r[4] for r in rows}
        diff = [k for k in mine if k in eb and eb[k] != mine[k]]
        ws = [k for k in diff if re.sub(r'\s+', '', eb[k]) == re.sub(r'\s+', '', mine[k])]
        print('INFO eBible cross-check: verses %d vs %d; only-in-db %d; only-in-ebible %d; wording/spacing differs %d '
              '(spacing-only %d, wording %d)' % (len(mine), len(eb), len(set(mine) - set(eb)), len(set(eb) - set(mine)),
                                                  len(diff), len(ws), len(diff) - len(ws)))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()

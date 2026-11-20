"""Audit assets/study.db. Prints a report and exits 1 if any check fails.

  python3 check_study_db.py --study-db ../../assets/study.db --bible-db ../../assets/bible.db \
      --mhcc-zip MHCC.zip
"""

import argparse
import hashlib
import os
import re
import sqlite3
import sys
from html.parser import HTMLParser

from osis_html import ALLOWED_OUTPUT_TAGS
from sword_zcom import raw_entry

FIXED_WORDS = ['love', 'the', 'grace', 'god']
SAMPLE_SIZE = 20
SPOT_CHECKS = [  # (label, book code, book order, chapter, verse or None for the whole chapter)
    ('Genesis 1', 'GEN', 1, 1, None),
    ('Psalm 23', 'PSA', 19, 23, None),
    ('John 3:16', 'JHN', 43, 3, 16),
    ('Romans 8', 'ROM', 45, 8, None),
]
FORBIDDEN = [re.compile(p, re.I) for p in (r'<script', r'<style', r'\son\w+\s*=', r'src\s*=', r'href\s*=', r'://')]

failures = []


def check(ok, message):
    print(('PASS ' if ok else 'FAIL ') + message)
    if not ok:
        failures.append(message)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


class _Scan(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.problems = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_OUTPUT_TAGS:
            self.problems.append('tag <%s>' % tag)
        for key, value in attrs:
            if key != 'class' or value not in ALLOWED_OUTPUT_TAGS.get(tag, set()):
                self.problems.append('attribute %s=%r on <%s>' % (key, value, tag))

    def handle_endtag(self, tag):
        if tag not in ALLOWED_OUTPUT_TAGS:
            self.problems.append('end tag </%s>' % tag)

    def handle_comment(self, data):
        self.problems.append('comment')

    def handle_decl(self, decl):
        self.problems.append('declaration')

    def handle_pi(self, data):
        self.problems.append('processing instruction')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--study-db', required=True)
    ap.add_argument('--bible-db', required=True)
    ap.add_argument('--mhcc-zip', required=True)
    args = ap.parse_args()

    study = sqlite3.connect('file:' + args.study_db + '?mode=ro', uri=True)
    bible = sqlite3.connect('file:' + args.bible_db + '?mode=ro', uri=True)

    # 1. Integrity and metadata.
    check(study.execute('PRAGMA integrity_check').fetchone()[0] == 'ok', 'study.db integrity_check ok')
    meta = dict(study.execute('SELECT key, value FROM meta'))
    for key in sorted(meta):
        print('  meta %s = %s' % (key, meta[key]))
    check(meta.get('schema_version') == '1', 'meta schema_version = 1')
    with open(args.study_db, 'rb') as f:
        header = f.read(100)
    check(header[18] == 1 and header[19] == 1, 'rollback-journal file format (header bytes 18/19 = 1/1)')

    # 2. MHCC coverage.
    rows = study.execute('SELECT COUNT(*) FROM commentary').fetchone()[0]
    books = study.execute('SELECT COUNT(DISTINCT book_code) FROM commentary').fetchone()[0]
    chapters = study.execute('SELECT COUNT(*) FROM (SELECT DISTINCT book_code, chapter FROM commentary)').fetchone()[0]
    print('MHCC rows: %d; books with notes: %d/66; chapters with notes: %d/1189' % (rows, books, chapters))
    check(rows > 0, 'commentary has rows')
    codes = {c for (c,) in bible.execute('SELECT code FROM books')}
    unknown = [c for (c,) in study.execute('SELECT DISTINCT book_code FROM commentary') if c not in codes]
    check(not unknown, 'every commentary book_code exists in bible.db (unknown: %s)' % unknown)
    bad_range = study.execute('SELECT COUNT(*) FROM commentary WHERE verse_start < 1 OR verse_end < verse_start '
                              'OR chapter < 1').fetchone()[0]
    check(bad_range == 0, 'verse ranges are valid (%d bad)' % bad_range)
    max_verse = {(b, c): v for b, c, v in bible.execute(
        "SELECT b.code, v.chapter, MAX(v.verse) FROM verses v JOIN books b ON b.id = v.book_id "
        "JOIN translations t ON t.id = v.translation_id WHERE t.code = 'ENG-KJV' AND v.chapter >= 1 "
        "GROUP BY b.code, v.chapter")}
    beyond = sum(1 for b, c, e in study.execute('SELECT book_code, chapter, verse_end FROM commentary')
                 if e > max_verse.get((b, c), 0))
    check(beyond == 0, 'every note range lies inside a KJV chapter (%d outside)' % beyond)

    # 3. Sanitiser scan.
    problems = 0
    samples = []
    for code, chapter, start, html in study.execute('SELECT book_code, chapter, verse_start, html FROM commentary'):
        scan = _Scan()
        scan.feed(html)
        scan.close()
        found = list(scan.problems) + [p.pattern for p in FORBIDDEN if p.search(html)]
        if found:
            problems += 1
            if len(samples) < 5:
                samples.append('%s %d:%d %s' % (code, chapter, start, found[:3]))
    check(problems == 0, 'sanitised HTML: allowed tags/classes only; no script, style, on*=, src=, href=, '
                         ':// (%d notes with problems %s)' % (problems, samples))
    tables = study.execute("SELECT COUNT(*) FROM commentary WHERE html LIKE '%<table%'").fetchone()[0]
    print('notes containing outline tables: %d' % tables)

    # 4. Concordance vs live FTS.
    translations = bible.execute('SELECT id, code FROM translations ORDER BY id').fetchall()
    for tid, code in translations:
        words = [w for (w,) in study.execute(
            'SELECT word FROM concordance_words WHERE translation_code = ? ORDER BY word', (code,))]
        if not words:
            check(False, '%s has concordance words' % code)
            continue
        stride = max(1, len(words) // (SAMPLE_SIZE - len(FIXED_WORDS)))
        picks = list(FIXED_WORDS) + words[stride // 2::stride][:SAMPLE_SIZE - len(FIXED_WORDS)]
        mismatches = []
        for word in picks:
            row = study.execute('SELECT verse_count, occurrence_count FROM concordance_words '
                                'WHERE translation_code = ? AND word = ?', (code, word)).fetchone()
            stored = row[0] if row else 0
            live = bible.execute(
                'SELECT COUNT(*) FROM verses_fts f CROSS JOIN verses v ON v.id = f.rowid '
                'WHERE verses_fts MATCH ? AND v.translation_id = ? AND v.chapter >= 1',
                ('"' + word + '"', tid)).fetchone()[0]
            if stored != live:
                mismatches.append('%s stored %d live %d' % (word, stored, live))
            if word in ('love', 'the'):
                print('  %s %s: verse_count %s, occurrence_count %s, live verses %d'
                      % (code, word, row[0] if row else None, row[1] if row else None, live))
        check(not mismatches, '%s: concordance verse_count equals live FTS for %d words (%s)'
              % (code, len(picks), '; '.join(mismatches) or 'all equal'))
    love = study.execute("SELECT verse_count, occurrence_count FROM concordance_words "
                         "WHERE translation_code = 'ENG-KJV' AND word = 'love'").fetchone()
    check(love == (281, 311), 'KJV "love": 281 verses, 311 occurrences (got %s)' % (love,))

    # 5. Spot checks against the raw OSIS in the zip.
    for label, code, order, chapter, verse in SPOT_CHECKS:
        print('--- %s ---' % label)
        if verse is None:
            notes = study.execute('SELECT verse_start, verse_end, html FROM commentary WHERE book_code = ? '
                                  'AND chapter = ? ORDER BY verse_start', (code, chapter)).fetchall()
        else:
            notes = study.execute('SELECT verse_start, verse_end, html FROM commentary WHERE book_code = ? '
                                  'AND chapter = ? AND verse_start <= ? AND verse_end >= ?',
                                  (code, chapter, verse, verse)).fetchall()
        check(bool(notes), '%s has a stored note' % label)
        for start, end, html in notes:
            raw = raw_entry(args.mhcc_zip, args.bible_db, order, chapter, start)
            print('stored %s %d:%d-%d: %s' % (code, chapter, start, end, html[:300]))
            print('raw OSIS %s %d:%d: %s' % (code, chapter, start, raw[:300]))
            if verse is not None and verse != start:
                own = raw_entry(args.mhcc_zip, args.bible_db, order, chapter, verse)
                print('raw OSIS %s %d:%d (own entry): %s' % (code, chapter, verse, own[:300] or '(empty)'))
            check(bool(raw.strip()), '%s %d:%d raw entry is non-empty' % (code, chapter, start))
            plain_stored = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', html)).strip()
            plain_raw = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', ' ', raw)).replace('&amp;', '&').strip()
            sample = plain_raw[-120:]
            unescaped = (plain_stored.replace('&quot;', '"').replace('&#x27;', "'")
                         .replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&'))
            check(sample in unescaped, '%s %d:%d stored text ends with the raw OSIS text' % (code, chapter, start))

    # 6. Sizes and hashes.
    print('study.db: %d bytes, sha256 %s' % (os.path.getsize(args.study_db), sha256_file(args.study_db)))
    print('bible.db: %d bytes, sha256 %s' % (os.path.getsize(args.bible_db), sha256_file(args.bible_db)))
    source = meta.get('concordance_source_bible_db_sha256')
    check(source == sha256_file(args.bible_db), 'bible.db sha256 equals the one the concordance was built from')

    study.close()
    bible.close()
    if failures:
        print('%d check(s) failed' % len(failures))
        sys.exit(1)
    print('all checks passed')


if __name__ == '__main__':
    main()

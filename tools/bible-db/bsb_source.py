"""Shared parsing of BSB source files (used by build_bsb.py and the compare scripts).

PRIMARY SOURCE (what ships): the publisher's official plain-text download
    https://bereanbible.com/bsb.txt   (Berean Standard Bible, "3rd printing" on https://berean.bible/downloads.htm)
    fetched 2026-11-04 (fetch with a browser-like User-Agent: curl -A "Mozilla/5.0 ...").
    Public domain: https://berean.bible/terms.htm
PARSE RULES (identical in spirit to the other six translations: no wording edits):
    - UTF-8 (a leading BOM is ignored); the 3 header lines are skipped.
    - A data line is  "<Book name> <chapter>:<verse>\\t<text>"  with CRLF line endings.
    - text = whitespace-normalised (runs of whitespace collapsed, trimmed). Nothing else is changed.
    - Lines whose text is empty (the 16 verses the BSB omits, which follow the critical text) are dropped.
    - Book names are mapped to USFM codes by position in the app's 66-book canon.

CROSS-CHECK SOURCE (informational only): eBible.org Verse-Per-Line XML
    https://ebible.org/Scriptures/engbsb_vpl.zip  (engbsb_vpl.xml)
"""
import re
import xml.etree.ElementTree as ET

OFFICIAL_URL = 'https://bereanbible.com/bsb.txt'
EBIBLE_URL = 'https://ebible.org/Scriptures/engbsb_vpl.zip'

NAMES = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
         '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalm', 'Proverbs',
         'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
         'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
         'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
         'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus',
         'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']
USFM = ['GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH',
        'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON',
        'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
        'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN',
        'JUD', 'REV']
BOOK_CODE = dict(zip(NAMES, USFM))
assert len(NAMES) == len(USFM) == 66


def norm(s):
    return ' '.join(s.split())


def parse_official(path):
    """Return (verses, blanks): verses = [(usfm, ch, v, text)], blanks = [(usfm, ch, v)] omitted verses."""
    verses, blanks = [], []
    with open(path, encoding='utf-8-sig', newline='') as f:
        for line in f.read().split('\n'):
            m = re.match(r'^(.+?) (\d+):(\d+)\t(.*)$', line.rstrip('\r'))
            if not m or m.group(1) not in BOOK_CODE:
                continue
            key = (BOOK_CODE[m.group(1)], int(m.group(2)), int(m.group(3)))
            text = norm(m.group(4))
            (verses if text else blanks).append(key + (text,) if text else key)
    return verses, blanks


def parse_ebible(path):
    return [(el.get('b'), int(el.get('c')), int(el.get('v')), norm(''.join(el.itertext())))
            for el in ET.parse(path).getroot().iter('v')]

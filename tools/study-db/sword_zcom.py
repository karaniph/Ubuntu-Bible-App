"""Read a CrossWire SWORD zCom (compressed commentary) module straight from its zip.

Python 3 standard library only. See README.md for the format and the rules used here.

File layout per testament (ot / nt) in modules/comments/zcom/<name>/:
  .bzs  12-byte entries <III: block offset in .bzz, compressed size, uncompressed size
  .bzv  10-byte entries <IIH: block number, offset inside the decompressed block, entry size
  .bzz  zlib-compressed blocks

The .bzv index is KJV-versified: entry 0 is the module header, entry 1 the testament header,
then for every book a book-header entry, and for every chapter a chapter-header entry
followed by one entry per verse (1..N).
"""

import sqlite3
import struct
import zipfile
import zlib

from osis_html import osis_to_html

OT_BOOKS = 39
NT_BOOKS = 27


def kjv_chapter_verses(bible_db_path):
    """Return [[verses in ch1, ch2, ...] for each of the 66 books in canonical order] from ENG-KJV."""
    con = sqlite3.connect('file:' + bible_db_path + '?mode=ro', uri=True)
    try:
        rows = con.execute(
            """SELECT b.order_index, v.chapter, MAX(v.verse)
               FROM verses v
               JOIN books b ON b.id = v.book_id
               JOIN translations t ON t.id = v.translation_id
               WHERE t.code = 'ENG-KJV' AND v.chapter >= 1
               GROUP BY b.order_index, v.chapter
               ORDER BY b.order_index, v.chapter"""
        ).fetchall()
    finally:
        con.close()
    books = [[] for _ in range(OT_BOOKS + NT_BOOKS)]
    for order_index, chapter, max_verse in rows:
        chapters = books[order_index - 1]
        if chapter != len(chapters) + 1:
            raise ValueError('KJV chapters are not contiguous at book %d chapter %d' % (order_index, chapter))
        chapters.append(max_verse)
    for i, chapters in enumerate(books):
        if not chapters:
            raise ValueError('KJV book %d has no chapters' % (i + 1))
    return books


class _Testament:
    def __init__(self, zf, base):
        self.zf = zf
        self.bzs = zf.read(base + '.bzs')
        self.bzv = zf.read(base + '.bzv')
        self.bzz = zf.read(base + '.bzz')
        if len(self.bzs) % 12 or len(self.bzv) % 10:
            raise ValueError('%s: index sizes are not multiples of the entry size' % base)
        self._blocks = {}

    @property
    def entry_count(self):
        return len(self.bzv) // 10

    def entry(self, index):
        """Return (block, offset, size) of .bzv entry `index`."""
        return struct.unpack_from('<IIH', self.bzv, index * 10)

    def block(self, number):
        cached = self._blocks.get(number)
        if cached is None:
            offset, comp_size, raw_size = struct.unpack_from('<III', self.bzs, number * 12)
            cached = zlib.decompress(self.bzz[offset:offset + comp_size])
            if len(cached) != raw_size:
                raise ValueError('block %d: size %d, expected %d' % (number, len(cached), raw_size))
            self._blocks[number] = cached
        return cached

    def text(self, index):
        block, offset, size = self.entry(index)
        if size == 0:
            return ''
        return self.block(block)[offset:offset + size].decode('utf-8')


def read_zcom(zip_path, bible_db_path, module='mhcc'):
    """Return (notes, stats).

    notes: list of dicts {book (1-66), chapter, verse_start, verse_end, osis}
    A note is a run of consecutive verse entries in one chapter that share the identical
    (block, offset, size) triple with size > 0. Verses with size 0 have no note.

    Header entries normally convert to empty HTML. The exceptions found in MHCC 2.0 are handled:
    - a chapter header with text (Lev 19, Ps 108: the whole chapter's note; and the five
      one-chapter books: the book introduction) is put in front of the chapter's first note,
      or becomes a note for the whole chapter when the chapter has no verse notes;
    - a book header with text (only the one-chapter books: the book title) is put in front too.
    The module and testament headers, and any book header of a multi-chapter book, must be empty.
    """
    chapter_verses = kjv_chapter_verses(bible_db_path)
    notes = []
    stats = {'header_entries': 0, 'headers_with_text': [], 'repeats_previous_chapter_last': 0}
    with zipfile.ZipFile(zip_path) as zf:
        for testament, first_book, count in (('ot', 0, OT_BOOKS), ('nt', OT_BOOKS, NT_BOOKS)):
            t = _Testament(zf, 'modules/comments/zcom/%s/%s' % (module, testament))
            books = chapter_verses[first_book:first_book + count]
            expected = 2 + sum(1 + len(chs) + sum(chs) for chs in books)
            if expected != t.entry_count:
                raise ValueError('%s: KJV versification gives %d entries, .bzv has %d'
                                 % (testament, expected, t.entry_count))
            stats[testament + '_entries'] = t.entry_count

            def header(index, label, allow_text):
                """Return the header's OSIS when it has visible text, else ''."""
                stats['header_entries'] += 1
                raw = t.text(index)
                if not osis_to_html(raw):
                    return ''
                if not allow_text:
                    raise ValueError('%s entry %d (%s) is a header but converts to non-empty HTML'
                                     % (testament, index, label))
                stats['headers_with_text'].append(label)
                return raw

            index = 0
            header(index, testament + ' module header', False)
            index += 1
            header(index, testament + ' testament header', False)
            index += 1
            previous_chapter_last = None
            for b, chapters in enumerate(books):
                book = first_book + b + 1
                prefix = header(index, 'book %d header' % book, len(chapters) == 1)
                index += 1
                for c, verse_total in enumerate(chapters):
                    chapter = c + 1
                    prefix += header(index, 'book %d chapter %d header' % (book, chapter), True)
                    index += 1
                    chapter_notes = []
                    run = None  # [triple, verse_start, verse_end]
                    for verse in range(1, verse_total + 1):
                        triple = t.entry(index)
                        index += 1
                        if verse == 1 and triple[2] and triple == previous_chapter_last:
                            stats['repeats_previous_chapter_last'] += 1
                        if triple[2] == 0:
                            if run:
                                chapter_notes.append(_note(t, book, chapter, run))
                                run = None
                            continue
                        if run and run[0] == triple:
                            run[2] = verse
                        else:
                            if run:
                                chapter_notes.append(_note(t, book, chapter, run))
                            run = [triple, verse, verse]
                    if run:
                        chapter_notes.append(_note(t, book, chapter, run))
                        previous_chapter_last = run[0]
                    else:
                        previous_chapter_last = None
                    if prefix:
                        if chapter_notes:
                            chapter_notes[0]['osis'] = prefix + chapter_notes[0]['osis']
                        else:
                            chapter_notes.append({'book': book, 'chapter': chapter, 'verse_start': 1,
                                                  'verse_end': verse_total, 'osis': prefix})
                        prefix = ''
                    notes.extend(chapter_notes)
            if index != t.entry_count:
                raise ValueError('%s: walked %d entries of %d' % (testament, index, t.entry_count))
    return notes, stats


def _note(t, book, chapter, run):
    block, offset, size = run[0]
    return {
        'book': book,
        'chapter': chapter,
        'verse_start': run[1],
        'verse_end': run[2],
        'osis': t.block(block)[offset:offset + size].decode('utf-8'),
    }


def raw_entry(zip_path, bible_db_path, book, chapter, verse, module='mhcc'):
    """Return the raw OSIS stored for one verse (for spot checks)."""
    chapter_verses = kjv_chapter_verses(bible_db_path)
    if book <= OT_BOOKS:
        testament, books = 'ot', chapter_verses[:OT_BOOKS]
        rel = book - 1
    else:
        testament, books = 'nt', chapter_verses[OT_BOOKS:]
        rel = book - OT_BOOKS - 1
    index = 2
    for b in range(rel):
        index += 1 + len(books[b]) + sum(books[b])
    index += 1  # book header
    for c in range(chapter - 1):
        index += 1 + books[rel][c]
    index += 1 + (verse - 1)  # chapter header, then verses
    with zipfile.ZipFile(zip_path) as zf:
        t = _Testament(zf, 'modules/comments/zcom/%s/%s' % (module, testament))
        return t.text(index)

# tools/study-db

Scripts that build and audit `assets/study.db`, the bundled, read-only database with
Matthew Henry's Concise Commentary and the concordance word list. They are not part of the app:
electron-builder only packages `dist/main` and `dist/renderer` (plus `assets/bible.db` and
`assets/study.db` as extra resources). Python 3 standard library only (no `mod2imp` needed).

## Matthew Henry's Concise Commentary (MHCC) source

- Module zip: https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/MHCC.zip, fetched 2026-11-20
  with a browser-like User-Agent, e.g.
  `curl -sSL -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" -o MHCC.zip <url>`.
  1,773,039 bytes, sha256 `9ecb80991ca1d0daac326f32059491bfb305f1118471fc07ed860ff6df7f5ac2`
  (checked by `build_study_db.py`).
- Module page: https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=MHCC. On 2026-11-20 it showed
  Module Version 2.0 (2021-02-14), Distribution License "Public Domain", and an About text that begins
  "Matthew Henry's Concise Commentary on the Whole Bible Public Domain--Copy Freely."
- The zip's `mods.d/mhcc.conf` says `DistributionLicense=Public Domain`,
  `TextSource=https://ccel.org/ccel/h/henry/mhcc/cache/mhcc.txt`, `Versification=KJV`, `SourceType=OSIS`,
  `ModDrv=zCom`, `CompressType=ZIP`, `BlockType=BOOK`.
- CCEL note: CrossWire built version 2.0 from CCEL's file. CCEL marks its Matthew Henry files
  "Public domain. May be copied and distributed freely." Its site-wide copyright page asks people to
  contact CCEL before republishing or commercial use of CCEL editions. Bible App is free and has no ads;
  retyping a public-domain book adds no new copyright under US law. The app credits
  "Matthew Henry's Concise Commentary. Text: Christian Classics Ethereal Library via CrossWire Bible
  Society. Public domain." (Settings > About, `CREDITS`, README).

### zCom decoding (`sword_zcom.py`)

Read straight from the zip: `modules/comments/zcom/mhcc/{ot,nt}.{bzs,bzv,bzz}`.
- `.bzs`: 12-byte entries `<III` (offset in `.bzz`, compressed size, uncompressed size).
  `.bzv`: 10-byte entries `<IIH` (block, offset in the decompressed block, size).
  `.bzz`: zlib blocks, each decompressed once and cached.
- Versification is KJV. Per testament the `.bzv` order is: module header, testament header, then per book a
  book header, then per chapter a chapter header followed by verses 1..N. N per chapter comes from
  `assets/bible.db`, translation `ENG-KJV`, `chapter >= 1`. The totals must equal the index sizes:
  OT 24,115 and NT 8,246 entries.
- A note is a run of consecutive verse entries in one chapter with the identical (block, offset, size) and
  size > 0; that gives `verse_start..verse_end`. Size-0 verses have no entry of their own.
  No note repeats the previous chapter's last entry (the build prints the count: 0).
- Header entries convert to empty HTML, with these exceptions in MHCC 2.0, which the build handles and
  prints: the chapter headers of Leviticus 19 and Psalm 108 hold the whole chapter's note (their verses are
  empty), and in the five one-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) the book header holds
  the book title and the chapter header the book introduction. Such header text is put in front of the
  chapter's first note, or becomes a note for the whole chapter when the chapter has no verse notes. The
  module and testament headers, and the book header of any multi-chapter book, must be empty or the build fails.
- Coverage: after the run detection, a note also covers the following verses that have no entry of their own,
  up to the next note or the end of the chapter (141 notes extended). Example: MHCC keys its John 3:1-21
  text (which includes 3:16) to 3:1-8 and leaves 3:9-21 empty; the stored range is 3:1-21. Every chapter's
  first note starts at verse 1, so every KJV verse is covered by exactly one note.

### OSIS to HTML (`osis_html.py`)

Strict converter for the tags the module uses (inventory: `div` milestones, `chapter`, `milestone`, `title`,
`hi type="bold"`, `reference`, `table`/`row`/`cell`; the only entity is `&amp;`; no URLs in the text).
- `div` type `x-p` or `introduction` (sID or eID) is a paragraph break (a space inside a heading or table).
  `div` types `x-milestone` and `book`, `chapter` and `milestone` are dropped.
- `title` -> `<h4 class="mh-title">`, `hi type="bold"` -> `<b>`, `reference` -> `<span class="mh-ref">`
  (text only, no link), `table` -> `<table class="mh-outline">`, `row` -> `<tr>`, `cell` -> `<td>`.
- Text: `html.unescape`, then `html.escape(quote=True)`; whitespace runs collapse to one space; text outside
  a table or heading is wrapped in `<p>`; empty `<p>` are removed; an open `<p>` closes before `h4`/`table`.
- Any other tag, attribute or attribute value, stray `<`/`>`, or unbalanced element raises `ValueError` and
  fails the build. The output may contain only `p h4 b span table tr td`, and no attribute except those
  `class` values. The app rebuilds it from an allow-list again (`src/renderer/lib/safeHtml.tsx`); it is
  never inserted as raw HTML.

## Concordance word list

Built from the FTS5 index of `assets/bible.db` (`verses_fts`, `unicode61` tokens, no stemming, diacritics
removed) with `fts5vocab(main, verses_fts, instance)`: per translation code and word, the number of verses
(`verse_count`) and occurrences (`occurrence_count`), counting only `chapter >= 1` (bible.db has 65 legacy
chapter-0 title rows in ASV, KJV, WEB and Webster that the reader never shows). The app's live verse lists
use the same index and the same `chapter >= 1` rule, so the counts match.
Source bible.db sha256: `3be4e040e30754222876477296c97b6404c3aac67e4bc2a17b23326a9987b0e1` (stored in
`meta.concordance_source_bible_db_sha256`).

## Schema (schema_version 1)

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE commentary (book_code TEXT NOT NULL, chapter INTEGER NOT NULL, verse_start INTEGER NOT NULL,
    verse_end INTEGER NOT NULL, html TEXT NOT NULL, PRIMARY KEY (book_code, chapter, verse_start)) WITHOUT ROWID;
CREATE TABLE concordance_words (translation_code TEXT NOT NULL, word TEXT NOT NULL, verse_count INTEGER NOT NULL,
    occurrence_count INTEGER NOT NULL, PRIMARY KEY (translation_code, word)) WITHOUT ROWID;
```

Keys are USFM book code + chapter + verse and translation code (e.g. `ENG-KJV`), never `verses.id`
or `translations.id`, because a user's bible.db can have different ids after text upgrades.

## Read-only design

- The app opens study.db in place from the install folder (`process.resourcesPath/assets/study.db`; on a
  snap that is the read-only squashfs, on Windows the MSIX install folder) and never copies it.
- The file is built with `PRAGMA journal_mode=DELETE` and VACUUMed, so header bytes 18 and 19 are 1
  (rollback journal; no `-wal`/`-shm` files are ever needed). The app opens it with better-sqlite3
  `{ readonly: true, fileMustExist: true }`, so SQLite never creates a journal, then sets
  `PRAGMA query_only = ON` as a second guard.
- The `immutable=1` URI option is not available: better-sqlite3 9.6.0 is compiled with `SQLITE_USE_URI=0`
  (`node_modules/better-sqlite3/deps/defines.gypi`) and opens without `SQLITE_OPEN_URI`, so a `file:` URI
  would be taken as a literal file name.
- If study.db is missing or fails to open, the concordance and commentary show a friendly message and the
  rest of the app works.

## Scripts

| Script | Purpose |
| --- | --- |
| `build_study_db.py --mhcc-zip MHCC.zip --bible-db ../../assets/bible.db --out ../../assets/study.db --fetched 2026-11-20` | Checks the zip sha256, decodes MHCC, converts OSIS to HTML, writes `commentary`, builds `concordance_words` from bible.db (opened read-only), writes `meta`, sets journal mode DELETE, VACUUM, integrity check, asserts header bytes 18/19 = 1. |
| `check_study_db.py --study-db ../../assets/study.db --bible-db ../../assets/bible.db --mhcc-zip MHCC.zip` | Integrity; MHCC rows and coverage; HTML sanitiser scan (allowed tags/classes only; no `<script`, `<style`, `on…=`, `src=`, `href=`, `://`); concordance `verse_count` vs live FTS for 20 words per translation (`love`, `the`, `grace`, `god` + 16 at even strides); spot checks of Genesis 1, Psalm 23, John 3:16 and Romans 8 against the raw OSIS; sizes and sha256s. Exits 1 on any failure. |
| `sword_zcom.py` | zCom reader (imported by both scripts). |
| `osis_html.py` | OSIS -> safe HTML converter (imported by both scripts). |

Run them from this folder. The full build takes 1-2 minutes here.

## Result (2026-11-20)

`check_study_db.py`: all checks passed. 4,049 commentary notes covering 66/66 books and 1,189/1,189 chapters;
792 notes contain outline tables; 0 sanitiser problems. Concordance words per translation: ASV 12,279,
BSB 14,182, DBY 13,618, KJV 12,477, YLT 12,163, WEB 12,299, Webster 12,313 (89,331 rows). KJV `love`:
281 verses, 311 occurrences; KJV `the`: 24,123 verses (chapter >= 1).

`assets/study.db`: 12,689,408 bytes, sha256 `384d85c02c4c79939a2ec26e21f0ff32e58f74c50ac1cafd313aea9946f02eda`.

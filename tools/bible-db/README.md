# tools/bible-db

Scripts that build and audit the Bible database (`assets/bible.db`). They are not part of the app:
electron-builder only packages `dist/main` and `dist/renderer` (plus `assets/bible.db` as an extra resource).
Python 3 standard library only.

## Berean Standard Bible (ENG-BSB) source

- Primary (shipped): the publisher's official download, https://bereanbible.com/bsb.txt
  ("3rd printing" per https://berean.bible/downloads.htm), fetched 2026-11-04.
  Fetch with a browser-like User-Agent, e.g. `curl -sSL -A "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0" -o bsb.txt https://bereanbible.com/bsb.txt`
  (sha256 of the fetched file: `2ac3af1de52d4e68261cba91d85c320b7eadc6560e830d99e591767b8ff5ca96`).
- Terms: https://berean.bible/terms.htm. Public domain since April 30, 2023; the Berean name may be used for the verbatim official text.
- Cross-check only: eBible.org VPL XML, https://ebible.org/Scriptures/engbsb_vpl.zip (`engbsb_vpl.xml`).
  It differs from the official text in 1,424 verses (spacing and wording), so it is not used.

Parse rules (`bsb_source.py`): UTF-8, BOM and 3 header lines ignored; each line is `Book C:V<TAB>text`;
text is whitespace-normalised (runs of whitespace collapsed, trimmed) and nothing else is changed;
verses with empty text (the 16 verses the BSB omits) are dropped, leaving 31,086 verses; book names map to the
app's USFM codes by canonical position.

## Scripts

| Script | Purpose |
| --- | --- |
| `build_bsb.py --txt bsb.txt --base <old bible.db> --out <new bible.db> --fetched YYYY-MM-DD` | Copies the base DB, appends translation `ENG-BSB` (new id, new verse ids in canonical order), rebuilds FTS, sets `app_meta` `bible_text_version` = 3 and `bible_text_source`, VACUUM, integrity check. Existing rows are never modified. |
| `compare_db.py --new <new> --base <old> --txt bsb.txt [--xml engbsb_vpl.xml]` | Proves existing rows are byte-identical (ids and text), BSB equals the official file exactly, chapter counts equal the KJV's, lists KJV verses absent in the BSB, checks schema/triggers/FTS/meta. Optional eBible numbers are informational. Exit 1 on failure. |
| `compare_official.py <bible.db> bsb.txt` | Verse-by-verse diff of the DB's BSB against the official file (expect zero). |
| `ebible_crosscheck.py bsb.txt engbsb_vpl.xml` | Categorises the official-vs-eBible differences. |
| `audit_text.py <bible.db> [--translation CODE]` | Counts damage classes per translation: empty text, verse containing the next verse, fused CAPS+lowercase, lowercase+CAPS, missing space after punctuation, markup/brackets, digits, double spaces, leading/trailing space, Hebrew/Greek letters, space before punctuation, duplicated phrases. It is a report; read the samples (e.g. digits in BSB genealogies are real numbers, and "verse contains next verse" flags repeated legal phrases). |

To get the base DB: `git show origin/master:assets/bible.db > base_bible.db`.
Run the scripts from this folder (they import `bsb_source.py`).

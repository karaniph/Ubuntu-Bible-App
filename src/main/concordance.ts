import Database from 'better-sqlite3';
import type {
    ConcordanceBookCount,
    ConcordanceLookup,
    ConcordanceVerse,
    ConcordanceVersePage,
    ConcordanceWordPage,
    StudyResult,
} from './preload';

// English concordance. The word list comes from the read-only study.db table
// concordance_words (built from the bundled Bibles' FTS5 index). Verse lists come
// from the user's bible.db FTS5 index (verses_fts, unicode61 tokens, no stemming),
// read in rowid slices with a pause between slices so a very common word ("the",
// ~24,000 KJV verses) never blocks the main process. The slice bounds are CAST to
// INTEGER because better-sqlite3 binds JS numbers as REAL, and FTS5 ignores REAL
// rowid bounds (it then decodes the word's whole doclist for every slice).
// Nothing here writes anything. Every renderer value is validated; all SQL is
// parameterised.

const MAX_WORD = 40;
const MAX_OFFSET = 1_000_000;
const WORD_PAGE = 200;
const VERSE_PAGE = 100;
const SLICE = 4_096;
const SEARCH_ERROR = "The concordance couldn't search this translation.";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isOffset(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_OFFSET;
}

/** Lower-cases and strips accents the way the unicode61 tokenizer does; null when invalid. */
export function normaliseWord(value: unknown, allowEmpty: boolean): string | null {
    if (typeof value !== 'string' || value.length > MAX_WORD) return null;
    const word = value.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    const pattern = allowEmpty ? /^[\p{L}\p{N}]*$/u : /^[\p{L}\p{N}]+$/u;
    return pattern.test(word) ? word : null;
}

function translationCode(bibleDb: Database.Database, id: number): string | null {
    const row = bibleDb.prepare('SELECT code FROM translations WHERE id = ?').get(id) as { code: string } | undefined;
    return row ? row.code : null;
}

export function listConcordanceWords(
    bibleDb: Database.Database,
    studyDb: Database.Database,
    translationId: unknown,
    prefix: unknown,
    offset: unknown,
): StudyResult<ConcordanceWordPage> {
    if (!isId(translationId)) return fail('Please choose a translation.');
    const start = normaliseWord(prefix, true);
    if (start === null) return fail('Words can only contain letters and numbers.');
    if (!isOffset(offset)) return fail('Invalid page.');
    const code = translationCode(bibleDb, translationId);
    if (!code) return fail('Please choose a translation.');
    const rows = (start
        ? studyDb.prepare(`
            SELECT word, verse_count, occurrence_count FROM concordance_words
            WHERE translation_code = ? AND word >= ? AND word < ?
            ORDER BY word LIMIT ? OFFSET ?
        `).all(code, start, start + '\u{10FFFF}', WORD_PAGE + 1, offset)
        : studyDb.prepare(`
            SELECT word, verse_count, occurrence_count FROM concordance_words
            WHERE translation_code = ?
            ORDER BY word LIMIT ? OFFSET ?
        `).all(code, WORD_PAGE + 1, offset)) as ConcordanceWordPage['words'];
    return { ok: true, value: { words: rows.slice(0, WORD_PAGE), hasMore: rows.length > WORD_PAGE } };
}

interface Entry {
    id: number;
    bookId: number;
    orderIndex: number;
    chapter: number;
    verse: number;
}

interface LookupData {
    lookup: ConcordanceLookup;
    entries: Entry[];
}

// A newer explicit lookup cancels an older one still running. The last finished
// lookup is kept so "Show more verses" and the book filter don't search again.
let generation = 0;
let cache: { translationId: number; word: string; data: LookupData } | null = null;

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

async function runLookup(
    bibleDb: Database.Database,
    studyDb: Database.Database,
    translationId: number,
    word: string,
    cancellable: boolean,
): Promise<StudyResult<LookupData>> {
    const mine = cancellable ? ++generation : 0;
    const code = translationCode(bibleDb, translationId);
    if (!code) return fail('Please choose a translation.');
    const entries: Entry[] = [];
    try {
        const slice = bibleDb.prepare(`
            SELECT v.id, v.book_id AS bookId, b.order_index AS orderIndex, v.chapter, v.verse
            FROM verses_fts fts
            CROSS JOIN verses v ON v.id = fts.rowid
            JOIN books b ON b.id = v.book_id
            WHERE verses_fts MATCH ? AND fts.rowid BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER)
              AND v.translation_id = ? AND v.chapter >= 1
        `);
        const maxRow = bibleDb.prepare('SELECT MAX(id) AS maxId FROM verses').get() as { maxId: number | null };
        const maxId = maxRow.maxId ?? 0;
        const match = '"' + word + '"';
        for (let low = 1; low <= maxId; low += SLICE) {
            const rows = slice.all(match, low, low + SLICE - 1, translationId) as Entry[];
            for (const row of rows) entries.push(row);
            await nextTurn();
            if (cancellable && mine !== generation) return fail('cancelled');
        }
    } catch (err) {
        console.error('Concordance lookup failed:', err);
        return fail(SEARCH_ERROR);
    }
    entries.sort((a, b) => a.orderIndex - b.orderIndex || a.chapter - b.chapter || a.verse - b.verse);

    const bookRows = bibleDb.prepare('SELECT id, code, name FROM books').all() as Array<{ id: number; code: string; name: string }>;
    const bookInfo = new Map(bookRows.map((b) => [b.id, b]));
    // Map insertion order follows the sorted entries, so books come out in canonical order.
    const books = new Map<number, ConcordanceBookCount>();
    for (const entry of entries) {
        const existing = books.get(entry.bookId);
        if (existing) {
            existing.verseCount += 1;
        } else {
            const info = bookInfo.get(entry.bookId);
            books.set(entry.bookId, {
                bookId: entry.bookId,
                bookCode: info ? info.code : '',
                bookName: info ? info.name : '',
                verseCount: 1,
            });
        }
    }
    const counts = studyDb.prepare(
        'SELECT occurrence_count FROM concordance_words WHERE translation_code = ? AND word = ?',
    ).get(code, word) as { occurrence_count: number } | undefined;
    const data: LookupData = {
        lookup: {
            word,
            translationId,
            verseCount: entries.length,
            occurrenceCount: counts ? counts.occurrence_count : null,
            books: Array.from(books.values()),
        },
        entries,
    };
    cache = { translationId, word, data };
    return { ok: true, value: data };
}

export async function lookupConcordance(
    bibleDb: Database.Database,
    studyDb: Database.Database,
    translationId: unknown,
    word: unknown,
): Promise<StudyResult<ConcordanceLookup>> {
    if (!isId(translationId)) return fail('Please choose a translation.');
    const clean = normaliseWord(word, false);
    if (clean === null) return fail('Words can only contain letters and numbers.');
    const result = await runLookup(bibleDb, studyDb, translationId, clean, true);
    return result.ok ? { ok: true, value: result.value.lookup } : result;
}

export async function getConcordanceVerses(
    bibleDb: Database.Database,
    studyDb: Database.Database,
    translationId: unknown,
    word: unknown,
    bookId: unknown,
    offset: unknown,
): Promise<StudyResult<ConcordanceVersePage>> {
    if (!isId(translationId)) return fail('Please choose a translation.');
    const clean = normaliseWord(word, false);
    if (clean === null) return fail('Words can only contain letters and numbers.');
    if (bookId !== null && !isId(bookId)) return fail('Invalid book.');
    if (!isOffset(offset)) return fail('Invalid page.');

    let data: LookupData;
    if (cache && cache.translationId === translationId && cache.word === clean) {
        data = cache.data;
    } else {
        // Not the last word looked up: search again without cancelling anything.
        const result = await runLookup(bibleDb, studyDb, translationId, clean, false);
        if (!result.ok) return result;
        data = result.value;
    }
    const filtered = bookId === null ? data.entries : data.entries.filter((e) => e.bookId === bookId);
    const page = filtered.slice(offset, offset + VERSE_PAGE);
    if (page.length === 0) return { ok: true, value: { verses: [], total: filtered.length, offset } };

    const placeholders = page.map(() => '?').join(',');
    const rows = bibleDb.prepare(`
        SELECT v.id, v.book_id AS bookId, b.code AS bookCode, b.name AS bookName, v.chapter, v.verse, v.text
        FROM verses v
        JOIN books b ON b.id = v.book_id
        WHERE v.id IN (${placeholders})
    `).all(...page.map((e) => e.id)) as ConcordanceVerse[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const verses = page.map((e) => byId.get(e.id)).filter((v): v is ConcordanceVerse => v !== undefined);
    return { ok: true, value: { verses, total: filtered.length, offset } };
}

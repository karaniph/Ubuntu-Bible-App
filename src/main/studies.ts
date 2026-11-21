import Database from 'better-sqlite3';
import type {
    StudyDetail,
    StudyPassage,
    StudyPassageInput,
    StudyPassageWithText,
    StudyResult,
    StudySummary,
    StudyVerse,
} from './preload';

// Bible studies live in their own two tables. Nothing here writes to the Bible text
// (translations/books/verses) or to the user's topics/highlights/reflections; those
// are only read. Every value from the renderer is validated before it reaches SQL,
// and all SQL is parameterised.

const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;
const MAX_NOTE = 20000;
const MAX_PASSAGES_PER_CALL = 50;
const MAX_NUMBER = 999;
const GENERIC_ERROR = 'Could not save your study. Please try again.';

export function ensureStudyTables(db: Database.Database) {
    db.transaction(() => {
        db.prepare(`
            CREATE TABLE IF NOT EXISTS studies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
        db.prepare(`
            CREATE TABLE IF NOT EXISTS study_passages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                study_id INTEGER NOT NULL REFERENCES studies(id),
                position INTEGER NOT NULL,
                book_code TEXT NOT NULL,
                chapter_start INTEGER NOT NULL,
                verse_start INTEGER,
                chapter_end INTEGER NOT NULL,
                verse_end INTEGER,
                note TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `).run();
        db.prepare('CREATE INDEX IF NOT EXISTS idx_study_passages_study ON study_passages(study_id, position)').run();
    })();
}

/** Runs a study write; unexpected database errors become a friendly message instead of a rejection. */
export function runStudyWrite<T>(fn: () => StudyResult<T>): StudyResult<T> {
    try {
        return fn();
    } catch (err) {
        console.error('Study write failed:', err);
        return { ok: false, error: GENERIC_ERROR };
    }
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function isId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isRefNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_NUMBER;
}

function cleanName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const name = value.trim();
    return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

function cleanDescription(value: unknown): string | null {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') return null;
    const description = value.trim();
    return description.length <= MAX_DESCRIPTION ? description : null;
}

const SUMMARY_SQL = `
    SELECT s.id, s.name, s.description, s.created_at, s.updated_at,
           (SELECT COUNT(*) FROM study_passages p WHERE p.study_id = s.id) AS passage_count
    FROM studies s
`;

function getSummary(db: Database.Database, studyId: number): StudySummary | undefined {
    return db.prepare(`${SUMMARY_SQL} WHERE s.id = ?`).get(studyId) as StudySummary | undefined;
}

function studyExists(db: Database.Database, studyId: number): boolean {
    return !!db.prepare('SELECT 1 FROM studies WHERE id = ?').get(studyId);
}

function touchStudy(db: Database.Database, studyId: number) {
    db.prepare('UPDATE studies SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(studyId);
}

export function listStudies(db: Database.Database): StudySummary[] {
    return db.prepare(`${SUMMARY_SQL} ORDER BY s.name COLLATE NOCASE, s.id`).all() as StudySummary[];
}

export function getStudy(db: Database.Database, studyId: unknown, translationId: unknown): StudyDetail | null {
    if (!isId(studyId) || !isId(translationId)) throw new Error('Invalid study or translation id');
    if (!db.prepare('SELECT 1 FROM translations WHERE id = ?').get(translationId)) {
        throw new Error('Unknown translation');
    }
    const summary = getSummary(db, studyId);
    if (!summary) return null;

    const passages = db.prepare(`
        SELECT p.*, b.id AS book_id, b.name AS book_name
        FROM study_passages p
        JOIN books b ON b.code = p.book_code
        WHERE p.study_id = ?
        ORDER BY p.position, p.id
    `).all(studyId) as Omit<StudyPassageWithText, 'verses'>[];
    const chapterVerses = db.prepare(`
        SELECT id, chapter, verse, text FROM verses
        WHERE translation_id = ? AND book_id = ? AND chapter BETWEEN ? AND ?
        ORDER BY chapter, verse
    `);
    const rangeVerses = db.prepare(`
        SELECT id, chapter, verse, text FROM verses
        WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?
        ORDER BY chapter, verse
    `);
    return {
        ...summary,
        passages: passages.map((p) => ({
            ...p,
            verses: (p.verse_start === null || p.verse_end === null
                ? chapterVerses.all(translationId, p.book_id, p.chapter_start, p.chapter_end)
                : rangeVerses.all(translationId, p.book_id, p.chapter_start, p.verse_start, p.verse_end)) as StudyVerse[],
        })),
    };
}

export function createStudy(db: Database.Database, name: unknown, description: unknown): StudyResult<StudySummary> {
    const cleanedName = cleanName(name);
    if (cleanedName === null) return fail(`Please give the study a name (up to ${MAX_NAME} characters).`);
    const cleanedDescription = cleanDescription(description);
    if (cleanedDescription === null) return fail(`The description can be up to ${MAX_DESCRIPTION} characters.`);
    const result = db.prepare('INSERT INTO studies (name, description) VALUES (?, ?)').run(cleanedName, cleanedDescription);
    return { ok: true, value: getSummary(db, Number(result.lastInsertRowid))! };
}

export function updateStudy(db: Database.Database, studyId: unknown, name: unknown, description: unknown): StudyResult<StudySummary> {
    if (!isId(studyId)) return fail('That study could not be found.');
    const cleanedName = cleanName(name);
    if (cleanedName === null) return fail(`Please give the study a name (up to ${MAX_NAME} characters).`);
    const cleanedDescription = cleanDescription(description);
    if (cleanedDescription === null) return fail(`The description can be up to ${MAX_DESCRIPTION} characters.`);
    const result = db.prepare('UPDATE studies SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(cleanedName, cleanedDescription, studyId);
    if (result.changes === 0) return fail('That study could not be found.');
    return { ok: true, value: getSummary(db, studyId)! };
}

export function deleteStudy(db: Database.Database, studyId: unknown): StudyResult<null> {
    if (!isId(studyId) || !studyExists(db, studyId)) return fail('That study could not be found.');
    // Children first (foreign keys are enforced); only this study's rows are touched.
    db.transaction(() => {
        db.prepare('DELETE FROM study_passages WHERE study_id = ?').run(studyId);
        db.prepare('DELETE FROM studies WHERE id = ?').run(studyId);
    })();
    return { ok: true, value: null };
}

interface NormalisedPassage {
    bookCode: string;
    chapterStart: number;
    chapterEnd: number;
    verseStart: number | null;
    verseEnd: number | null;
}

function normalisePassage(db: Database.Database, input: unknown): NormalisedPassage | string {
    const invalid = "Couldn't read that reference.";
    if (!input || typeof input !== 'object') return invalid;
    const { bookCode, chapterStart, chapterEnd, verseStart, verseEnd } = input as Record<string, unknown>;
    if (typeof bookCode !== 'string' || !/^[0-9A-Z]{3}$/.test(bookCode)) return invalid;
    if (!isRefNumber(chapterStart) || !isRefNumber(chapterEnd)) return invalid;
    const book = db.prepare('SELECT id, name FROM books WHERE code = ?').get(bookCode) as { id: number; name: string } | undefined;
    if (!book) return invalid;

    const lastChapter = (db.prepare('SELECT MAX(chapter) AS n FROM verses WHERE book_id = ? AND chapter >= 1')
        .get(book.id) as { n: number | null }).n ?? 0;
    const chapterMessage = (c: number) =>
        `${book.name} has ${lastChapter} chapter${lastChapter === 1 ? '' : 's'}, so chapter ${c} doesn't exist.`;

    if ((verseStart === null || verseStart === undefined) && (verseEnd === null || verseEnd === undefined)) {
        const [start, end] = chapterStart <= chapterEnd ? [chapterStart, chapterEnd] : [chapterEnd, chapterStart];
        if (start > lastChapter) return chapterMessage(start);
        return { bookCode, chapterStart: start, chapterEnd: Math.min(end, lastChapter), verseStart: null, verseEnd: null };
    }

    if (!isRefNumber(verseStart) || !isRefNumber(verseEnd) || chapterStart !== chapterEnd) return invalid;
    if (chapterStart > lastChapter) return chapterMessage(chapterStart);
    const lastVerse = (db.prepare('SELECT MAX(verse) AS n FROM verses WHERE book_id = ? AND chapter = ?')
        .get(book.id, chapterStart) as { n: number | null }).n ?? 0;
    const [start, end] = verseStart <= verseEnd ? [verseStart, verseEnd] : [verseEnd, verseStart];
    if (start > lastVerse) {
        return `${book.name} ${chapterStart} has ${lastVerse} verses, so verse ${start} doesn't exist.`;
    }
    return { bookCode, chapterStart, chapterEnd: chapterStart, verseStart: start, verseEnd: Math.min(end, lastVerse) };
}

export function addStudyPassages(db: Database.Database, studyId: unknown, passages: unknown): StudyResult<StudyPassage[]> {
    if (!isId(studyId) || !studyExists(db, studyId)) return fail('That study could not be found.');
    if (!Array.isArray(passages) || passages.length < 1 || passages.length > MAX_PASSAGES_PER_CALL) {
        return fail(`Add between 1 and ${MAX_PASSAGES_PER_CALL} passages at a time.`);
    }
    const normalised: NormalisedPassage[] = [];
    for (const input of passages) {
        const result = normalisePassage(db, input);
        if (typeof result === 'string') return fail(result);
        normalised.push(result);
    }

    const insert = db.prepare(`
        INSERT INTO study_passages (study_id, position, book_code, chapter_start, verse_start, chapter_end, verse_end)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const byId = db.prepare('SELECT * FROM study_passages WHERE id = ?');
    // One transaction: either every passage is stored or none is.
    const added = db.transaction(() => {
        const maxRow = db.prepare('SELECT MAX(position) AS n FROM study_passages WHERE study_id = ?').get(studyId) as { n: number | null };
        let position = maxRow.n ?? 0;
        const rows: StudyPassage[] = [];
        for (const p of normalised) {
            position += 1;
            const result = insert.run(studyId, position, p.bookCode, p.chapterStart, p.verseStart, p.chapterEnd, p.verseEnd);
            rows.push(byId.get(result.lastInsertRowid) as StudyPassage);
        }
        touchStudy(db, studyId);
        return rows;
    })();
    return { ok: true, value: added };
}

export function updateStudyPassageNote(db: Database.Database, passageId: unknown, note: unknown): StudyResult<{ id: number; note: string; updated_at: string }> {
    if (!isId(passageId)) return fail('That passage could not be found.');
    if (typeof note !== 'string' || note.length > MAX_NOTE) return fail(`Notes can be up to ${MAX_NOTE} characters.`);
    const result = db.prepare('UPDATE study_passages SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(note, passageId);
    if (result.changes === 0) return fail('That passage could not be found.');
    return {
        ok: true,
        value: db.prepare('SELECT id, note, updated_at FROM study_passages WHERE id = ?').get(passageId) as { id: number; note: string; updated_at: string },
    };
}

export function removeStudyPassage(db: Database.Database, passageId: unknown): StudyResult<null> {
    if (!isId(passageId)) return fail('That passage could not be found.');
    const row = db.prepare('SELECT study_id FROM study_passages WHERE id = ?').get(passageId) as { study_id: number } | undefined;
    if (!row) return fail('That passage could not be found.');
    db.transaction(() => {
        db.prepare('DELETE FROM study_passages WHERE id = ?').run(passageId);
        touchStudy(db, row.study_id);
    })();
    return { ok: true, value: null };
}

export function moveStudyPassage(db: Database.Database, passageId: unknown, direction: unknown): StudyResult<number[]> {
    if (!isId(passageId)) return fail('That passage could not be found.');
    if (direction !== 'up' && direction !== 'down') return fail('Unknown direction.');
    const row = db.prepare('SELECT study_id FROM study_passages WHERE id = ?').get(passageId) as { study_id: number } | undefined;
    if (!row) return fail('That passage could not be found.');
    const order = db.transaction(() => {
        const ids = (db.prepare('SELECT id FROM study_passages WHERE study_id = ? ORDER BY position, id').all(row.study_id) as { id: number }[])
            .map((r) => r.id);
        const index = ids.indexOf(passageId);
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= ids.length) return ids; // Already at the top/bottom.
        [ids[index], ids[target]] = [ids[target], ids[index]];
        const setPosition = db.prepare('UPDATE study_passages SET position = ? WHERE id = ?');
        ids.forEach((id, i) => setPosition.run(i + 1, id));
        touchStudy(db, row.study_id);
        return ids;
    })();
    return { ok: true, value: order };
}

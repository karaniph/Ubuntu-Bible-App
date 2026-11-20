import Database from 'better-sqlite3';
import type { CommentaryNote, StudyResult } from './preload';

// Matthew Henry's Concise Commentary, read from the bundled read-only study.db.
// Notes are keyed by book code + chapter + KJV verse range. The stored HTML was
// sanitised at build time (tools/study-db/osis_html.py) and the renderer rebuilds
// it from an allow-list again, so it is never inserted as raw HTML.

export function getCommentaryChapter(
    studyDb: Database.Database,
    bookCode: unknown,
    chapter: unknown,
): StudyResult<CommentaryNote[]> {
    if (typeof bookCode !== 'string' || !/^[0-9A-Z]{3}$/.test(bookCode)) {
        return { ok: false, error: 'Invalid book.' };
    }
    if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) {
        return { ok: false, error: 'Invalid chapter.' };
    }
    const notes = studyDb.prepare(`
        SELECT verse_start AS verseStart, verse_end AS verseEnd, html
        FROM commentary
        WHERE book_code = ? AND chapter = ?
        ORDER BY verse_start
    `).all(bookCode, chapter) as CommentaryNote[];
    return { ok: true, value: notes };
}

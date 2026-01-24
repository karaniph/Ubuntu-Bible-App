import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initDatabase() {
    // Get database path - works in both dev and packaged app
    const isDev = process.env.NODE_ENV === 'development';
    const dbPath = isDev
        ? path.join(__dirname, '../../assets/bible.db')
        : path.join(process.resourcesPath, 'assets/bible.db');

    db = new Database(dbPath, { readonly: true });
    console.log('Database connected:', dbPath);
}

export function getTranslations() {
    if (!db) return [];
    const stmt = db.prepare("SELECT id, code, name FROM translations WHERE name NOT LIKE '%sample%' ORDER BY id");
    return stmt.all();
}

export function getBooks() {
    if (!db) return [];
    const stmt = db.prepare('SELECT id, code, name, order_index FROM books ORDER BY order_index');
    return stmt.all();
}

export function getVerses(translationId: number, bookId: number, chapter: number) {
    if (!db) return [];
    const stmt = db.prepare(`
    SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
    FROM verses v
    JOIN books b ON v.book_id = b.id
    WHERE v.translation_id = ? AND v.book_id = ? AND v.chapter = ?
    ORDER BY v.verse
  `);
    return stmt.all(translationId, bookId, chapter);
}

export function searchVerses(query: string, translationId: number, limit: number = 50) {
    if (!db || !query.trim()) return [];

    // Use FTS5 if available, fallback to LIKE
    try {
        const stmt = db.prepare(`
      SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
      FROM verses_fts fts
      JOIN verses v ON fts.rowid = v.id
      JOIN books b ON v.book_id = b.id
      WHERE verses_fts MATCH ? AND v.translation_id = ?
      LIMIT ?
    `);
        return stmt.all(query, translationId, limit);
    } catch {
        // Fallback to LIKE search
        const stmt = db.prepare(`
      SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text
      FROM verses v
      JOIN books b ON v.book_id = b.id
      WHERE v.text LIKE ? AND v.translation_id = ?
      LIMIT ?
    `);
        return stmt.all(`%${query}%`, translationId, limit);
    }
}

export function getChapterCount(bookId: number, translationId: number): number {
    if (!db) return 0;
    const stmt = db.prepare(`
    SELECT MAX(chapter) as count
    FROM verses
    WHERE book_id = ? AND translation_id = ?
  `);
    const result = stmt.get(bookId, translationId) as { count: number } | undefined;
    return result?.count ?? 0;
}

export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
    }
}

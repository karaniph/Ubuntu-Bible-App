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

    db = new Database(dbPath, { readonly: false });
    console.log('Database connected:', dbPath);

    // Initialize Schema
    db.prepare(`
        CREATE TABLE IF NOT EXISTS highlights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            verse_id INTEGER NOT NULL,
            color TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (verse_id) REFERENCES verses(id),
            UNIQUE(verse_id)
        )
    `).run();
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
    // Left join highlights to get color if exists
    const stmt = db.prepare(`
    SELECT v.id, b.code as book_code, b.name as book_name, v.chapter, v.verse, v.text, h.color
    FROM verses v
    JOIN books b ON v.book_id = b.id
    LEFT JOIN highlights h ON v.id = h.verse_id
    WHERE v.translation_id = ? AND v.book_id = ? AND v.chapter = ?
    ORDER BY v.verse
  `);
    return stmt.all(translationId, bookId, chapter);
}

export function toggleHighlight(verseId: number, color: string) {
    if (!db) return null;
    const existing = db.prepare('SELECT id, color FROM highlights WHERE verse_id = ?').get(verseId) as { id: number, color: string } | undefined;

    if (existing) {
        if (existing.color === color) {
            // Remove if same color
            db.prepare('DELETE FROM highlights WHERE id = ?').run(existing.id);
            return null; // Removed
        } else {
            // Update color
            db.prepare('UPDATE highlights SET color = ? WHERE id = ?').run(color, existing.id);
            return color;
        }
    } else {
        // Insert
        db.prepare('INSERT INTO highlights (verse_id, color) VALUES (?, ?)').run(verseId, color);
        return color;
    }
}

export function getHighlights() {
    if (!db) return [];
    const stmt = db.prepare(`
        SELECT h.id, h.verse_id, h.color, h.created_at, 
               v.text, v.chapter, v.verse, v.book_id, b.name as book_name, b.code as book_code
        FROM highlights h
        JOIN verses v ON h.verse_id = v.id
        JOIN books b ON v.book_id = b.id
        ORDER BY h.created_at DESC
    `);
    return stmt.all();
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
